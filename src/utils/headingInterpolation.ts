import type {
  AtomicPath,
  BasePoint,
  Heading,
  PiecewiseHeadingInterpolation,
  PiecewiseHeadingInterpolationType,
  PiecewiseHeadingSegment,
  Point,
} from "../types";
import {
  clamp,
  getTangentAngle,
  interpolateAngleDegrees,
  normalizeAngleDegrees,
  radiansToDegrees,
  shortestRotation,
} from "./math";
import { curveGeometryAtCompletion, lineCurvePoints } from "./pathTraversal";

/** Shortest stretch of progress a segment is allowed to cover. */
export const MIN_SEGMENT_LENGTH = 0.0001;

/** `getPointAndTangentAtProgress` in ./pathTraversal returns this shape. */
export interface HeadingGeometry {
  /** Where the robot sits, in field inches. */
  point: BasePoint;
  /** The curve's tangent there, in degrees counter-clockwise from +x. */
  tangentDegrees: number;
  /** Needed to read geometry somewhere other than where the robot is. */
  curvePoints?: BasePoint[];
}

/**
 * The single angle a heading rule resolves to at one end of its segment.
 *
 * Tangential and facing-point rules have no fixed angle on their own, so
 * `geometry` has to be supplied for those to resolve to anything but 0.
 */
export function headingAngleAt(
  heading: Heading,
  role: "start" | "end",
  geometry?: HeadingGeometry,
): number {
  switch (heading.type) {
    case "constant":
      return heading.degrees;
    case "linear":
      return role === "start" ? heading.startDeg : heading.endDeg;
    case "tangential":
      return geometry
        ? normalizeAngleDegrees(
            geometry.tangentDegrees + (heading.reverse ? 180 : 0),
          )
        : 0;
    case "piecewise":
      return geometry
        ? evaluatePiecewiseHeading(
            heading.piecewiseHeading,
            role === "start" ? 0 : 1,
            geometry,
          )
        : piecewiseEdgeHeading(heading.piecewiseHeading, role);
  }
}

/**
 * The heading a segment starts at, in field degrees.
 *
 * `heading` and `t` are passed in when a group overrides this segment's own
 * heading: the rule then belongs to the group and `t` is the position within
 * it, so a sweep is read part-way through rather than restarted.
 */
export function getLineStartHeading(
  line: AtomicPath | undefined,
  previousPoint: Point,
  heading: Heading | undefined = line?.heading,
  t = 0,
): number {
  if (!line || !line.endPoint || !heading) return 0;

  const nextPoint =
    line.controlPoints.length > 0 ? line.controlPoints[0] : line.endPoint;
  return edgeHeading(heading, t, {
    point: previousPoint,
    tangentDegrees: getTangentAngle(previousPoint, nextPoint),
    curvePoints: lineCurvePoints(previousPoint, line),
  });
}

/** The heading a segment ends at. See `getLineStartHeading` for `heading`/`t`. */
export function getLineEndHeading(
  line: AtomicPath | undefined,
  previousPoint: Point,
  heading: Heading | undefined = line?.heading,
  t = 1,
): number {
  if (!line || !line.endPoint || !heading) return 0;

  const priorPoint =
    line.controlPoints.length > 0
      ? line.controlPoints[line.controlPoints.length - 1]
      : previousPoint;
  return edgeHeading(heading, t, {
    point: line.endPoint,
    tangentDegrees: getTangentAngle(priorPoint, line.endPoint),
    curvePoints: lineCurvePoints(previousPoint, line),
  });
}

function edgeHeading(
  heading: Heading,
  t: number,
  geometry: HeadingGeometry,
): number {
  switch (heading.type) {
    case "constant":
      return heading.degrees;
    case "linear":
      return shortestRotation(heading.startDeg, heading.endDeg, t);
    case "tangential":
      return normalizeAngleDegrees(
        geometry.tangentDegrees + (heading.reverse ? 180 : 0),
      );
    case "piecewise":
      return evaluatePiecewiseHeading(heading.piecewiseHeading, t, geometry);
  }
}

function piecewiseEdgeHeading(
  interpolation: PiecewiseHeadingInterpolation,
  role: "start" | "end",
): number {
  const segments = interpolation?.segments ?? [];
  const segment =
    role === "start" ? segments[0] : segments[segments.length - 1];
  const parameters = segment?.parameters;
  if (!parameters) return 0;
  if (segment.interpolationType === "constant") return parameters.degrees ?? 0;
  if (segment.interpolationType === "linear") {
    return (role === "start" ? parameters.startDeg : parameters.endDeg) ?? 0;
  }
  return 0;
}

function clonePoint(point?: BasePoint): BasePoint | undefined {
  if (!point) return undefined;
  return {
    x: Number(point.x) || 0,
    y: Number(point.y) || 0,
    locked: point.locked,
  };
}

