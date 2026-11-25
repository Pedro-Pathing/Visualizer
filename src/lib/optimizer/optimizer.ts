import type { Path, Settings, Shape, StartPose } from "../../types";
import { FIELD_SIZE } from "../../config/defaults";
import type { ProjectDoc } from "../../io/project";
import { findCollisions, MARGIN_RAMP } from "../../model/collision";
import { calculateVisualizationPathTime } from "../../utils/timeCalculator";
import {
  headingAngleAt,
  headingGeometryAt,
} from "../../utils/headingInterpolation";
import {
  flattenToAtomicSegments,
  replaceSegment,
  type FlatSegment,
} from "../../utils/pathTraversal";

export const OPTIMIZER_BASE_URL = "https://fpa.pedropathing.com";

// Extra clearance (in) on top of the user's safety margin. It exceeds the server's 1e-3 in
// feasibility tolerance, so a result the server calls feasible never touches in collision.ts.
const OBSTACLE_SLACK = 0.1;
// shortcut: a 2-point shape (a segment to collision.ts) is sent as a rectangle this thin on each side; upgrade if the server ever takes degenerate polygons.
const SEGMENT_HALF_WIDTH = 0.01;
// The server rejects the whole request beyond these.
const MAX_OBSTACLES = 16;
const MAX_OBSTACLE_VERTICES = 16;
// pedro_opt caps waypoints at 12: start, end and this many control points.
const MAX_CONTROL_POINTS = 10;

const avoidsObstacles = (settings: Settings) =>
  Boolean(settings.experimentalFeatures?.obstacles);

/** Obstacle polygons in the server's 3..16 point form. collision.ts treats a 2-point shape as a segment, so it becomes a thin rectangle. */
function obstaclePolygons(shapes: Shape[]): number[][][] {
  const polygons: number[][][] = [];
  for (const { vertices } of shapes) {
    if (vertices.length >= 3) {
      polygons.push(vertices.map((v) => [v.x, v.y]));
    } else if (vertices.length === 2) {
      const [a, b] = vertices;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length === 0) continue;
      const nx = (-(b.y - a.y) / length) * SEGMENT_HALF_WIDTH;
      const ny = ((b.x - a.x) / length) * SEGMENT_HALF_WIDTH;
      polygons.push([
        [a.x + nx, a.y + ny],
        [b.x + nx, b.y + ny],
        [b.x - nx, b.y - ny],
        [a.x - nx, a.y - ny],
      ]);
    }
  }
  if (
    polygons.length > MAX_OBSTACLES ||
    polygons.some((polygon) => polygon.length > MAX_OBSTACLE_VERTICES)
  ) {
    throw new Error(
      `Too many obstacles for the optimizer (at most ${MAX_OBSTACLES} shapes of ${MAX_OBSTACLE_VERTICES} points).`,
    );
  }
  return polygons;
}

/** Why the optimizer can't take this segment, or null when it can. */
export function optimizeBlocker(
  { line, ancestors }: FlatSegment,
  settings: Settings,
): string | null {
  if (line.locked) return "Path is locked";
  if (line.throughPoints?.length) return "Through-curves can't be optimized yet";
  if (!line.controlPoints.length) return "Add a control point to optimize";
  if (line.controlPoints.length > MAX_CONTROL_POINTS)
    return `The optimizer takes at most ${MAX_CONTROL_POINTS} control points`;
  if (line.controlPoints.some((point) => point.locked))
    return "Unlock the control points to optimize";
  // The server only models constant, linear and tangential headings on their own segment.
  if (
    avoidsObstacles(settings) &&
    (line.heading.type === "piecewise" ||
      ancestors.some((group) => group.heading))
  )
    return "Piecewise/group headings can't avoid obstacles yet";
  return null;
}

