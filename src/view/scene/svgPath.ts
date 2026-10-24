import type { BasePoint } from "../../types";
import type { SegmentStroke } from "../../lib/scene/stroke";

const point = ({ x, y }: BasePoint) => `${x} ${y}`;

export function polylinePath(points: BasePoint[], closed = false): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return (
    `M ${point(first)}` +
    rest.map((p) => ` L ${point(p)}`).join("") +
    (closed ? " Z" : "")
  );
}

export function strokePath(stroke: SegmentStroke): string {
  switch (stroke.kind) {
    case "line":
      return `M ${point(stroke.from)} L ${point(stroke.to)}`;
    case "cubic":
      return `M ${point(stroke.from)} C ${point(stroke.control1)} ${point(stroke.control2)} ${point(stroke.to)}`;
    case "polyline":
      return polylinePath(stroke.points);
  }
}
