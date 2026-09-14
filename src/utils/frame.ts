import { DEFAULT_SETTINGS, FIELD_SIZE } from "../config/defaults";
import type {
  Axes,
  BasePoint,
  Heading,
  Origin,
  Path,
  Shape,
  StartPose,
} from "../types";
import type { FieldPoint } from "./fieldPoints";
import { normalizeAngleDegrees } from "./math";

export interface Frame {
  center: BasePoint;
  axes: Axes;
}

/** The frame documents are in when they declare no frame of their own. */
export const LEGACY_FRAME: Frame = { center: { x: 0, y: 0 }, axes: "legacy" };

export function frameFor(origin: Origin, axes: Axes): Frame {
  const half = FIELD_SIZE / 2;
  return {
    center: origin === "center" ? { x: half, y: half } : { x: 0, y: 0 },
    axes,
  };
}

export function frameForSettings(settings: {
  origin?: Origin;
  axes?: Axes;
}): Frame {
  return frameFor(
    settings.origin ?? DEFAULT_SETTINGS.origin ?? "center",
    settings.axes ?? DEFAULT_SETTINGS.axes ?? "first",
  );
}

export function isOrigin(value: unknown): value is Origin {
  return value === "center" || value === "bottom-left";
}

export function isAxes(value: unknown): value is Axes {
  return value === "first" || value === "legacy";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The frame a parsed document is expressed in. A document that declares
 * neither field predates the convention and is read as {@link LEGACY_FRAME}.
 */
export function readFrame(data: unknown): Frame {
  if (!data || typeof data !== "object") return LEGACY_FRAME;
  const source = data as { center?: unknown; axes?: unknown };

  const center = source.center as BasePoint | undefined;
  return {
    center:
      center && isFiniteNumber(center.x) && isFiniteNumber(center.y)
        ? { x: center.x, y: center.y }
        : { ...LEGACY_FRAME.center },
    axes: isAxes(source.axes) ? source.axes : LEGACY_FRAME.axes,
  };
}

/**
 * Canonical axes are Pedro's: +x toward the red alliance, +y a quarter turn
 * counter-clockwise of it. FIRST's +x points away from the audience, which is
 * canonical +y, and FIRST's +y is canonical -x.
 */
export function toDocFrame<T extends BasePoint>(point: T, frame: Frame): T {
  const x = point.x - frame.center.x;
  const y = point.y - frame.center.y;
  return frame.axes === "first"
    ? { ...point, x: y, y: -x }
    : { ...point, x, y };
}

export function toCanonical<T extends BasePoint>(point: T, frame: Frame): T {
  const { x, y } =
    frame.axes === "first"
      ? { x: -point.y, y: point.x }
      : { x: point.x, y: point.y };
  return { ...point, x: x + frame.center.x, y: y + frame.center.y };
}

/**
 * Angles are normalized to (-180, 180] so that the quarter turn cannot push a
 * heading outside the range the editors accept.
 */
export function headingToDocFrame(degrees: number, frame: Frame): number {
  return frame.axes === "first" ? normalizeAngleDegrees(degrees - 90) : degrees;
}

export function headingToCanonical(degrees: number, frame: Frame): number {
  return frame.axes === "first" ? normalizeAngleDegrees(degrees + 90) : degrees;
}

/**
 * The field's extent in the document frame. Rotating about a corner moves the
 * field out of the positive quadrant, so these bounds go negative for some
 * frames and are not simply 0..FIELD_SIZE shifted.
 */
export function docBounds(frame: Frame): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const { x: cx, y: cy } = frame.center;
  // A quarter turn sends canonical x to document -y, so that axis inverts.
  return frame.axes === "first"
    ? {
        minX: -cy,
        maxX: FIELD_SIZE - cy,
        minY: cx - FIELD_SIZE,
        maxY: cx,
      }
    : {
        minX: -cx,
        maxX: FIELD_SIZE - cx,
        minY: -cy,
        maxY: FIELD_SIZE - cy,
      };
}

/**
 * Replace one axis of a canonical point with a value the user typed in the
 * document frame, leaving the other axis where it was on screen.
 */
