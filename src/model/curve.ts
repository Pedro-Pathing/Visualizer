import type { AtomicPath, BasePoint } from "../types";
import { clamp, getCurvePoint, radiansToDegrees } from "../utils/math";

/** Samples behind each curve's arc-length table. */
const ARC_LENGTH_SAMPLES = 200;

/**
 * One drivable segment as Pedro builds it: a single Bézier curve. Positions
 * are addressed by arc-length fraction `s`, which is how the follower advances
 * and how Pedro measures heading progress.
 */
export interface Curve {
  /** Start, control points and end of the Bézier. */
  readonly controlPoints: readonly BasePoint[];
  readonly length: number;
  pointAt(s: number): BasePoint;
  /** Direction of travel in degrees counter-clockwise from +x. */
  tangentAt(s: number): number;
  /** The Bézier parameter at arc-length fraction `s`. */
  parameterAt(s: number): number;
  /** `count + 1` points evenly spaced along the curve. */
  sample(count: number): BasePoint[];
}

/**
 * Pedro's `Paths.through` fits one Bézier whose degree is one less than the
 * number of points, passing through them at evenly spaced parameters.
 */
export function interpolatingBezier(points: BasePoint[]): BasePoint[] {
  const n = points.length - 1;
  if (n < 2) return points.map((point) => ({ x: point.x, y: point.y }));

  const rows = points.map((point, i) => {
    const t = i / n;
    const basis = Array.from(
      { length: n + 1 },
      (_, j) => binomial(n, j) * t ** j * (1 - t) ** (n - j),
    );
    return [...basis, point.x, point.y];
  });

  for (let col = 0; col <= n; col++) {
    let pivot = col;
    for (let row = col + 1; row <= n; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    for (let row = 0; row <= n; row++) {
      if (row === col) continue;
      const factor = rows[row][col] / rows[col][col];
      for (let k = col; k < rows[row].length; k++) {
        rows[row][k] -= factor * rows[col][k];
      }
    }
  }

  return rows.map((row, i) => ({
    x: row[n + 1] / row[i],
    y: row[n + 2] / row[i],
  }));
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

export function bezierControlPoints(
  start: BasePoint,
  line: AtomicPath,
): BasePoint[] {
  if (line.throughPoints?.length) {
    return interpolatingBezier([start, ...line.throughPoints, line.endPoint]);
  }
  return [start, ...line.controlPoints, line.endPoint].map((point) => ({
    x: point.x,
    y: point.y,
  }));
}

export function createCurve(controlPoints: BasePoint[]): Curve {
  const derivativePoints = controlPoints.slice(1).map((point, i) => ({
    x: (controlPoints.length - 1) * (point.x - controlPoints[i].x),
    y: (controlPoints.length - 1) * (point.y - controlPoints[i].y),
  }));

  const at = (t: number) => getCurvePoint(clamp(t, 0, 1), controlPoints);

  const table = [0];
  let previous = at(0);
  for (let i = 1; i <= ARC_LENGTH_SAMPLES; i++) {
    const point = at(i / ARC_LENGTH_SAMPLES);
    table.push(
      table[i - 1] + Math.hypot(point.x - previous.x, point.y - previous.y),
    );
    previous = point;
  }
  const length = table[ARC_LENGTH_SAMPLES];

  const parameterAt = (s: number) => {
    const target = clamp(s, 0, 1) * length;
    if (length <= 1e-9) return clamp(s, 0, 1);
    let low = 0;
    let high = ARC_LENGTH_SAMPLES;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (table[mid] < target) low = mid;
      else high = mid;
    }
    const span = table[high] - table[low];
    const within = span <= 1e-12 ? 0 : (target - table[low]) / span;
    return (low + within) / ARC_LENGTH_SAMPLES;
  };

  const tangentAtParameter = (t: number) => {
    let direction =
      derivativePoints.length > 0
        ? getCurvePoint(t, derivativePoints)
        : { x: 0, y: 0 };
    // A control point sitting on an end point gives a zero derivative there.
    if (Math.hypot(direction.x, direction.y) < 1e-9) {
      const from = at(t < 1 ? t : t - 1e-4);
      const to = at(t < 1 ? t + 1e-4 : t);
      direction = { x: to.x - from.x, y: to.y - from.y };
    }
    return Math.hypot(direction.x, direction.y) < 1e-12
      ? 0
      : radiansToDegrees(Math.atan2(direction.y, direction.x));
  };

  return {
    controlPoints,
    length,
    parameterAt,
    pointAt: (s) => at(parameterAt(s)),
    tangentAt: (s) => tangentAtParameter(parameterAt(s)),
    sample: (count) =>
      Array.from({ length: count + 1 }, (_, i) => at(parameterAt(i / count))),
  };
}

const cache = new Map<string, Curve>();
const CACHE_LIMIT = 2048;

/**
 * The curve a segment drives from `start`. Paths are still edited in place,
 * so curves are cached by coordinates rather than by object.
 */
export function curveOf(start: BasePoint, line: AtomicPath): Curve {
  const through = Boolean(line.throughPoints?.length);
  const key = [
    through ? "through" : "control",
    start,
    ...(through ? line.throughPoints! : line.controlPoints),
    line.endPoint,
  ]
    .map((entry) =>
      typeof entry === "string" ? entry : `${entry.x},${entry.y}`,
    )
    .join(";");

  let curve = cache.get(key);
  if (!curve) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    curve = createCurve(bezierControlPoints(start, line));
    cache.set(key, curve);
  }
  return curve;
}
