import { FIELD_SIZE } from "../config/defaults";
import type { ProjectDoc } from "../io/project";
import type {
  BasePoint,
  Heading,
  Path,
  PiecewiseHeadingSegment,
} from "../types";

/**
 * Pedro's `PoseFactory.mirrorX(axis)` reflects across the vertical line
 * x = axis: x → 2·axis − x and heading → 180° − heading. Code export emits
 * that call, so mirroring a document here has to give the same poses.
 */
export const MIRROR_AXIS = FIELD_SIZE / 2;

const mirrorX = (x: number) => 2 * MIRROR_AXIS - x;

export function mirrorAngle(degrees: number): number {
  return 180 - degrees;
}

function mirrorPoint<T extends BasePoint>(point: T): T {
  return { ...point, x: mirrorX(point.x) };
}

function mirrorPiecewiseSegment(
  segment: PiecewiseHeadingSegment,
): PiecewiseHeadingSegment {
  const parameters = segment.parameters;
  if (!parameters) return segment;
  const mirrored = { ...parameters };
  if (mirrored.startDeg !== undefined) {
    mirrored.startDeg = mirrorAngle(mirrored.startDeg);
  }
  if (mirrored.endDeg !== undefined) {
    mirrored.endDeg = mirrorAngle(mirrored.endDeg);
  }
  if (mirrored.degrees !== undefined) {
    mirrored.degrees = mirrorAngle(mirrored.degrees);
  }
  if (mirrored.point) mirrored.point = mirrorPoint(mirrored.point);
  return { ...segment, parameters: mirrored };
}

export function mirrorHeading(heading: Heading): Heading {
  switch (heading.type) {
    case "linear":
      return {
        ...heading,
        startDeg: mirrorAngle(heading.startDeg),
        endDeg: mirrorAngle(heading.endDeg),
      };
    case "constant":
      return { ...heading, degrees: mirrorAngle(heading.degrees) };
    // The tangent is mirrored with the path, so facing along it still holds.
    case "tangential":
      return heading;
    case "piecewise":
      return {
        ...heading,
        piecewiseHeading: {
          ...heading.piecewiseHeading,
          segments: heading.piecewiseHeading.segments.map(
            mirrorPiecewiseSegment,
          ),
        },
      };
  }
}

function mirrorPath(path: Path): Path {
  if (path.kind === "compound") {
    return {
      ...path,
      ...(path.heading && { heading: mirrorHeading(path.heading) }),
      segments: path.segments.map(mirrorPath),
    };
  }
  return {
    ...path,
    heading: mirrorHeading(path.heading),
    endPoint: mirrorPoint(path.endPoint),
    controlPoints: path.controlPoints.map(mirrorPoint),
    ...(path.throughPoints && {
      throughPoints: path.throughPoints.map(mirrorPoint),
    }),
  };
}

/** The document reflected across the field's vertical center line. */
export function mirrorProject(doc: ProjectDoc): ProjectDoc {
  return {
    ...doc,
    startPoint: {
      ...mirrorPoint(doc.startPoint),
      headingDeg: mirrorAngle(doc.startPoint.headingDeg),
    },
    lines: doc.lines.map(mirrorPath),
    shapes: doc.shapes.map((shape) => ({
      ...shape,
      vertices: shape.vertices.map(mirrorPoint),
    })),
    fieldPoints: doc.fieldPoints.map(mirrorPoint),
  };
}
