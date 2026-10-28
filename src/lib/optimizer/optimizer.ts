import type { Path, Settings, Shape, StartPose } from "../../types";
import { FIELD_SIZE } from "../../config/defaults";
import {
  headingAngleAt,
  headingGeometryAt,
} from "../../utils/headingInterpolation";
import {
  flattenToAtomicSegments,
  replaceSegment,
} from "../../utils/pathTraversal";

export const OPTIMIZER_BASE_URL = "https://fpa.pedropathing.com";

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
    obstacles: shapes.map((shape) => shape.vertices.map((v) => [v.x, v.y])),
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
