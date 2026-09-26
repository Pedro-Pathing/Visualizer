import type {
  AtomicPath,
  BasePoint,
  CompoundPath,
  Heading,
  Path,
} from "../types";
import {
  clamp,
  curveThroughPoints,
  getCurvePoint,
  radiansToDegrees,
} from "./math";
import { makePathId } from "./ids";

/** Sample count used when approximating a curve's arc length. */
export const CURVE_SAMPLES = 100;

/** The bezier control polygon for one segment, given where it starts. */
export function lineCurvePoints(
  startPoint: BasePoint,
  line: AtomicPath,
): BasePoint[] {
  if (!line.throughPoints?.length) {
    return [startPoint, ...line.controlPoints, line.endPoint];
  }

  const poses = [startPoint, ...line.throughPoints, line.endPoint];
  const cubicSegments = curveThroughPoints(1, poses);
  const sampled: BasePoint[] = [{ ...startPoint }];
  cubicSegments.forEach((segment) => {
    const cubic = [
      sampled[sampled.length - 1],
      segment.cp1,
      segment.cp2,
      segment.end,
    ];
    for (let sample = 1; sample <= 20; sample += 1) {
      sampled.push(getCurvePoint(sample / 20, cubic));
    }
  });
  return sampled;
}

export function approximateCurveLength(
  points: BasePoint[],
  samples = CURVE_SAMPLES,
): number {
  if (points.length < 2) return 0;

  let length = 0;
  let previousPoint = points[0];

  for (let index = 1; index <= samples; index += 1) {
    const t = index / samples;
    const point = getCurvePoint(t, points);
    const dx = point.x - previousPoint.x;
    const dy = point.y - previousPoint.y;
    length += Math.sqrt(dx * dx + dy * dy);
    previousPoint = point;
  }

  return length;
}

/** Cumulative arc length at each of `samples + 1` evenly spaced parameters. */
function arcLengthTable(points: BasePoint[], samples: number): number[] {
  const table = [0];
  let travelled = 0;
  let previousPoint = points[0];

  for (let index = 1; index <= samples; index += 1) {
    const point = getCurvePoint(index / samples, points);
    travelled += Math.hypot(
      point.x - previousPoint.x,
      point.y - previousPoint.y,
    );
    table.push(travelled);
    previousPoint = point;
  }

  return table;
}

/**
 * Arc-length fraction at a curve parameter. Pedro's `PiecewiseInterpolator`
 * keys segment boundaries on this rather than on the parameter itself.
 */
export function curveCompletionAt(
  points: BasePoint[],
  parameter: number,
  samples = CURVE_SAMPLES,
): number {
  const target = clamp(parameter, 0, 1);
  if (points.length < 2 || target <= 0) return 0;

  const table = arcLengthTable(points, samples);
  const total = table[samples];
  if (total <= 1e-9) return target;

  const step = Math.min(Math.floor(target * samples), samples - 1);
  const withinStep = target * samples - step;
  const travelled = table[step] + (table[step + 1] - table[step]) * withinStep;

  return clamp(travelled / total, 0, 1);
}

/** The inverse of `curveCompletionAt`. */
export function curveParameterAt(
  points: BasePoint[],
  completion: number,
  samples = CURVE_SAMPLES,
): number {
  const target = clamp(completion, 0, 1);
  if (points.length < 2 || target <= 0) return 0;

  const table = arcLengthTable(points, samples);
  const total = table[samples];
  if (total <= 1e-9) return target;

  const targetLength = target * total;
  let step = 0;
  while (step < samples - 1 && table[step + 1] < targetLength) step += 1;

  const spanLength = table[step + 1] - table[step];
  const withinStep =
    spanLength <= 1e-9 ? 0 : (targetLength - table[step]) / spanLength;

  return clamp((step + withinStep) / samples, 0, 1);
}

