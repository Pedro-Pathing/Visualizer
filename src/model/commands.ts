import type { ProjectDoc } from "../io/project";
import type {
  AtomicPath,
  BasePoint,
  Path,
  RobotConfig,
  SequenceItem,
  Shape,
  StartPose,
} from "../types";
import {
  atomicSegments,
  replaceSegment,
  updatePath,
} from "../utils/pathTraversal";

/** Every edit to a project is a function from one document to the next. */
export type Command = (doc: ProjectDoc) => ProjectDoc;

/** Where a draggable point lives in the document. */
export type PointAddress =
  | { kind: "start" }
  /** `index` 0 is the end point; n is the nth through or control point. */
  | { kind: "path"; lineId: string; index: number }
  | { kind: "vertex"; shapeId: string; index: number };

export function pointAt(
  doc: ProjectDoc,
  address: PointAddress,
): BasePoint | null {
  switch (address.kind) {
    case "start":
      return doc.startPoint;
    case "path": {
      const segment = atomicSegments(doc.lines).find(
        (line) => line.id === address.lineId,
      );
      if (!segment) return null;
      return address.index === 0
        ? segment.endPoint
        : (innerPoints(segment)[address.index - 1] ?? null);
    }
    case "vertex":
      return (
        doc.shapes.find((shape) => shape.id === address.shapeId)?.vertices[
          address.index
        ] ?? null
      );
  }
}

/** Merge `patch` into the point at `address`. */
export const updatePoint =
  (address: PointAddress, patch: Partial<BasePoint>): Command =>
  (doc) => {
    switch (address.kind) {
      case "start":
        return { ...doc, startPoint: { ...doc.startPoint, ...patch } };
      case "path":
        return updateSegment(address.lineId, (segment) => {
          if (address.index === 0) {
            return { ...segment, endPoint: { ...segment.endPoint, ...patch } };
          }
          const key = segment.throughPoints?.length
            ? "throughPoints"
            : "controlPoints";
          const points = innerPoints(segment).map((point, i) =>
            i === address.index - 1 ? { ...point, ...patch } : point,
          );
          return { ...segment, [key]: points };
        })(doc);
      case "vertex":
        return updateShape(address.shapeId, (shape) => ({
          ...shape,
          vertices: shape.vertices.map((vertex, i) =>
            i === address.index ? { ...vertex, ...patch } : vertex,
          ),
        }))(doc);
    }
  };

export const updateStartPoint =
  (patch: Partial<StartPose>): Command =>
  (doc) => ({ ...doc, startPoint: { ...doc.startPoint, ...patch } });

export const setLines =
  (lines: Path[]): Command =>
  (doc) => ({ ...doc, lines });

export const setSequence =
  (sequence: SequenceItem[]): Command =>
  (doc) => ({ ...doc, sequence });

/** Apply `update` to a path or group, wherever it sits in the tree. */
export const updatePathById =
  (id: string, update: (path: Path) => Path): Command =>
  (doc) => {
    const lines = updatePath(doc.lines, id, update);
    return lines === doc.lines ? doc : { ...doc, lines };
  };

export const updateSegment =
  (lineId: string, update: (segment: AtomicPath) => AtomicPath): Command =>
  (doc) => {
    const lines = replaceSegment(doc.lines, lineId, update);
    return lines === doc.lines ? doc : { ...doc, lines };
  };

/** Append a segment and drive it last. */
export const addSegment =
  (segment: AtomicPath): Command =>
  (doc) => ({
    ...doc,
    lines: [...doc.lines, segment],
    sequence: [...doc.sequence, { kind: "path", lineId: segment.id }],
  });

/** Remove a path or group and every sequence entry that drives it. */
export const removePath =
  (id: string): Command =>
  (doc) => {
    const removed = new Set<string>();
    const prune = (nodes: Path[]): Path[] =>
      nodes.flatMap((node): Path[] => {
        if (node.id === id) {
          atomicSegments([node]).forEach((segment) => removed.add(segment.id));
          return [];
        }
        return node.kind === "compound"
          ? [{ ...node, segments: prune(node.segments) }]
          : [node];
      });
    const lines = prune(doc.lines);
    return {
      ...doc,
      lines,
      sequence: doc.sequence.filter(
        (item) => item.kind === "wait" || !removed.has(item.lineId),
      ),
    };
  };

export const setShapes =
  (shapes: Shape[]): Command =>
  (doc) => ({ ...doc, shapes });

export const updateShape =
  (shapeId: string, update: (shape: Shape) => Shape): Command =>
  (doc) => ({
    ...doc,
    shapes: doc.shapes.map((shape) =>
      shape.id === shapeId ? update(shape) : shape,
    ),
  });

export const updateRobot =
  (patch: Partial<RobotConfig>): Command =>
  (doc) => ({ ...doc, robot: { ...doc.robot, ...patch } });

function innerPoints(segment: AtomicPath): BasePoint[] {
  return segment.throughPoints?.length
    ? segment.throughPoints
    : segment.controlPoints;
}
