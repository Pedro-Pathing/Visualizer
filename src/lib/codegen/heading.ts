import type {
  Heading,
  PiecewiseHeadingInterpolation,
  PiecewiseHeadingSegment,
} from "../../types";
import type { Curve } from "../../model/curve";
import {
  headingGeometryAt,
  piecewiseSegmentEndAngle,
} from "../../utils/headingInterpolation";
import type { HeadingCall, InterpolatorRef, PiecewiseNode } from "./types";

export interface HeadingCallContext {
  startPoseVar: string;
  endPoseVar: string;
  endX: number;
  endY: number;
  /** The curve this heading runs along, when it is a single segment's. */
  curve?: Curve;
  definePose(
    nameHint: string,
    x: number,
    y: number,
    headingDeg: number,
  ): string;
  warn(message: string): void;
}

export function headingCall(
  heading: Heading,
  ctx: HeadingCallContext,
): HeadingCall {
  switch (heading.type) {
    case "constant":
      return { kind: "constant", poseVar: ctx.endPoseVar };
    case "linear":
      return {
        kind: "linear",
        startPoseVar: ctx.startPoseVar,
        endPoseVar: ctx.endPoseVar,
      };
    case "tangential":
      return { kind: "tangential", reversed: heading.reverse };
    case "piecewise":
      return piecewiseCall(heading.piecewiseHeading, ctx);
  }
}

function piecewiseCall(
  interpolation: PiecewiseHeadingInterpolation,
  ctx: HeadingCallContext,
): HeadingCall {
  const segments = [...(interpolation?.segments ?? [])].sort(
    (a, b) => a.startProgress - b.startProgress,
  );
  if (segments.length === 0) {
    return { kind: "unsupported", reason: "piecewise heading has no segments" };
  }

  const nodes: PiecewiseNode[] = [];
  let previousT = 0;

  segments.forEach((segment, index) => {
    const untilT = Math.min(Math.max(segment.endProgress, 0), 1);
    if (untilT <= previousT) {
      ctx.warn(
        `skipped piecewise segment ${index + 1}: its end progress (${segment.endProgress}) does not advance past ${previousT}`,
      );
      return;
    }
    const interpolator = interpolatorRef(segment, index, segments, ctx);
    if (!interpolator) return;
    nodes.push({
      untilT,
      interpolator,
      reversed: !!segment.reversed && interpolator.kind !== "constant",
    });
    previousT = untilT;
  });

  if (nodes.length === 0) {
    return {
      kind: "unsupported",
      reason: "no usable segments in the piecewise heading",
    };
  }

  // Pedro throws if the nodes do not run through t = 1.
  const last = nodes[nodes.length - 1];
  if (last.untilT < 1) {
    ctx.warn(
      `extended the last piecewise segment from ${last.untilT} to 1 (Pedro requires full coverage)`,
    );
    last.untilT = 1;
  }

  return { kind: "piecewise", nodes };
}

/** Pedro cannot express a link, so it is resolved here and baked into a pose. */
function linkedStartAngle(
  segments: PiecewiseHeadingSegment[],
  index: number,
  ctx: HeadingCallContext,
): number | null {
  const segment = segments[index];
  if (!segment.continueFromPrevious || index === 0) return null;

  const geometry = ctx.curve
    ? headingGeometryAt(ctx.curve, segment.startProgress)
    : undefined;

  const angle = piecewiseSegmentEndAngle(segments, index - 1, geometry);
  if (angle === null) {
    ctx.warn(
      `piecewise segment ${index + 1} continues from segment ${index}, whose angle depends on path geometry that is not available here; its own start angle was used instead`,
    );
  }
  return angle;
}

function interpolatorRef(
  segment: PiecewiseHeadingSegment,
  index: number,
  segments: PiecewiseHeadingSegment[],
  ctx: HeadingCallContext,
): InterpolatorRef | null {
  const parameters = segment.parameters ?? {};
  const label = `${ctx.endPoseVar}Segment${index + 1}`;
  const linkedStart = linkedStartAngle(segments, index, ctx);

  switch (segment.interpolationType) {
    case "tangential":
      return { kind: "tangent" };
    case "constant":
      return {
        kind: "constant",
        poseVar: ctx.definePose(
          `${label}Heading`,
          ctx.endX,
          ctx.endY,
          linkedStart ?? parameters.degrees ?? 0,
        ),
      };
    case "linear":
      return {
        kind: "linear",
        startPoseVar: ctx.definePose(
          `${label}Start`,
          ctx.endX,
          ctx.endY,
          linkedStart ?? parameters.startDeg ?? 0,
        ),
        endPoseVar: ctx.definePose(
          `${label}End`,
          ctx.endX,
          ctx.endY,
          parameters.endDeg ?? 0,
        ),
      };
    case "facing-point": {
      const point = parameters.point;
      if (!point) {
        ctx.warn(
          `skipped piecewise segment ${index + 1}: facing-point has no target point`,
        );
        return null;
      }
      return {
        kind: "facingPoint",
        poseVar: ctx.definePose(`${label}Target`, point.x, point.y, 0),
      };
    }
  }
}