export function buildOptimizationPayload(
  lineId: string,
  startPoint: StartPose,
  paths: Path[],
  shapes: Shape[],
  settings: Settings,
) {
  // The optimizer works on one drivable curve, which may sit inside a group.
  const segment = flattenToAtomicSegments(startPoint, paths).find(
    (entry) => entry.line.id === lineId,
  );
  if (!segment) throw new Error("Line not found");

  const { line, curve } = segment;
  const waypoints = curve.controlPoints.map((p) => [p.x, p.y]);
  const avoid = avoidsObstacles(settings);
  // Same clamp as robotFootprint in model/collision.ts.
  const margin = avoid ? Math.max(0, settings.safetyMargin || 0) : 0;

  return {
    waypoints,
    start_heading_degrees: headingAngleAt(
      line.heading,
      "start",
      headingGeometryAt(curve, 0),
    ),
    end_heading_degrees: headingAngleAt(
      line.heading,
      "end",
      headingGeometryAt(curve, 1),
    ),
    x_velocity: settings.forwardVelocity,
    y_velocity: settings.strafeVelocity,
    angular_velocity: settings.aVelocity,
    friction_coefficient: settings.kFriction,
    robot_width: settings.rLength,
    robot_height: settings.rWidth,
    min_coord_field: 0,
    max_coord_field: FIELD_SIZE,
    interpolation:
      line.heading.type === "tangential"
        ? "tangent"
        : line.heading.type === "constant"
          ? "constant"
          : "linear",
    obstacles: avoid ? obstaclePolygons(shapes) : [],
    // The server ramps this up from 0 at the segment's ends (1 in per margin_ramp in), as collision.ts does,
    // and applies it to walls and obstacles. The slack makes its clean result clean here too.
    safety_margin: avoid ? margin + OBSTACLE_SLACK : 0,
    margin_ramp: MARGIN_RAMP,
  };
}

export async function runOptimization(
  payload: ReturnType<typeof buildOptimizationPayload>,
): Promise<unknown> {
  const response = await fetch(`${OPTIMIZER_BASE_URL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Optimizer request failed (${response.status}): ${errorText || response.statusText}`,
    );
  }

  const data = await response.json();
  if (data?.status === "completed" && data.result) {
    return data.result;
  }
  if (data?.status === "error") {
    throw new Error(`Optimization failed: ${data.message || "Unknown error"}`);
  }
  throw new Error("Unexpected API response format");
}

/**
 * Fold an optimizer result back into the line list. Returns the updated lines,
 * or null when the response produced no applicable change.
 */
export function applyOptimizedWaypoints(
  paths: Path[],
  lineId: string,
  result: unknown,
  targetControlPointIndex?: number,
): Path[] | null {
  // The optimizer answers with either the waypoints or an object holding them.
  const waypoints = Array.isArray(result)
    ? result
    : (result as { optimized_waypoints?: unknown } | null)?.optimized_waypoints;

  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    throw new Error("Unexpected optimizer response format.");
  }

  const points = waypoints as number[][];
  const [endX, endY] = points[points.length - 1];
  const interior = points
    .slice(1, points.length - 1)
    .map((p) => ({ x: p[0], y: p[1] }));

  let applied = true;
  const next = replaceSegment(paths, lineId, (current) => {
    if (typeof targetControlPointIndex === "number") {
      // Only replace the targeted control point; keep others and endpoint untouched
      const replacement =
        interior[targetControlPointIndex] ?? interior[interior.length - 1];
      const cps = [...current.controlPoints];
      if (!replacement || !cps[targetControlPointIndex]) {
        applied = false;
        return current;
      }
      cps[targetControlPointIndex] = replacement;
      return { ...current, controlPoints: cps };
    }

    // Replace entire line (control points and endpoint)
    return {
      ...current,
      endPoint: {
        ...current.endPoint,
        x: endX,
        y: endY,
      },
      controlPoints: interior,
    };
  });

  if (!applied || next === paths) return null;
  return next;
}

/**
 * The one warning to show after optimizing `lineIds`, or null when obstacles are off or
 * the Visualizer's own collision check finds them clear. `unchanged` are the ones the
 * optimizer left as they were.
 */
export function describeOptimization(
  doc: ProjectDoc,
  settings: Settings,
  lineIds: string[],
  unchanged: string[],
): string | null {
  if (!avoidsObstacles(settings)) return null;
  // Same check playback draws in red.
  const { timeline } = calculateVisualizationPathTime(
    doc.startPoint,
    doc.lines,
    settings,
    doc.sequence,
  );
  const hit = new Set(findCollisions(doc, timeline).map((c) => c.lineId));
  const stuck = lineIds.filter((id) => hit.has(id));
  if (!stuck.length) return null;
  return stuck.every((id) => unchanged.includes(id))
    ? "Optimizer could not clear the obstacles or the wall. Move an endpoint out of the obstacle or add a control point."
    : "Optimizer could not find a path clear of the obstacles or the wall; remaining overlaps are shown in red.";
}