function defaultParameters(
  type: PiecewiseHeadingInterpolationType,
): PiecewiseHeadingSegment["parameters"] {
  switch (type) {
    case "constant":
      return { degrees: 0 };
    case "linear":
      return { startDeg: 0, endDeg: 0 };
    case "facing-point":
      return { point: { x: 0, y: 0 } };
    default:
      return undefined;
  }
}

export function segmentSupportsReverse(
  type: PiecewiseHeadingInterpolationType,
): boolean {
  return type === "linear" || type === "tangential" || type === "facing-point";
}

/** Only these have a start angle for `continueFromPrevious` to drive. */
export function segmentSupportsContinuation(
  type: PiecewiseHeadingInterpolationType,
): boolean {
  return type === "linear" || type === "constant";
}

/**
 * The angle segment `index` finishes on, following links back through earlier
 * segments. Null when it needs geometry the caller did not supply.
 */
export function piecewiseSegmentEndAngle(
  segments: PiecewiseHeadingSegment[],
  index: number,
  geometry?: HeadingGeometry,
): number | null {
  const segment = segments[index];
  if (!segment) return null;

  const parameters = segment.parameters ?? {};

  switch (segment.interpolationType) {
    case "linear":
      return normalizeAngleDegrees(parameters.endDeg ?? 0);
    case "constant":
      return segment.continueFromPrevious && index > 0
        ? piecewiseSegmentEndAngle(segments, index - 1, geometry)
        : normalizeAngleDegrees(parameters.degrees ?? 0);
    case "tangential":
    case "facing-point": {
      if (!geometry) return null;
      const boundary = geometryAtCompletion(geometry, segment.endProgress);
      return segment.interpolationType === "tangential"
        ? tangentialAngle(boundary, segment.reversed)
        : facingPointAngle(boundary, parameters.point, segment.reversed);
    }
  }
}

/** The angle a segment begins on, which a link takes from the segment before. */
function segmentStartAngle(
  segments: PiecewiseHeadingSegment[],
  index: number,
  geometry: HeadingGeometry,
  fallback: number,
): number {
  const segment = segments[index];
  if (!segment.continueFromPrevious || index === 0) return fallback;
  return piecewiseSegmentEndAngle(segments, index - 1, geometry) ?? fallback;
}

function geometryAtCompletion(
  geometry: HeadingGeometry,
  completion: number,
): HeadingGeometry {
  if (!geometry.curvePoints) return geometry;
  return {
    ...curveGeometryAtCompletion(geometry.curvePoints, completion),
    curvePoints: geometry.curvePoints,
  };
}

function tangentialAngle(
  geometry: HeadingGeometry,
  reversed?: boolean,
): number {
  return normalizeAngleDegrees(geometry.tangentDegrees + (reversed ? 180 : 0));
}

function facingPointAngle(
  geometry: HeadingGeometry,
  target: BasePoint | undefined,
  reversed?: boolean,
): number {
  const point = target || { x: 0, y: 0 };
  const base = radiansToDegrees(
    Math.atan2(point.y - geometry.point.y, point.x - geometry.point.x),
  );
  return normalizeAngleDegrees(base + (reversed ? 180 : 0));
}

export function createDefaultPiecewiseSegment(): PiecewiseHeadingSegment {
  return {
    startProgress: 0,
    endProgress: 1,
    interpolationType: "linear",
    reversed: false,
    parameters: defaultParameters("linear"),
  };
}

export function createDefaultPiecewiseHeadingInterpolation(): PiecewiseHeadingInterpolation {
  return { segments: [createDefaultPiecewiseSegment()] };
}

function normalizeSegment(
  segment: PiecewiseHeadingSegment,
): PiecewiseHeadingSegment {
  const interpolationType = segment.interpolationType || "linear";
  const parameters = segment.parameters
    ? {
        ...segment.parameters,
        point: clonePoint(segment.parameters.point),
      }
    : defaultParameters(interpolationType);

  return {
    startProgress: clamp(Number(segment.startProgress ?? 0), 0, 1),
    endProgress: clamp(Number(segment.endProgress ?? 1), 0, 1),
    interpolationType,
    reversed: segmentSupportsReverse(interpolationType)
      ? !!segment.reversed
      : false,
    continueFromPrevious:
      segmentSupportsContinuation(interpolationType) &&
      !!segment.continueFromPrevious,
    parameters,
  };
}

