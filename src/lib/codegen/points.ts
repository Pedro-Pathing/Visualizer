import type { BasePoint, Path, StartPose } from "../../types";
import { atomicSegments } from "../../utils/pathTraversal";
import { LEGACY_FRAME, toDocFrame, type Frame } from "../../utils/frame";

export function generatePointsArray(
  startPoint: StartPose,
  paths: Path[],
  frame: Frame = LEGACY_FRAME,
): string {
  const points: BasePoint[] = [startPoint];

  atomicSegments(paths).forEach((line) => {
    line.controlPoints.forEach((controlPoint) => points.push(controlPoint));
    points.push(line.endPoint);
  });

  const pointsString = points
    .map((point) => {
      const shown = toDocFrame(point, frame);
      return `(${coordinate(shown.x)}, ${coordinate(shown.y)})`;
    })
    .join(", ");

  return `[${pointsString}]`;
}

function coordinate(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : value.toFixed(3);
}
