import type { ProjectDoc } from "../io/project";
import type { BasePoint, Heading, Path } from "../types";
import {
  fromDisplay,
  toDisplay,
  type CoordinateSettings,
} from "../utils/coordinates";

/** Keep editable tile positions while changing their physical inch spacing. */
export function preserveTileCoordinates(
  doc: ProjectDoc,
  before: CoordinateSettings,
  after: CoordinateSettings,
): ProjectDoc {
  const point = <T extends BasePoint>(p: T): T => ({
    ...p,
    ...fromDisplay(toDisplay(p, before), after),
  });
  const heading = (h: Heading): Heading =>
    h.type !== "piecewise"
      ? h
      : {
          ...h,
          piecewiseHeading: {
            ...h.piecewiseHeading,
            segments: h.piecewiseHeading.segments.map((segment) => ({
              ...segment,
              ...(segment.parameters?.point
                ? {
                    parameters: {
                      ...segment.parameters,
                      point: point(segment.parameters.point),
                    },
                  }
                : {}),
            })),
          },
        };
  const path = (p: Path): Path =>
    p.kind === "compound"
      ? {
          ...p,
          segments: p.segments.map(path),
          ...(p.heading ? { heading: heading(p.heading) } : {}),
        }
      : {
          ...p,
          endPoint: point(p.endPoint),
          controlPoints: p.controlPoints.map(point),
          ...(p.throughPoints
            ? { throughPoints: p.throughPoints.map(point) }
            : {}),
          heading: heading(p.heading),
        };
  return {
    ...doc,
    startPoint: point(doc.startPoint),
    lines: doc.lines.map(path),
    fieldPoints: doc.fieldPoints.map(point),
    // Linked outlines use image calibration, including clipping at field walls.
    shapes: doc.shapes.map((shape) =>
      shape.fieldCalibration
        ? shape
        : {
            ...shape,
            vertices: shape.vertices.map(point),
          },
    ),
  };
}
