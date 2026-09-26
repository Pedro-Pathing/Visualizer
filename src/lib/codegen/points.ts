import type { BasePoint, Path, StartPose } from "../../types";
import { atomicSegments } from "../../utils/pathTraversal";

export function generatePointsArray(
  startPoint: StartPose,
  paths: Path[],
): string {
  const points: BasePoint[] = [startPoint];

  atomicSegments(paths).forEach((line) => {
    (line.throughPoints ?? line.controlPoints).forEach((point) =>
      points.push(point),
    );
    points.push(line.endPoint);
  });

  const pointsString = points
    .map((point) => `(${coordinate(point.x)}, ${coordinate(point.y)})`)
    .join(", ");

  return `[${pointsString}]`;
}

function coordinate(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : value.toFixed(3);
}
