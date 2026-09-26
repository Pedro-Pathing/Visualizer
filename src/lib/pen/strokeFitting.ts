import type { AtomicPath, BasePoint, StartPose } from "../../types";
import { clampFieldCoordinate, distanceBetweenPoints } from "../../utils/math";
import { getRandomColor } from "../../utils/color";
import { makePathId } from "../../utils/ids";

/**
 * Distance from a point to the infinite line through lineStart/lineEnd.
 * Unlike geometry.ts `pointToLineDistance`, this is not clamped to the segment.
 */
export function perpendicularDistance(
  point: BasePoint,
  lineStart: BasePoint,
  lineEnd: BasePoint,
): number {
  const denominator = Math.hypot(
    lineEnd.x - lineStart.x,
    lineEnd.y - lineStart.y,
  );
  if (denominator === 0) {
    return distanceBetweenPoints(point, lineStart);
  }

  const numerator = Math.abs(
    (lineEnd.y - lineStart.y) * point.x -
      (lineEnd.x - lineStart.x) * point.y +
      lineEnd.x * lineStart.y -
      lineEnd.y * lineStart.x,
  );

  return numerator / denominator;
}

/** Ramer-Douglas-Peucker simplification. */
export function simplifyStrokePoints(
  points: BasePoint[],
  tolerance: number,
): BasePoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));

  const simplifyRange = (startIndex: number, endIndex: number): BasePoint[] => {
    let maxDistance = 0;
    let farthestIndex = -1;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = perpendicularDistance(
        points[index],
        points[startIndex],
        points[endIndex],
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        farthestIndex = index;
      }
    }

    if (maxDistance <= tolerance || farthestIndex === -1) {
      return [{ ...points[startIndex] }, { ...points[endIndex] }];
    }

    const left = simplifyRange(startIndex, farthestIndex);
    const right = simplifyRange(farthestIndex, endIndex);
    return [...left.slice(0, -1), ...right];
  };

  return simplifyRange(0, points.length - 1);
}

export function dedupeStrokePoints(
  points: BasePoint[],
  minDistance: number,
): BasePoint[] {
  const deduped: BasePoint[] = [];

  for (const point of points) {
    const lastPoint = deduped[deduped.length - 1];
    if (!lastPoint || distanceBetweenPoints(lastPoint, point) >= minDistance) {
      deduped.push({ ...point });
    }
  }

  return deduped;
}

export function getPointOnStroke(
  points: BasePoint[],
  targetDistance: number,
): BasePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };

  let remaining = targetDistance;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const segmentLength = distanceBetweenPoints(current, next);

    if (segmentLength === 0) continue;
    if (remaining <= segmentLength) {
      const ratio = remaining / segmentLength;
      return {
        x: current.x + (next.x - current.x) * ratio,
        y: current.y + (next.y - current.y) * ratio,
      };
    }

    remaining -= segmentLength;
  }

  return { ...points[points.length - 1] };
}

/**
 * Reduce a stroke to at most `maxVertices` anchors, keeping the first and last
 * points and resampling the interior at even arc-length intervals.
 */
export function limitStrokeVertices(
  points: BasePoint[],
  maxVertices: number,
): BasePoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  if (maxVertices >= points.length) return points.map((p) => ({ ...p }));
  if (maxVertices <= 2) {
    return [{ ...points[0] }, { ...points[points.length - 1] }];
  }

  const totalLength = points.reduce(
    (sum, point, index) =>
      index === 0 ? 0 : sum + distanceBetweenPoints(points[index - 1], point),
    0,
  );

  if (totalLength === 0) {
    return [{ ...points[0] }, { ...points[points.length - 1] }];
  }

  const resampled: BasePoint[] = [{ ...points[0] }];
  const interiorCount = maxVertices - 2;
  for (let index = 1; index <= interiorCount; index += 1) {
    resampled.push(
      getPointOnStroke(points, (totalLength * index) / (interiorCount + 1)),
    );
  }
  resampled.push({ ...points[points.length - 1] });

  return resampled;
}

/** Keep live pen samples faithful to the cursor without smoothing them. */
export function smoothStrokePreview(
  stroke: BasePoint[],
  _maxVertices = 3,
): BasePoint[] {
  return dedupeStrokePoints(stroke, 0.2);
}

/**
 * Turn a freehand stroke into a start point plus one smooth path.
 *
 * The sampled stroke becomes the control polygon of one Bezier path. The
 * vertex cap keeps the resulting curve stable instead of creating a very
 * high-degree curve from every pointer event.
 */
export function fitStrokeToLines(
  stroke: BasePoint[],
  maxPaths: number,
  startAnchor?: BasePoint,
): { startPoint: StartPose; lines: AtomicPath[] } | null {
  const cleanedStroke = dedupeStrokePoints(
    stroke.map((point) => ({
      x: clampFieldCoordinate(point.x),
      y: clampFieldCoordinate(point.y),
    })),
    0.2,
  );

  if (cleanedStroke.length < 2) return null;

  // Keep the cursor path; do not replace it with a smoothed approximation.
  let strokePoints = smoothStrokePreview(cleanedStroke, 4);

  if (strokePoints.length < 2) return null;

  // With an anchor the stroke continues from an existing point, so that
  // anchor becomes the first vertex and every stroke sample is an endpoint.
  if (startAnchor) {
    strokePoints = [
      {
        x: clampFieldCoordinate(startAnchor.x),
        y: clampFieldCoordinate(startAnchor.y),
      },
      ...strokePoints,
    ];
  }

  const configuredLimit = Math.round(Number(maxPaths) || 0);
  const vertexLimit = configuredLimit > 0 ? configuredLimit + 1 : 12;
  strokePoints = limitStrokeVertices(strokePoints, Math.max(3, vertexLimit));
  const firstPoint = strokePoints[0];
  const lastPoint = strokePoints[strokePoints.length - 1];
  const fittedLine: AtomicPath = {
    kind: "atomic",
    id: makePathId(),
    name: "Pen Stroke",
    endPoint: { x: lastPoint.x, y: lastPoint.y },
    controlPoints: [],
    throughPoints: strokePoints.slice(1, -1).map((point) => ({ ...point })),
    heading: { type: "tangential", reverse: false },
    color: getRandomColor(),
    locked: false,
    waitBeforeMs: 0,
    waitAfterMs: 0,
    waitBeforeName: "",
    waitAfterName: "",
  };

  return {
    startPoint: {
      x: startAnchor?.x ?? firstPoint.x,
      y: startAnchor?.y ?? firstPoint.y,
      headingDeg: 0,
    },
    lines: [fittedLine],
  };
}
