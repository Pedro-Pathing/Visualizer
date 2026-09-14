import type { BasePoint } from "../../types";
import { FIELD_SIZE } from "../../config/defaults";
import { toCanonical, toDocFrame, type Frame } from "../../utils/frame";

/** Which state container a dragged point lives in, so callers know what to reassign. */
export type PointContainer = "shapes" | "second" | "additional" | "main";

export interface PointRef {
  point: BasePoint;
  container: PointContainer;
  locked: boolean;
  key: string;
  /**
   * Which path within its container this point belongs to. Only meaningful for
   * additional paths, where it is the path's index.
   */
  scope: string;
  /** Owning segment, or null for a path's start point or an obstacle vertex. */
  lineId: string | null;
  /** 0 is the segment's end point, n its nth control point; -1 for a start point. */
  pointIndex: number;
}

/**
 * Maps rendered elements back to the points they draw.
 */
export class PointRegistry {
  private byElementId = new Map<string, PointRef>();
  private elementIdByKey = new Map<string, string>();

  register(elementId: string, ref: PointRef): void {
    this.byElementId.set(elementId, ref);
    // The first registration for a key is the point's own element; later ones
    // are its decorations, which are not what a reverse lookup wants.
    if (!this.elementIdByKey.has(ref.key)) {
      this.elementIdByKey.set(ref.key, elementId);
    }
  }

  resolve(elementId: string | null | undefined): PointRef | null {
    if (!elementId) return null;
    return this.byElementId.get(elementId) ?? null;
  }

  elementIdFor(key: string): string | null {
    return this.elementIdByKey.get(key) ?? null;
  }

  registerSegment(
    elementId: string,
    lineId: string,
    container: PointContainer,
  ): void {
    this.segmentByElementId.set(elementId, { lineId, container });
  }

  segmentAt(
    elementId: string | null | undefined,
  ): { lineId: string; container: PointContainer } | null {
    if (!elementId) return null;
    return this.segmentByElementId.get(elementId) ?? null;
  }

  private segmentByElementId = new Map<
    string,
    { lineId: string; container: PointContainer }
  >();
}

/** Address of a point on a path, used as its registry key. */
export function pointKey(
  container: PointContainer,
  scope: string,
  lineId: string | null,
  pointIndex: number,
): string {
  return `${container}|${scope}|${lineId ?? "start"}|${pointIndex}`;
}

export interface GridSnapOptions {
  snapToGrid: boolean;
  showGrid: boolean;
  gridSize: number;
  frame: Frame;
}

/** Snap to the nearest grid intersection and clamp into the field. */
export function snapPointToGrid(
  inchX: number,
  inchY: number,
  { snapToGrid, showGrid, gridSize, frame }: GridSnapOptions,
): BasePoint {
  if (!snapToGrid || !showGrid || gridSize <= 0) {
    return { x: inchX, y: inchY };
  }

  const doc = toDocFrame({ x: inchX, y: inchY }, frame);
  const snapped = toCanonical(
    {
      x: Math.round(doc.x / gridSize) * gridSize,
      y: Math.round(doc.y / gridSize) * gridSize,
    },
    frame,
  );

  return {
    x: Math.max(0, Math.min(FIELD_SIZE, snapped.x)),
    y: Math.max(0, Math.min(FIELD_SIZE, snapped.y)),
  };
}
