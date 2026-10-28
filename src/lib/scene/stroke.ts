import type { BasePoint } from "../../types";
import type { Curve } from "../../model/curve";
import { lerp2d } from "../../utils/math";

/** Points drawn for a curve the renderer can't express as one cubic. */
export const POLYLINE_SAMPLES = 1000;

/** How a curve is drawn, in field inches. */
export type SegmentStroke =
  | { kind: "line"; from: BasePoint; to: BasePoint }
  | {
      kind: "cubic";
      from: BasePoint;
      control1: BasePoint;
      control2: BasePoint;
      to: BasePoint;
    }
  | { kind: "polyline"; points: BasePoint[] };

/** SVG draws up to cubic Béziers natively; higher degrees are sampled. */
export function segmentStroke(curve: Curve): SegmentStroke {
  const points = curve.controlPoints;
  const from = points[0];
  const to = points[points.length - 1];

  switch (points.length) {
    case 2:
      return { kind: "line", from, to };
    case 3:
      return {
        kind: "cubic",
        from,
        control1: lerp2d(2 / 3, from, points[1]),
        control2: lerp2d(2 / 3, to, points[1]),
        to,
      };
    case 4:
      return {
        kind: "cubic",
        from,
        control1: points[1],
        control2: points[2],
        to,
      };
    default:
      return { kind: "polyline", points: curve.sample(POLYLINE_SAMPLES) };
  }
}
