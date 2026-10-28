import type { BasePoint, Path, StartPose } from "../types";
import { getRobotCorners } from "../utils/geometry";
import { segmentHeadingAt } from "../utils/headingInterpolation";
import { flattenToAtomicSegments } from "../utils/pathTraversal";

/**
 * The outline swept by the robot's sides as it drives every segment: the left
 * rail forward, then the right rail back. `rWidth` is the robot's
 * side-to-side size; `rLength` runs along its heading.
 */
export function generateGhostPathPoints(
  startPoint: StartPose,
  lines: Path[],
  rWidth: number,
  samples = 200,
): BasePoint[] {
  const segments = flattenToAtomicSegments(startPoint, lines);
  if (segments.length === 0) return [];

  const samplesPerSegment = Math.max(10, Math.ceil(samples / segments.length));
  const halfWidth = rWidth / 2;
  const left: BasePoint[] = [];
  const right: BasePoint[] = [];

  for (const { index, curve } of segments) {
    for (let i = 0; i <= samplesPerSegment; i++) {
      const s = i / samplesPerSegment;
      const center = curve.pointAt(s);
      const heading = (segmentHeadingAt(segments, index, s) * Math.PI) / 180;
      const normal = { x: -Math.sin(heading), y: Math.cos(heading) };
      left.push({
        x: center.x + normal.x * halfWidth,
        y: center.y + normal.y * halfWidth,
      });
      right.push({
        x: center.x - normal.x * halfWidth,
        y: center.y - normal.y * halfWidth,
      });
    }
  }

  const outline = dropRepeats([right[0], ...left, ...right.reverse()]);
  if (outline.length < 3) return [];
  if (!samePoint(outline[0], outline[outline.length - 1])) {
    outline.push({ ...outline[0] });
  }
  return outline;
}

export interface OnionLayer {
  x: number;
  y: number;
  heading: number;
  corners: BasePoint[];
  lineId: string;
}

/** The robot's footprint every `spacing` inches along the path. */
export function generateOnionLayers(
  startPoint: StartPose,
  lines: Path[],
  robotWidth: number,
  robotHeight: number,
  spacing = 6,
): OnionLayer[] {
  if (spacing <= 0) return [];

  const segments = flattenToAtomicSegments(startPoint, lines);
  const layers: OnionLayer[] = [];
  let travelledBefore = 0;
  let nextLayer = spacing;

  for (const { line, index, curve } of segments) {
    while (curve.length > 0 && nextLayer <= travelledBefore + curve.length) {
      const s = (nextLayer - travelledBefore) / curve.length;
      const point = curve.pointAt(s);
      const heading = segmentHeadingAt(segments, index, s);
      layers.push({
        x: point.x,
        y: point.y,
        heading,
        corners: getRobotCorners(
          point.x,
          point.y,
          heading,
          robotWidth,
          robotHeight,
        ),
        lineId: line.id,
      });
      nextLayer += spacing;
    }
    travelledBefore += curve.length;
  }

  return layers;
}

function samePoint(a: BasePoint, b: BasePoint) {
  return Math.abs(a.x - b.x) <= 1e-4 && Math.abs(a.y - b.y) <= 1e-4;
}

function dropRepeats(points: BasePoint[]): BasePoint[] {
  return points.filter(
    (point, i) => i === 0 || !samePoint(point, points[i - 1]),
  );
}