export function normalizePiecewiseHeadingInterpolation(
  input?: PiecewiseHeadingInterpolation,
): PiecewiseHeadingInterpolation {
  const sourceSegments = input?.segments?.length
    ? input.segments
    : [createDefaultPiecewiseSegment()];

  const sorted = sourceSegments
    .map(normalizeSegment)
    .sort((left, right) => left.startProgress - right.startProgress);

  const repaired: PiecewiseHeadingSegment[] = [];
  let cursor = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const source = sorted[index];
    const isLast = index === sorted.length - 1;
    const startProgress = index === 0 ? 0 : cursor;
    // Out of room: this segment and every one after it would be zero-length,
    // which Pedro rejects, so stop and let the previous one run to 1.
    if (index > 0 && startProgress >= 1) break;
    const desiredEnd = isLast
      ? 1
      : Math.max(source.endProgress, startProgress + MIN_SEGMENT_LENGTH);
    const endProgress = clamp(
      desiredEnd,
      startProgress + MIN_SEGMENT_LENGTH,
      1,
    );

    repaired.push({
      ...source,
      startProgress,
      endProgress,
      continueFromPrevious: index > 0 && !!source.continueFromPrevious,
    });

    cursor = endProgress;
  }

  if (repaired.length === 0) {
    return createDefaultPiecewiseHeadingInterpolation();
  }

  // Adjacent segments holding identical settings must not be collapsed: a
  // fresh split produces two identical halves, so merging undoes every split.
  repaired[0].startProgress = 0;
  repaired[repaired.length - 1].endProgress = 1;

  return { segments: repaired };
}

/**
 * Reports what normalization had to repair. Takes the raw input: the
 * normalized form always passes, since normalizing is what fixes these.
 */
export function validatePiecewiseHeadingInterpolation(
  input?: PiecewiseHeadingInterpolation,
): string | null {
  const segments = input?.segments;
  if (!segments?.length) {
    return "Piecewise heading requires at least one segment; a default one is in use.";
  }

  const ordered = [...segments].sort(
    (left, right) => left.startProgress - right.startProgress,
  );

  if (ordered[0].startProgress !== 0) {
    return "The first segment must start at 0; it has been extended back.";
  }

  if (ordered[ordered.length - 1].endProgress !== 1) {
    return "The final segment must end at 1; it has been extended forward.";
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const segment = ordered[index];
    if (segment.endProgress <= segment.startProgress) {
      return "Piecewise segments must have positive length; a segment has been resized.";
    }

    const parameters = segment.parameters || {};
    if (
      segment.interpolationType === "linear" &&
      (parameters.startDeg === undefined || parameters.endDeg === undefined)
    ) {
      return "A linear segment is missing its start or end heading; 0 is in use.";
    }

    if (
      segment.interpolationType === "constant" &&
      parameters.degrees === undefined
    ) {
      return "A constant segment is missing its heading; 0 is in use.";
    }

    if (segment.interpolationType === "facing-point" && !parameters.point) {
      return "A facing-point segment is missing its target; (0, 0) is in use.";
    }

    const next = ordered[index + 1];
    if (next && segment.endProgress !== next.startProgress) {
      return "Piecewise segments must not leave gaps or overlap; they have been closed up.";
    }
  }

  return null;
}

export function degreesToRadians(degrees: number): number {
  return (normalizeAngleDegrees(degrees) * Math.PI) / 180;
}

/** `progress` is arc-length completion, not the curve parameter. */
export function evaluatePiecewiseHeading(
  interpolation: PiecewiseHeadingInterpolation,
  progress: number,
  geometry: HeadingGeometry,
): number {
  const segments =
    normalizePiecewiseHeadingInterpolation(interpolation).segments;
  const last = segments.length - 1;
  const index = segments.findIndex(
    (entry, entryIndex) =>
      progress >= entry.startProgress &&
      (progress <= entry.endProgress || entryIndex === last),
  );
  const segment = segments[index] ?? segments[last];

  const localT = clamp(
    (progress - segment.startProgress) /
      Math.max(segment.endProgress - segment.startProgress, 1e-9),
    0,
    1,
  );

  // Geometry-dependent rules do not have an explicit start angle. Blend them
  // from the preceding rule briefly so changing rule type cannot snap the
  // visualized robot heading at a piecewise boundary.
  if (
    index > 0 &&
    localT < 0.12 &&
    (segment.interpolationType === "tangential" ||
      segment.interpolationType === "facing-point")
  ) {
    const previousAngle = piecewiseSegmentEndAngle(segments, index - 1, geometry);
    if (previousAngle !== null) {
      const targetAngle =
        segment.interpolationType === "tangential"
          ? tangentialAngle(geometry, segment.reversed)
          : facingPointAngle(geometry, segment.parameters?.point, segment.reversed);
      return interpolateAngleDegrees(
        previousAngle,
        targetAngle,
        localT / 0.12,
        false,
      );
    }
  }

  switch (segment.interpolationType) {
    case "constant":
      return normalizeAngleDegrees(
        segmentStartAngle(
          segments,
          index,
          geometry,
          segment.parameters?.degrees ?? 0,
        ),
      );
    case "linear":
      return interpolateAngleDegrees(
        segmentStartAngle(
          segments,
          index,
          geometry,
          segment.parameters?.startDeg ?? 0,
        ),
        segment.parameters?.endDeg ?? 0,
        localT,
        !!segment.reversed,
      );
    case "facing-point":
      return facingPointAngle(
        geometry,
        segment.parameters?.point,
        segment.reversed,
      );
    case "tangential":
    default:
      return tangentialAngle(geometry, segment.reversed);
  }
}