/** Where the robot sits, and which way the curve runs, at an arc-length fraction. */
export function curveGeometryAtCompletion(
  points: BasePoint[],
  completion: number,
): { point: BasePoint; tangentDegrees: number } {
  return getPointAndTangentAtProgress(
    points,
    curveParameterAt(points, completion),
  );
}

export function getPointAndTangentAtProgress(
  points: BasePoint[],
  progress: number,
  reversed = false,
): { point: BasePoint; tangentDegrees: number } {
  const clampedProgress = clamp(progress, 0, 1);
  const point = getCurvePoint(clampedProgress, points);
  const epsilon = 0.01;
  const direction = reversed ? -epsilon : epsilon;

  // Sample a step in the direction the robot faces. At the end of the curve
  // that step would clamp onto the current point and yield no direction at
  // all, so fall back to differencing from the other side instead.
  let fromT = clampedProgress;
  let toT = clamp(clampedProgress + direction, 0, 1);
  if (fromT === toT) {
    fromT = clamp(clampedProgress - direction, 0, 1);
    toT = clampedProgress;
  }

  const from = getCurvePoint(fromT, points);
  const to = getCurvePoint(toT, points);
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  return {
    point,
    tangentDegrees:
      Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9
        ? 0
        : radiansToDegrees(Math.atan2(dy, dx)),
  };
}

/** One drivable curve, resolved out of the path structure. */
export interface FlatSegment {
  /** The atomic path this came from. */
  line: AtomicPath;
  /** Position in the flattened order, counting leaves only. */
  index: number;
  /** Where the segment begins: the previous segment's end, or the path start. */
  start: BasePoint;
  /** `[start, ...controlPoints, endPoint]`. */
  points: BasePoint[];
  /** Approximate arc length in inches, computed on first access. */
  readonly arcLength: number;
  /**
   * The groups containing this segment, outermost first. Empty for a segment
   * at the top level.
   */
  ancestors: CompoundPath[];
}

/**
 * Resolve a path into the flat list of curves the robot actually drives.
 *
 * A segment's start point is implicit — it is wherever the previous segment
 * ended — and that rule was previously re-derived at every call site. Routing
 * them all through here means the rule lives in one place, which is what lets
 * the structure become a tree without touching the consumers.
 *
 * `arcLength` is lazy because several callers (rendering, the optimizer) only
 * need geometry, and measuring costs a full curve sampling per segment.
 */
export function flattenToAtomicSegments(
  startPoint: BasePoint,
  paths: Path[],
): FlatSegment[] {
  const segments: FlatSegment[] = [];
  let start: BasePoint = startPoint;

  const walk = (nodes: Path[], ancestors: CompoundPath[]) => {
    for (const node of nodes) {
      if (!node) continue;

      if (node.kind === "compound") {
        walk(node.segments, [...ancestors, node]);
        continue;
      }
      if (!node.endPoint) continue;

      const points = lineCurvePoints(start, node);
      let measured: number | null = null;

      segments.push({
        line: node,
        index: segments.length,
        start,
        points,
        get arcLength() {
          if (measured === null) measured = approximateCurveLength(points);
          return measured;
        },
        ancestors,
      });

      start = node.endPoint;
    }
  };

  walk(paths, []);
  return segments;
}

/**
 * Which heading actually applies part-way along a segment so that compound path headings override their children.
 */
export function effectiveHeadingAt(
  segments: FlatSegment[],
  index: number,
  localT: number,
): { heading: Heading; t: number } {
  const segment = segments[index];
  const override = segment.ancestors.find((group) => group.heading);
  if (!override?.heading) {
    return { heading: segment.line.heading, t: localT };
  }

  const members = segments.filter((entry) =>
    entry.ancestors.includes(override),
  );
  const total = members.reduce((sum, entry) => sum + entry.arcLength, 0);
  if (total <= 1e-9) return { heading: override.heading, t: 0 };

  let travelled = 0;
  for (const member of members) {
    if (member === segment) break;
    travelled += member.arcLength;
  }

  return {
    heading: override.heading,
    t: clamp((travelled + localT * segment.arcLength) / total, 0, 1),
  };
}

