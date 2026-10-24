import { getContext, setContext } from "svelte";
import type { BasePoint, Path, PathListItem, Settings } from "../types";
import {
  addSegment,
  pointAt,
  removePath,
  setLines,
  updateSegment,
  type PointAddress,
} from "../model/commands";
import {
  atomicSegments,
  findPathById,
  findSegmentById,
  groupPaths,
  groupingProblem,
  insertPaths,
  movePath,
  reorderSequenceToMatch,
  segmentStartById,
  ungroupPath,
} from "../utils/pathTraversal";
import { createSegment, normalizePaths } from "../utils/normalize";
import { fitStrokeToLines } from "../lib/pen/strokeFitting";
import {
  applyOptimizedWaypoints,
  buildOptimizationPayload,
  runOptimization,
} from "../lib/optimizer/optimizer";
import { showToast } from "../lib/toast";
import type { ProjectStore } from "./project.svelte";

export type Tool = "select" | "pen" | "coordinate";

/** Inches from the field's middle third, where generated points land. */
function randomFieldCoordinate(): number {
  return 36 + Math.random() * 72;
}

function formatPathPoint(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

/** What is selected and which tool is active, plus the edits that act on them. */
export class EditorState {
  #project: ProjectStore;
  #selectedIds = $state<string[]>([]);
  #shapeId = $state<string | null>(null);
  #pointIndex = $state(0);

  tool = $state<Tool>("select");
  optimizing = $state(false);
  penStroke = $state<BasePoint[]>([]);
  coordinateHover = $state<BasePoint | null>(null);

  /** The selection, minus paths that no longer exist; falls back to the last path. */
  selectedPathIds = $derived.by(() => {
    const lines = this.#project.doc.lines;
    const present = this.#selectedIds.filter((id) => findPathById(lines, id));
    if (present.length > 0 || this.#selectedIds.length === 0) return present;
    return lines.length > 0 ? [lines[lines.length - 1].id] : [];
  });
  primarySelectedId = $derived(this.selectedPathIds.at(-1) ?? null);
  selectedPath = $derived.by(() =>
    findPathById(this.#project.doc.lines, this.primarySelectedId),
  );
  /** Only a drivable segment can have its points edited. */
  selectedLine = $derived(
    this.selectedPath?.kind === "atomic" ? this.selectedPath : null,
  );
  selectedLineId = $derived(this.selectedLine?.id ?? null);
  selectedAddress = $derived<Extract<PointAddress, { kind: "path" }> | null>(
    this.selectedLineId
      ? {
          kind: "path",
          lineId: this.selectedLineId,
          index: this.selectedPointIndex,
        }
      : null,
  );
  selectedPoint = $derived.by(() =>
    this.selectedAddress
      ? pointAt(this.#project.doc, this.selectedAddress)
      : null,
  );
  /** An obstacle, selected instead of paths. */
  selectedShape = $derived.by(
    () =>
      this.#project.doc.shapes.find((shape) => shape.id === this.#shapeId) ??
      null,
  );
  groupingBlockedReason = $derived.by(() =>
    groupingProblem(this.#project.doc.lines, this.selectedPathIds),
  );
  /** Paths and groups in list order, numbered the way the list shows them. */
  displayOrderIds = $derived.by(() => {
    const out: string[] = [];
    const walk = (nodes: Path[]) => {
      for (const node of nodes) {
        out.push(node.id);
        if (node.kind === "compound") walk(node.segments);
      }
    };
    walk(this.#project.doc.lines);
    return out;
  });
  pathListItems = $derived.by(() => {
    let segmentNumber = 0;
    let groupNumber = 0;
    const build = (nodes: Path[]): PathListItem[] =>
      nodes.map((node) => {
        if (node.kind === "compound") {
          groupNumber += 1;
          return {
            id: node.id,
            name: node.name || `Group ${groupNumber}`,
            kind: "compound" as const,
            children: build(node.segments),
          };
        }
        segmentNumber += 1;
        return {
          id: node.id,
          name: node.name || `Path ${segmentNumber}`,
          kind: "atomic" as const,
          x: formatPathPoint(node.endPoint.x),
          y: formatPathPoint(node.endPoint.y),
        };
      });
    return build(this.#project.doc.lines);
  });

  constructor(project: ProjectStore) {
    this.#project = project;
    const first = project.doc.lines[0];
    this.#selectedIds = first ? [first.id] : [];
  }

  get #lines() {
    return this.#project.doc.lines;
  }

  /** 0 is the selected segment's end point; n its nth inner point, kept in range. */
  get selectedPointIndex(): number {
    const line = this.selectedLine;
    const innerCount = line
      ? line.throughPoints?.length || line.controlPoints.length
      : 0;
    return Math.max(0, Math.min(this.#pointIndex, innerCount));
  }

  set selectedPointIndex(index: number) {
    this.#pointIndex = index;
  }

  select(ids: string[]) {
    this.#selectedIds = ids;
    this.#shapeId = null;
  }

  selectShape(id: string) {
    this.#selectedIds = [];
    this.#shapeId = id;
  }

  clearSelection() {
    this.#selectedIds = [];
    this.#shapeId = null;
  }

  selectFromList(
    id: string,
    modifiers: { additive?: boolean; range?: boolean } = {},
  ) {
    const selected = this.selectedPathIds;
    if (modifiers.range && this.primarySelectedId) {
      const from = this.displayOrderIds.indexOf(this.primarySelectedId);
      const to = this.displayOrderIds.indexOf(id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        const span = this.displayOrderIds.slice(lo, hi + 1);
        // Keep the clicked path primary so the inspector follows the cursor.
        this.select([...span.filter((entry) => entry !== id), id]);
        return;
      }
    }

    if (modifiers.additive) {
      this.select(
        selected.includes(id)
          ? selected.filter((entry) => entry !== id)
          : [...selected, id],
      );
      return;
    }

    this.select([id]);
    // Selecting a segment also moves the point editor to its endpoint.
    if (findSegmentById(this.#lines, id)) this.selectedPointIndex = 0;
  }

  /** Select a point on a segment, clamped to the points it has. */
  selectPoint(lineId: string, pointIndex = 0) {
    const line = findSegmentById(this.#lines, lineId);
    if (!line) return;
    const innerCount = line.throughPoints?.length || line.controlPoints.length;
    this.select([line.id]);
    this.selectedPointIndex = Math.max(0, Math.min(pointIndex, innerCount));
  }

  setTool(tool: Tool) {
    this.tool = this.tool === tool ? "select" : tool;
    this.penStroke = [];
    this.coordinateHover = null;
  }

  addPath() {
    const segment = createSegment(
      randomFieldCoordinate(),
      randomFieldCoordinate(),
      { reverse: true },
    );
    this.#project.apply(addSegment(segment));
    this.select([segment.id]);
    this.selectedPointIndex = 0;
  }

  addPathAt(point: BasePoint) {
    const segment = createSegment(point.x, point.y);
    this.#project.apply(addSegment(segment));
    this.select([segment.id]);
    this.selectedPointIndex = 0;
  }

  /** The drivable curve edits apply to: the selection, else the last one. */
  #targetSegment() {
    return (
      findSegmentById(this.#lines, this.selectedLineId) ??
      atomicSegments(this.#lines).at(-1) ??
      null
    );
  }

  /** Append a control point at `at`, or somewhere mid-field. */
  addControlPoint(at?: BasePoint) {
    const target = this.#targetSegment();
    if (!target) return;
    const controlPoints = [
      ...target.controlPoints,
      at ?? { x: randomFieldCoordinate(), y: randomFieldCoordinate() },
    ];
    this.#project.apply(
      updateSegment(target.id, (segment) => ({ ...segment, controlPoints })),
    );
    this.select([target.id]);
    this.selectedPointIndex = controlPoints.length;
  }

  removeControlPoint() {
    const target = this.#targetSegment();
    if (!target || target.controlPoints.length === 0) return;
    const controlPoints = target.controlPoints.slice(0, -1);
    this.#project.apply(
      updateSegment(target.id, (segment) => ({ ...segment, controlPoints })),
    );
    this.selectedPointIndex = Math.min(
      this.selectedPointIndex,
      controlPoints.length,
    );
  }

  /** Delete the selected control point, or the whole segment at its endpoint. */
  deleteSelectedPoint() {
    const line = this.selectedLine;
    if (!line) return;

    if (this.selectedPointIndex === 0) {
      const segments = atomicSegments(this.#lines);
      if (segments.length <= 1) return;
      const removedAt = segments.findIndex((segment) => segment.id === line.id);
      this.#project.apply(removePath(line.id));
      const remaining = atomicSegments(this.#lines);
      const next = remaining[Math.min(removedAt, remaining.length - 1)];
      this.select(next ? [next.id] : []);
      this.selectedPointIndex = 0;
      return;
    }

    const pointIndex = this.selectedPointIndex - 1;
    if (line.throughPoints?.length) {
      if (line.throughPoints[pointIndex]?.locked) return;
      const remaining = line.throughPoints.filter(
        (_point, index) => index !== pointIndex,
      );
      this.#project.apply(
        updateSegment(line.id, (segment) => ({
          ...segment,
          throughPoints: remaining.length ? remaining : undefined,
        })),
      );
    } else {
      if (line.controlPoints[pointIndex]?.locked) return;
      this.#project.apply(
        updateSegment(line.id, (segment) => ({
          ...segment,
          controlPoints: segment.controlPoints.filter(
            (_point, index) => index !== pointIndex,
          ),
        })),
      );
    }
    this.selectedPointIndex = Math.max(0, this.selectedPointIndex - 1);
  }

  /**
   * Insert a path ending halfway between the selected point and the point
   * before it, ahead of the selection, so the selected path now starts there.
   */
  insertPathBeforeSelection() {
    const selected = this.selectedLine;
    if (!selected) return;
    const { startPoint, lines, sequence } = this.#project.doc;
    const previous = segmentStartById(startPoint, lines, selected.id);
    if (!previous) return;

    const anchor = this.selectedPoint ?? selected.endPoint;
    const segment = createSegment(
      (previous.x + anchor.x) / 2,
      (previous.y + anchor.y) / 2,
    );

    const nextLines = insertPaths(lines, selected.id, "before", [segment]);
    const sequenceIndex = sequence.findIndex(
      (item) => item.kind === "path" && item.lineId === selected.id,
    );
    const nextSequence = [...sequence];
    nextSequence.splice(
      sequenceIndex >= 0 ? sequenceIndex : nextSequence.length,
      0,
      { kind: "path", lineId: segment.id },
    );

    this.#project.apply((doc) => ({
      ...doc,
      lines: nextLines,
      sequence: nextSequence,
    }));
    this.select([segment.id]);
    this.selectedPointIndex = 0;
  }

  groupSelected() {
    if (this.groupingBlockedReason) return;
    const selected = this.selectedPathIds;
    const next = groupPaths(this.#lines, selected);
    if (next === this.#lines) return;
    this.#project.apply(setLines(next));
    const created = next.find(
      (path) =>
        path.kind === "compound" &&
        !selected.includes(path.id) &&
        path.segments.some((child) => selected.includes(child.id)),
    );
    if (created) this.select([created.id]);
  }

  ungroupSelected() {
    const group = this.selectedPath;
    if (!group || group.kind !== "compound") return;
    const childIds = group.segments.map((child) => child.id);
    this.#project.apply(setLines(ungroupPath(this.#lines, group.id)));
    this.select(childIds);
  }

  reorderPath(
    draggedId: string,
    targetId: string,
    position: "before" | "after",
  ) {
    const next = movePath(this.#lines, draggedId, targetId, position);
    if (next === this.#lines) return;
    // Playback follows the sequence, so it has to track the new order.
    this.#project.apply((doc) => ({
      ...doc,
      lines: next,
      sequence: reorderSequenceToMatch(next, doc.sequence),
    }));
  }

  /** Run the path optimizer on every segment in turn. */
  async optimizeAll(settings: Settings) {
    if (this.optimizing) return;
    this.optimizing = true;
    try {
      for (const line of atomicSegments(this.#lines)) {
        const { startPoint, lines, shapes } = this.#project.doc;
        const payload = buildOptimizationPayload(
          line.id,
          startPoint,
          lines,
          shapes,
          settings,
        );
        const optimized = applyOptimizedWaypoints(
          lines,
          line.id,
          await runOptimization(payload),
        );
        if (optimized) this.#project.apply(setLines(normalizePaths(optimized)));
      }
    } catch (error) {
      console.error(error);
      showToast((error as Error).message || "Optimization failed.", "error");
    } finally {
      this.optimizing = false;
    }
  }

  /**
   * Replace every path with one `Paths.through` curve from the start to the
   * last endpoint, passing through up to `settings.curveThroughMaxPoints` of
   * the endpoints between.
   */
  curveThroughAll(settings: Settings) {
    const { startPoint } = this.#project.doc;
    const segments = atomicSegments(this.#lines);
    if (segments.length < 2) {
      showToast("Curve generation needs at least two paths.", "warning");
      return;
    }

    const maxThroughPoints = Math.max(
      1,
      Math.round(settings.curveThroughMaxPoints ?? 4),
    );
    // Endpoints right on top of the start would make a degenerate curve.
    const startClearance = 2;
    const throughPoints = segments
      .slice(0, -1)
      .map((line) => ({ ...line.endPoint }))
      .filter(
        (point) =>
          Math.hypot(point.x - startPoint.x, point.y - startPoint.y) >=
          startClearance,
      )
      .slice(0, maxThroughPoints);
    const curve = {
      ...segments[0],
      endPoint: { ...segments[segments.length - 1].endPoint },
      controlPoints: [],
      throughPoints,
    };

    this.#project.apply((doc) => ({
      ...doc,
      lines: normalizePaths([curve]),
      sequence: [{ kind: "path", lineId: curve.id }],
    }));
    this.select([curve.id]);
    this.selectedPointIndex = 0;
    showToast(
      `Created a Paths.through curve through ${throughPoints.length} points.`,
      "success",
    );
  }

  /** Turn the pen stroke into paths, after the selected one or as a new chain. */
  commitPenStroke(maxPaths: number) {
    const stroke = this.penStroke;
    this.penStroke = [];
    const selected = this.selectedLine;
    const fitted = fitStrokeToLines(stroke, maxPaths, selected?.endPoint);
    if (!fitted || fitted.lines.length === 0) return;
    const newLines = normalizePaths(fitted.lines);

    if (selected) {
      this.#project.apply((doc) => {
        const lines = insertPaths(doc.lines, selected.id, "after", newLines);
        const sequenceIndex = doc.sequence.findIndex(
          (item) => item.kind === "path" && item.lineId === selected.id,
        );
        const sequence = [...doc.sequence];
        sequence.splice(
          sequenceIndex >= 0 ? sequenceIndex + 1 : sequence.length,
          0,
          ...newLines.map((line) => ({
            kind: "path" as const,
            lineId: line.id,
          })),
        );
        return { ...doc, lines, sequence };
      });
      this.select([newLines[newLines.length - 1].id]);
    } else {
      this.#project.apply((doc) => ({
        ...doc,
        startPoint: fitted.startPoint,
        lines: newLines,
        sequence: atomicSegments(newLines).map((line) => ({
          kind: "path" as const,
          lineId: line.id,
        })),
      }));
      this.select(newLines[0] ? [newLines[0].id] : []);
    }
    this.selectedPointIndex = 0;
  }
}

const CONTEXT_KEY = Symbol("editor");

export function provideEditor(editor: EditorState) {
  setContext(CONTEXT_KEY, editor);
}

export function useEditor(): EditorState {
  return getContext<EditorState>(CONTEXT_KEY);
}
