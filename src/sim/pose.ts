import type { Path, Settings, StartPose, TimelineEvent } from "../types";
import { segmentHeadingAt } from "../utils/headingInterpolation";
import { shortestRotation } from "../utils/math";
import { flattenToAtomicSegments } from "../utils/pathTraversal";
import { motionProfile } from "./motionProfile";

export interface RobotPose {
  /** Field inches. */
  x: number;
  y: number;
  /** Degrees counter-clockwise from +x. */
  heading: number;
  /** The Bézier parameter of the segment being driven, if any. */
  t: number | null;
}

/** Where the robot is `seconds` into a timeline from `calculatePathTime`. */
export function robotPoseAt(
  seconds: number,
  timeline: TimelineEvent[],
  startPoint: StartPose,
  lines: Path[],
  settings: Settings,
): RobotPose {
  const resting: RobotPose = {
    x: startPoint.x,
    y: startPoint.y,
    heading: startPoint.headingDeg,
    t: null,
  };
  if (timeline.length === 0) return resting;

  const event =
    timeline.find(
      (entry) => seconds >= entry.startTime && seconds <= entry.endTime,
    ) ?? timeline[timeline.length - 1];
  const progress =
    event.duration > 0
      ? Math.min(Math.max((seconds - event.startTime) / event.duration, 0), 1)
      : 1;

  if (event.type === "wait") {
    const point = event.atPoint ?? startPoint;
    return {
      x: point.x,
      y: point.y,
      heading: shortestRotation(
        event.startHeading ?? 0,
        event.targetHeading ?? 0,
        progress,
      ),
      t: null,
    };
  }

  const segments = flattenToAtomicSegments(startPoint, lines);
  const segment = segments.find((entry) => entry.line.id === event.lineId);
  if (!segment) return resting;

  const { curve } = segment;
  const profile = motionProfile(curve.length, settings);
  const s =
    curve.length > 0
      ? profile.distanceAt(seconds - event.startTime) / curve.length
      : progress;
  const point = curve.pointAt(s);

  return {
    x: point.x,
    y: point.y,
    heading: segmentHeadingAt(segments, segment.index, s),
    t: curve.parameterAt(s),
  };
}