/** Addressed by id because a nested segment has no single top-level position. */
export function segmentStartById(
  startPoint: BasePoint,
  paths: Path[],
  lineId: string | null,
): BasePoint | null {
  if (!lineId) return null;
  const segments = flattenToAtomicSegments(startPoint, paths);
  return segments.find((segment) => segment.line.id === lineId)?.start ?? null;
}

/** Every drivable segment, in the order they are driven. */
export function atomicSegments(paths: Path[]): AtomicPath[] {
  return paths.flatMap((path) =>
    path.kind === "compound" ? atomicSegments(path.segments) : [path],
  );
}

export function findSegmentById(
  paths: Path[],
  lineId: string | null,
): AtomicPath | null {
  if (!lineId) return null;
  return atomicSegments(paths).find((path) => path.id === lineId) ?? null;
}

export function findPathById(paths: Path[], id: string | null): Path | null {
  if (!id) return null;
  for (const path of paths) {
    if (path.id === id) return path;
    if (path.kind === "compound") {
      const found = findPathById(path.segments, id);
      if (found) return found;
    }
  }
  return null;
}

export function locatePath(
  paths: Path[],
  id: string,
): { siblings: Path[]; index: number } | null {
  const index = paths.findIndex((path) => path.id === id);
  if (index >= 0) return { siblings: paths, index };

  for (const path of paths) {
    if (path.kind !== "compound") continue;
    const found = locatePath(path.segments, id);
    if (found) return found;
  }
  return null;
}

/**
 * Determines if a set of paths can be grouped; null if they can, otherwise the problem.
 */
export function groupingProblem(paths: Path[], ids: string[]): string | null {
  const unique = [...new Set(ids)];
  if (unique.length < 2) return "Select at least two paths to group.";

  const located = unique.map((id) => locatePath(paths, id));
  if (located.some((entry) => entry === null)) return "Path not found.";

  const siblings = located[0]!.siblings;
  if (located.some((entry) => entry!.siblings !== siblings)) {
    return "Paths must be in the same group to be grouped together.";
  }

  const indices = located.map((entry) => entry!.index).sort((a, b) => a - b);
  const contiguous =
    indices[indices.length - 1] - indices[0] + 1 === indices.length;
  if (!contiguous) return "Only neighbouring paths can be grouped.";

  return null;
}

/** Returns the original array unchanged when the selection cannot be grouped. */
export function groupPaths(paths: Path[], ids: string[]): Path[] {
  if (groupingProblem(paths, ids)) return paths;

  const idSet = new Set(ids);

  const walk = (nodes: Path[]): Path[] => {
    const indices = nodes
      .map((node, index) => (idSet.has(node.id) ? index : -1))
      .filter((index) => index >= 0);

    if (indices.length === idSet.size) {
      const first = indices[0];
      const last = indices[indices.length - 1];
      const children = nodes.slice(first, last + 1);
      const group: Path = {
        kind: "compound",
        id: makePathId(),
        name: "",
        // Groups inherit their first child's colour so the list stays readable.
        color: children[0].color,
        segments: children,
        waitBeforeMs: 0,
        waitAfterMs: 0,
        waitBeforeName: "",
        waitAfterName: "",
      };
      return [...nodes.slice(0, first), group, ...nodes.slice(last + 1)];
    }

    return nodes.map((node) =>
      node.kind === "compound"
        ? { ...node, segments: walk(node.segments) }
        : node,
    );
  };

  return walk(paths);
}

/** Returns the original array unchanged when the id is not found. */
export function updatePath(
  paths: Path[],
  id: string,
  update: (path: Path) => Path,
): Path[] {
  let changed = false;

  const walk = (nodes: Path[]): Path[] =>
    nodes.map((node) => {
      if (node.id === id) {
        changed = true;
        return update(node);
      }
      if (node.kind === "compound") {
        const segments = walk(node.segments);
        return segments === node.segments ? node : { ...node, segments };
      }
      return node;
    });

  const next = walk(paths);
  return changed ? next : paths;
}

