import type {
  AtomicPath,
  BasePoint,
  CompoundPath,
  Heading,
  Path,
} from "../types";
import { curveOf, type Curve } from "../model/curve";
import { clamp } from "./math";
import { makePathId } from "./ids";

/** One drivable curve, resolved out of the path structure. */
export interface FlatSegment {
  /** The atomic path this came from. */
  line: AtomicPath;
  /** Position in the flattened order, counting leaves only. */
  index: number;
  /** Where the segment begins: the previous segment's end, or the path start. */
  start: BasePoint;
  /** Built on first access. */
  readonly curve: Curve;
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
 * `curve` is lazy because several callers only need the path structure.
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

      const segmentStart = start;
      let curve: Curve | null = null;

      segments.push({
        line: node,
        index: segments.length,
        start: segmentStart,
        get curve() {
          return (curve ??= curveOf(segmentStart, node));
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
 * The heading rule in force at arc-length fraction `s` of a segment, and how
 * far through that rule the robot is. A group's heading overrides its
 * children's and runs across the whole group, measured by distance as Pedro's
 * compound paths do.
 */
export function effectiveHeadingAt(
  segments: FlatSegment[],
  index: number,
  s: number,
): { heading: Heading; s: number } {
  const segment = segments[index];
  const override = segment.ancestors.find((group) => group.heading);
  if (!override?.heading) {
    return { heading: segment.line.heading, s };
  }

  const members = segments.filter((entry) =>
    entry.ancestors.includes(override),
  );
  const total = members.reduce((sum, entry) => sum + entry.curve.length, 0);
  if (total <= 1e-9) return { heading: override.heading, s: 0 };

  let travelled = 0;
  for (const member of members) {
    if (member === segment) break;
    travelled += member.curve.length;
  }

  return {
    heading: override.heading,
    s: clamp((travelled + s * segment.curve.length) / total, 0, 1),
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

  return insertPaths(remove(paths), targetId, position, [dragged]);
}

/**
 * Insert `added` directly before or after `targetId`, inside whichever group
 * holds it. Returns the original array unchanged when the target is not found.
 */
export function insertPaths(
  paths: Path[],
  targetId: string,
  position: "before" | "after",
  added: Path[],
): Path[] {
  let inserted = false;

  const walk = (nodes: Path[]): Path[] => {
    const index = nodes.findIndex((node) => node.id === targetId);
    if (index >= 0) {
      inserted = true;
      const next = [...nodes];
      next.splice(position === "before" ? index : index + 1, 0, ...added);
      return next;
    }
    return nodes.map((node) =>
      node.kind === "compound"
        ? { ...node, segments: walk(node.segments) }
        : node,
    );
  };

  const next = walk(paths);
  return inserted ? next : paths;
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