export function setDocCoordinate<T extends BasePoint>(
  point: T,
  axis: "x" | "y",
  value: number,
  frame: Frame,
): T {
  const doc = toDocFrame(point, frame);
  return toCanonical({ ...doc, [axis]: value }, frame);
}

/** A rigid transform applied to every position and angle in a document. */
export interface PoseTransform {
  point: <T extends BasePoint>(point: T) => T;
  heading: (degrees: number) => number;
}

/** Reflects across the field's x axis, the alliance-mirror of a path. */
export const MIRROR_X: PoseTransform = {
  point: (point) => ({ ...point, x: FIELD_SIZE - point.x }),
  heading: (degrees) => normalizeAngleDegrees(180 - degrees),
};

export function frameTransform(
  frame: Frame,
  direction: "toDoc" | "toCanonical",
): PoseTransform {
  return direction === "toDoc"
    ? {
        point: (point) => toDocFrame(point, frame),
        heading: (degrees) => headingToDocFrame(degrees, frame),
      }
    : {
        point: (point) => toCanonical(point, frame),
        heading: (degrees) => headingToCanonical(degrees, frame),
      };
}

/**
 * Tangential headings follow the path, which is transformed already, so only
 * stored angles move.
 */
function transformHeading(heading: Heading, apply: PoseTransform): Heading {
  switch (heading.type) {
    case "linear":
      return {
        ...heading,
        startDeg: apply.heading(heading.startDeg),
        endDeg: apply.heading(heading.endDeg),
      };
    case "constant":
      return { ...heading, degrees: apply.heading(heading.degrees) };
    case "tangential":
      return heading;
    case "piecewise":
      return {
        ...heading,
        piecewiseHeading: {
          segments: heading.piecewiseHeading.segments.map((segment) => {
            const parameters = segment.parameters;
            if (!parameters) return segment;
            const angle = (degrees?: number) =>
              degrees === undefined ? undefined : apply.heading(degrees);
            return {
              ...segment,
              parameters: {
                ...parameters,
                startDeg: angle(parameters.startDeg),
                endDeg: angle(parameters.endDeg),
                degrees: angle(parameters.degrees),
                point: parameters.point && apply.point(parameters.point),
              },
            };
          }),
        },
      };
  }
}

function transformPaths(paths: Path[], apply: PoseTransform): Path[] {
  return paths.map((path): Path => {
    if (path.kind === "compound") {
      return {
        ...path,
        segments: transformPaths(path.segments, apply),
        heading: path.heading
          ? transformHeading(path.heading, apply)
          : undefined,
      };
    }
    return {
      ...path,
      endPoint: apply.point(path.endPoint),
      controlPoints: path.controlPoints.map(apply.point),
      heading: transformHeading(path.heading, apply),
    };
  });
}

export interface FramedDoc {
  startPoint: StartPose;
  lines: Path[];
  shapes: Shape[];
  fieldPoints?: FieldPoint[];
}

/**
 * Apply a transform to every position and angle in a document. Field points
 * must already be normalized to objects; the on-disk array form is not handled
 * here.
 *
 * `scenery` covers obstacles and markers, which a frame change must move but a
 * path mirror deliberately leaves where they are.
 */
export function mapDoc<T extends FramedDoc>(
  doc: T,
  apply: PoseTransform,
  { scenery = true }: { scenery?: boolean } = {},
): T {
  return {
    ...doc,
    startPoint: doc.startPoint && {
      ...apply.point(doc.startPoint),
      headingDeg: apply.heading(doc.startPoint.headingDeg),
    },
    lines: transformPaths(doc.lines ?? [], apply),
    ...(scenery
      ? {
          shapes: (doc.shapes ?? []).map((shape) => ({
            ...shape,
            vertices: (shape.vertices ?? []).map(apply.point),
          })),
          ...(doc.fieldPoints
            ? { fieldPoints: doc.fieldPoints.map(apply.point) }
            : {}),
        }
      : {}),
  };
}

/** Move a document between coordinate frames. */
export function transformDoc<T extends FramedDoc>(
  doc: T,
  frame: Frame,
  direction: "toDoc" | "toCanonical",
): T {
  return mapDoc(doc, frameTransform(frame, direction));
}