/** Removes one level only; groups nested inside are preserved. */
export function ungroupPath(paths: Path[], groupId: string): Path[] {
  let changed = false;

  const walk = (nodes: Path[]): Path[] => {
    const next: Path[] = [];
    for (const node of nodes) {
      if (node.kind === "compound" && node.id === groupId) {
        changed = true;
        next.push(...node.segments);
        continue;
      }
      if (node.kind === "compound") {
        next.push({ ...node, segments: walk(node.segments) });
        continue;
      }
      next.push(node);
    }
    return next;
  };

  const result = walk(paths);
  return changed ? result : paths;
}

export function replaceSegment(
  paths: Path[],
  lineId: string,
  update: (segment: AtomicPath) => AtomicPath,
): Path[] {
  let changed = false;

  const walk = (nodes: Path[]): Path[] =>
    nodes.map((node) => {
      if (node.kind === "compound") {
        const segments = walk(node.segments);
        return segments === node.segments ? node : { ...node, segments };
      }
      if (node.id !== lineId) return node;
      changed = true;
      return update(node);
    });

  const next = walk(paths);
  return changed ? next : paths;
}

/** True when `ancestorId` is (or contains) `id`, at any depth. */
export function pathContains(
  paths: Path[],
  ancestorId: string,
  id: string,
): boolean {
  const ancestor = findPathById(paths, ancestorId);
  if (!ancestor) return false;
  if (ancestor.id === id) return true;
  if (ancestor.kind !== "compound") return false;
  return findPathById(ancestor.segments, id) !== null;
}

/**
 * Move `draggedId` so it sits directly before or after `targetId`.
 *
 * The dragged path is removed from wherever it currently lives and re-inserted
 * next to the target, which may be in a different group. Dropping a group onto
 * one of its own descendants is a no-op, as is dropping a path onto itself.
 */
export function movePath(
  paths: Path[],
  draggedId: string,
  targetId: string,
  position: "before" | "after" = "before",
): Path[] {
  if (draggedId === targetId) return paths;
  if (!findPathById(paths, draggedId)) return paths;
  if (!findPathById(paths, targetId)) return paths;
  // Moving a group inside itself would detach the whole subtree.
  if (pathContains(paths, draggedId, targetId)) return paths;

  const dragged = findPathById(paths, draggedId)!;

  const remove = (nodes: Path[]): Path[] =>
    nodes
      .filter((node) => node.id !== draggedId)
      .map((node) =>
        node.kind === "compound"
          ? { ...node, segments: remove(node.segments) }
          : node,
      );

  const insert = (nodes: Path[]): Path[] => {
    const index = nodes.findIndex((node) => node.id === targetId);
    if (index >= 0) {
      const next = [...nodes];
      next.splice(position === "before" ? index : index + 1, 0, dragged);
      return next;
    }
    return nodes.map((node) =>
      node.kind === "compound"
        ? { ...node, segments: insert(node.segments) }
        : node,
    );
  };

  return insert(remove(paths));
}

/**
 * Re-order the path entries of a sequence so they follow the order the
 * segments now appear in, leaving wait entries in their existing slots.
 */
export function reorderSequenceToMatch<
  T extends { kind: string; lineId?: string },
>(paths: Path[], sequence: T[]): T[] {
  const order = atomicSegments(paths).map((segment) => segment.id);
  const byId = new Map<string, T>();
  for (const item of sequence) {
    if (item.kind === "path" && item.lineId) byId.set(item.lineId, item);
  }

  const ordered = order
    .map((id) => byId.get(id))
    .filter((item): item is T => Boolean(item));

  let cursor = 0;
  return sequence.map((item) =>
    item.kind === "path" ? (ordered[cursor++] ?? item) : item,
  );
}
