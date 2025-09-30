/**
 * SIMPLIFIED Path optimization for obstacle avoidance
 * Focus on correctness over complexity
 */

/**
 * Check if a point is inside a polygon using ray casting
 */
export function isPointInPolygon(point: BasePoint, polygon: BasePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculate distance from point to line segment
 */
function distanceToSegment(p: BasePoint, a: BasePoint, b: BasePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;

  return Math.sqrt((p.x - closestX) ** 2 + (p.y - closestY) ** 2);
}

/**
 * SIMPLE polygon expansion - just push each vertex outward from center
 */
export function expandPolygon(polygon: BasePoint[], margin: number): BasePoint[] {
  if (polygon.length < 3 || margin <= 0) return [...polygon];

  // Calculate center
  let centerX = 0, centerY = 0;
  for (const p of polygon) {
    centerX += p.x;
    centerY += p.y;
  }
  centerX /= polygon.length;
  centerY /= polygon.length;

  // Push each vertex away from center
  const expanded: BasePoint[] = [];
  for (const vertex of polygon) {
    const dx = vertex.x - centerX;
    const dy = vertex.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.001) {
      const scale = (dist + margin) / dist;
      expanded.push({
        x: centerX + dx * scale,
        y: centerY + dy * scale
      });
    } else {
      expanded.push({ x: vertex.x + margin, y: vertex.y + margin });
    }
  }

  return expanded;
}

/**
 * Check if path segment is too close to obstacle
 */
function isSegmentTooCloseToObstacle(
  start: BasePoint,
  end: BasePoint,
  obstacle: BasePoint[],
  minDistance: number
): boolean {
  // Sample many points along the segment
  const samples = 50;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = {
      x: start.x + t * (end.x - start.x),
      y: start.y + t * (end.y - start.y)
    };

    // Check if point is inside obstacle
    if (isPointInPolygon(point, obstacle)) {
      return true;
    }

    // Check if point is too close to any obstacle edge
    for (let j = 0; j < obstacle.length; j++) {
      const k = (j + 1) % obstacle.length;
      const dist = distanceToSegment(point, obstacle[j], obstacle[k]);
      if (dist < minDistance) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if path is clear of all obstacles
 */
export function isPathClear(
  start: BasePoint,
  end: BasePoint,
  obstacles: Shape[],
  robotRadius: number
): boolean {
  for (const obstacle of obstacles) {
    if (obstacle.vertices.length < 3) continue;

    // Check if path is too close to this obstacle
    if (isSegmentTooCloseToObstacle(start, end, obstacle.vertices, robotRadius)) {
      return false;
    }
  }
  return true;
}

/**
 * Generate waypoints around obstacles
 */
export function findVisibilityWaypoints(
  start: BasePoint,
  end: BasePoint,
  obstacles: Shape[],
  robotRadius: number,
  fieldMin: number,
  fieldMax: number
): BasePoint[] {
  const waypoints: BasePoint[] = [start];

  // Add waypoints at different distances from obstacles
  for (const obstacle of obstacles) {
    if (obstacle.vertices.length < 3) continue;

    // Create waypoints at multiple clearance levels
    for (const clearance of [1.5, 2.0, 2.5]) {
      const expanded = expandPolygon(obstacle.vertices, robotRadius * clearance);

      for (const vertex of expanded) {
        if (vertex.x >= fieldMin && vertex.x <= fieldMax &&
            vertex.y >= fieldMin && vertex.y <= fieldMax) {
          waypoints.push(vertex);
        }
      }
    }
  }

  waypoints.push(end);
  return waypoints;
}

/**
 * Calculate distance between two points
 */
function distance(a: BasePoint, b: BasePoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * A* pathfinding algorithm
 */
export function findPathAroundObstacles(
  start: BasePoint,
  end: BasePoint,
  obstacles: Shape[],
  robotRadius: number,
  fieldMin: number = 0,
  fieldMax: number = 144
): BasePoint[] {
  console.log(`\n🔍 Finding path: (${start.x.toFixed(1)}, ${start.y.toFixed(1)}) → (${end.x.toFixed(1)}, ${end.y.toFixed(1)})`);
  console.log(`Robot radius: ${robotRadius.toFixed(1)}"`);

  // Check if direct path works
  if (isPathClear(start, end, obstacles, robotRadius)) {
    console.log('✅ Direct path is clear!');
    return [start, end];
  }

  console.log('❌ Direct path blocked, running A*...');

  // Get waypoints
  const waypoints = findVisibilityWaypoints(start, end, obstacles, robotRadius, fieldMin, fieldMax);
  console.log(`Found ${waypoints.length} waypoints`);

  // Build visibility graph
  const graph = new Map<number, number[]>();
  for (let i = 0; i < waypoints.length; i++) {
    graph.set(i, []);
  }

  for (let i = 0; i < waypoints.length; i++) {
    for (let j = i + 1; j < waypoints.length; j++) {
      if (isPathClear(waypoints[i], waypoints[j], obstacles, robotRadius)) {
        graph.get(i)!.push(j);
        graph.get(j)!.push(i);
      }
    }
  }

  // A* search
  const startIdx = 0;
  const endIdx = waypoints.length - 1;

  const openSet = new Set<number>([startIdx]);
  const closedSet = new Set<number>();
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  for (let i = 0; i < waypoints.length; i++) {
    gScore.set(i, Infinity);
    fScore.set(i, Infinity);
  }

  gScore.set(startIdx, 0);
  fScore.set(startIdx, distance(waypoints[startIdx], waypoints[endIdx]));

  let iterations = 0;

  while (openSet.size > 0 && iterations < 1000) {
    iterations++;

    // Find node with lowest fScore
    let current = -1;
    let lowestF = Infinity;
    for (const node of openSet) {
      const f = fScore.get(node)!;
      if (f < lowestF) {
        lowestF = f;
        current = node;
      }
    }

    if (current === endIdx) {
      // Reconstruct path
      const path: BasePoint[] = [];
      let curr = current;
      while (curr !== undefined) {
        path.unshift(waypoints[curr]);
        curr = cameFrom.get(curr)!;
      }
      console.log(`✅ A* succeeded in ${iterations} iterations, path length: ${path.length}`);
      return path;
    }

    openSet.delete(current);
    closedSet.add(current);

    for (const neighbor of graph.get(current)!) {
      if (closedSet.has(neighbor)) continue;

      const tentativeG = gScore.get(current)! + distance(waypoints[current], waypoints[neighbor]);

      if (!openSet.has(neighbor)) {
        openSet.add(neighbor);
      } else if (tentativeG >= gScore.get(neighbor)!) {
        continue;
      }

      cameFrom.set(neighbor, current);
      gScore.set(neighbor, tentativeG);
      fScore.set(neighbor, tentativeG + distance(waypoints[neighbor], waypoints[endIdx]));
    }
  }

  console.error(`❌ A* failed after ${iterations} iterations`);
  return [start, end];
}

/**
 * Smooth path by removing unnecessary waypoints
 */
export function smoothPath(
  path: BasePoint[],
  obstacles: Shape[],
  robotRadius: number
): BasePoint[] {
  if (path.length <= 2) return path;

  const smoothed: BasePoint[] = [path[0]];
  let current = 0;

  while (current < path.length - 1) {
    let farthest = current + 1;

    // Try to skip ahead as far as possible
    for (let i = path.length - 1; i > current + 1; i--) {
      if (isPathClear(path[current], path[i], obstacles, robotRadius)) {
        farthest = i;
        break;
      }
    }

    smoothed.push(path[farthest]);
    current = farthest;
  }

  return smoothed;
}