import type { BasePoint } from "../types";
import { clampFieldCoordinate } from "../utils/math";

export interface GridSnapOptions {
  snapToGrid: boolean;
  showGrid: boolean;
  gridSize: number;
}

/** Clamp into the field, snapping to the nearest grid intersection when snapping is on. */
export function snapPoint(
  point: BasePoint,
  { snapToGrid, showGrid, gridSize }: GridSnapOptions,
): BasePoint {
  const snap = (value: number) =>
    snapToGrid && showGrid && gridSize > 0
      ? Math.round(value / gridSize) * gridSize
      : value;
  return {
    x: clampFieldCoordinate(snap(point.x)),
    y: clampFieldCoordinate(snap(point.y)),
  };
}
