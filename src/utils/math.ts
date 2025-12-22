import type { Line, Point } from "../types";

export function quadraticToCubic(
  P0: { x: number; y: number },
  P1: { x: number; y: number },
  P2: { x: number; y: number },
) {
  const Q1 = {
    x: P0.x + (2 / 3) * (P1.x - P0.x),
    y: P0.y + (2 / 3) * (P1.y - P0.y),
  };
  const Q2 = {
    x: P2.x + (2 / 3) * (P1.x - P2.x),
    y: P2.y + (2 / 3) * (P1.y - P2.y),
  };
  return { Q1, Q2 };
}

export function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function getMousePos(evt: MouseEvent, canvas: any) {
  let rect = canvas.getBoundingClientRect();
  return {
    x:
      ((evt.clientX - rect.left) / (rect.right - rect.left)) *
      canvas.width.baseVal.value,
    y:
      ((evt.clientY - rect.top) / (rect.bottom - rect.top)) *
      canvas.height.baseVal.value,
  };
}

export function transformAngle(angle: number) {
  return ((angle + 180) % 360) - 180;
}

/**
 * Calculates the smallest difference between two angles.
 * Returns a value between -180 and 180.
 */
export function getAngularDifference(start: number, end: number): number {
  const normalizedStart = (start + 360) % 360;
  const normalizedEnd = (end + 360) % 360;
  let diff = normalizedEnd - normalizedStart;

  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;

  return diff;
}

/**
 * Calculates the shortest rotation from startAngle to endAngle based on a percentage.
 * @param startAngle
 * @param endAngle
 * @param percentage
 * @returns
 */
export function shortestRotation(
  startAngle: number,
  endAngle: number,
  percentage: number,
) {
  // Use the helper to find the shortest signed difference
  const diff = getAngularDifference(startAngle, endAngle);
  // Apply difference to the ORIGINAL startAngle to preserve winding/continuity
  return startAngle + diff * percentage;
}

export function radiansToDegrees(radians: number) {
  return radians * (180 / Math.PI);
}

export function lerp(ratio: number, start: number, end: number) {
  return start + (end - start) * ratio;
}

export function lerp2d(
  ratio: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  return {
    x: lerp(ratio, start.x, end.x),
    y: lerp(ratio, start.y, end.y),
  };
}

export function getCurvePoint(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  if (points.length === 1) return points[0];
  var newpoints = [];
  for (var i = 0, j = 1; j < points.length; i++, j++) {
    newpoints[i] = lerp2d(t, points[i], points[j]);
  }
  return getCurvePoint(t, newpoints);
}

// Helpers for Heading Calculation
export function getTangentAngle(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
}

export function getLineStartHeading(
  line: Line | undefined,
  previousPoint: Point,
): number {
  if (!line || !line.endPoint) return 0;

  if (line.endPoint.heading === "constant") return line.endPoint.degrees;
  if (line.endPoint.heading === "linear") return line.endPoint.startDeg;
  if (line.endPoint.heading === "tangential") {
    const nextP =
      line.controlPoints.length > 0 ? line.controlPoints[0] : line.endPoint;
    const angle = getTangentAngle(previousPoint, nextP);
    return line.endPoint.reverse
      ? transformAngle(angle + 180)
      : transformAngle(angle);
  }
  return 0;
}

export function getLineEndHeading(
  line: Line | undefined,
  previousPoint: Point,
): number {
  if (!line || !line.endPoint) return 0;

  if (line.endPoint.heading === "constant") return line.endPoint.degrees;
  if (line.endPoint.heading === "linear") return line.endPoint.endDeg;
  if (line.endPoint.heading === "tangential") {
    const prevP =
      line.controlPoints.length > 0
        ? line.controlPoints[line.controlPoints.length - 1]
        : previousPoint;
    const angle = getTangentAngle(prevP, line.endPoint);
    return line.endPoint.reverse
      ? transformAngle(angle + 180)
      : transformAngle(angle);
  }
  return 0;
}

export function vh(percent: number) {
  var h = Math.max(
    document.documentElement.clientHeight,
    window.innerHeight || 0,
  );
  return (percent * h) / 100;
}

export function vw(percent: number) {
  var w = Math.max(
    document.documentElement.clientWidth,
    window.innerWidth || 0,
  );
  return (percent * w) / 100;
}
