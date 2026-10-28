/**
 * Geometry utility functions for obstacle detection and polygon operations
 */
import type { BasePoint } from "../types";

/**
 * Determines if a point is inside a polygon using ray casting algorithm
 */
export function pointInPolygon(point: number[], polygon: BasePoint[]): boolean {
  const x = point[0],
    y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Calculate minimum distance from a point to a polygon's edges
 */
export function minDistanceToPolygon(
  point: number[],
  polygon: BasePoint[],
): number {
  let minDistance = Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    const distance = pointToLineDistance(point, [p1.x, p1.y], [p2.x, p2.y]);
    minDistance = Math.min(minDistance, distance);
  }

  return minDistance;
}

/**
 * Calculate shortest distance from a point to a line segment
 */
export function pointToLineDistance(
  point: number[],
  lineStart: number[],
  lineEnd: number[],
): number {
  const A = point[0] - lineStart[0];
  const B = point[1] - lineStart[1];
  const C = lineEnd[0] - lineStart[0];
  const D = lineEnd[1] - lineStart[1];

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = lineStart[0];
    yy = lineStart[1];
  } else if (param > 1) {
    xx = lineEnd[0];
    yy = lineEnd[1];
  } else {
    xx = lineStart[0] + param * C;
    yy = lineStart[1] + param * D;
  }

  const dx = point[0] - xx;
  const dy = point[1] - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the center (centroid) of a polygon
 */
export function polygonCenter(vertices: BasePoint[]): number[] {
  const sum = vertices.reduce(
    (acc, vertex) => {
      return [acc[0] + vertex.x, acc[1] + vertex.y];
    },
    [0, 0],
  );

  return [sum[0] / vertices.length, sum[1] / vertices.length];
}

/**
 * The four corners of a robot rectangle centered at (x, y), in field
 * coordinates with y up.
 * @param heading - Degrees counter-clockwise from +x
 * @param width - Extent along the heading, as the robot sprite draws it
 * @param height - Extent across the heading
 * @returns Corners in counter-clockwise order: back-right, front-right,
 *   front-left, back-left
 */
export function getRobotCorners(
  x: number,
  y: number,
  heading: number,
  width: number,
  height: number,
): BasePoint[] {
  // Convert heading from degrees to radians
  const headingRad = (heading * Math.PI) / 180;

  // Half dimensions
  const hw = width / 2;
  const hh = height / 2;

  // Calculate rotation components
  const cos = Math.cos(headingRad);
  const sin = Math.sin(headingRad);

  const corners = [
    { dx: -hw, dy: -hh },
    { dx: hw, dy: -hh },
    { dx: hw, dy: hh },
    { dx: -hw, dy: hh },
  ];

  return corners.map((corner) => ({
    x: x + corner.dx * cos - corner.dy * sin,
    y: y + corner.dx * sin + corner.dy * cos,
  }));
}

/**
 * Compute the convex hull of a set of points using Graham scan algorithm
 * @param points - Array of points to compute convex hull for
 * @returns Array of points forming the convex hull in counter-clockwise order
 */
export function convexHull(points: BasePoint[]): BasePoint[] {
  if (points.length < 3) return points;

  // Create a copy to avoid modifying the input
  const pts = [...points];

  // Find the point with the lowest y-coordinate (and leftmost if tie)
  let minIdx = 0;
  for (let i = 1; i < pts.length; i++) {
    if (
      pts[i].y < pts[minIdx].y ||
      (pts[i].y === pts[minIdx].y && pts[i].x < pts[minIdx].x)
    ) {
      minIdx = i;
    }
  }

  // Swap the bottom-most point to the first position
  [pts[0], pts[minIdx]] = [pts[minIdx], pts[0]];
  const pivot = pts[0];

  // Sort points by polar angle with respect to pivot
  const sorted = pts.slice(1).sort((a, b) => {
    const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
    const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);

    if (angleA !== angleB) {
      return angleA - angleB;
    }

    // If angles are equal, sort by distance
    const distA = (a.x - pivot.x) ** 2 + (a.y - pivot.y) ** 2;
    const distB = (b.x - pivot.x) ** 2 + (b.y - pivot.y) ** 2;
    return distA - distB;
  });

  // Build the convex hull
  const hull: BasePoint[] = [pivot];

  for (const point of sorted) {
    // Remove points that would create a right turn
    while (
      hull.length >= 2 &&
      cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0
    ) {
      hull.pop();
    }
    hull.push(point);
  }

  return hull;
}

/** Positive when `o → a → b` turns counter-clockwise. */
function cross(o: BasePoint, a: BasePoint, b: BasePoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Whether `p`, already known to be collinear with `a`–`b`, lies on that segment. */
function withinSegment(a: BasePoint, b: BasePoint, p: BasePoint): boolean {
  return (
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}

/** Whether segments `a`–`b` and `c`–`d` share any point, touching included. */
export function segmentsIntersect(
  a: BasePoint,
  b: BasePoint,
  c: BasePoint,
  d: BasePoint,
): boolean {
  const abc = cross(a, b, c);
  const abd = cross(a, b, d);
  const cda = cross(c, d, a);
  const cdb = cross(c, d, b);
  if (
    ((abc > 0 && abd < 0) || (abc < 0 && abd > 0)) &&
    ((cda > 0 && cdb < 0) || (cda < 0 && cdb > 0))
  ) {
    return true;
  }
  return (
    (abc === 0 && withinSegment(a, b, c)) ||
    (abd === 0 && withinSegment(a, b, d)) ||
    (cda === 0 && withinSegment(c, d, a)) ||
    (cdb === 0 && withinSegment(c, d, b))
  );
}

/**
 * Whether two simple polygons overlap. Either may be non-convex: if no edges
 * cross, they overlap only when one lies wholly inside the other.
 */
export function polygonsOverlap(a: BasePoint[], b: BasePoint[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    for (let k = 0, l = b.length - 1; k < b.length; l = k++) {
      if (segmentsIntersect(a[j], a[i], b[l], b[k])) return true;
    }
  }
  return (
    pointInPolygon([a[0].x, a[0].y], b) || pointInPolygon([b[0].x, b[0].y], a)
  );
}
