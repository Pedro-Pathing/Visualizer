import { FIELD_SIZE } from "../config/defaults";

/** Converts field inches to screen pixels along one axis, and back. */
export interface Axis {
  (inches: number): number;
  invert(pixels: number): number;
}

/** The field drawn as a `size`-pixel square with +y pointing up. */
export interface Viewport {
  size: number;
  x: Axis;
  y: Axis;
}

export function createViewport(size: number): Viewport {
  const scale = size / FIELD_SIZE;
  const x: Axis = Object.assign((inches: number) => inches * scale, {
    invert: (pixels: number) => pixels / scale,
  });
  const y: Axis = Object.assign((inches: number) => size - inches * scale, {
    invert: (pixels: number) => (size - pixels) / scale,
  });
  return { size, x, y };
}
