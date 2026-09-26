import {
  getCurvePoint,
  easeInOutQuad,
  shortestRotation,
  radiansToDegrees,
} from "./math";
import { getRobotCorners } from "./geometry";
import { evaluatePiecewiseHeading } from "./headingInterpolation";
import {
  CURVE_SAMPLES,
  approximateCurveLength,
  curveCompletionAt,
  effectiveHeadingAt,
  flattenToAtomicSegments,
  type FlatSegment,
  getPointAndTangentAtProgress,
  lineCurvePoints,
} from "./pathTraversal";
import type {
  AtomicPath,
  Path,
  TimelineEvent,
  BasePoint,
  Settings,
  StartPose,
} from "../types";
import type { ScaleLinear } from "d3";

export interface RobotState {
  x: number;
  y: number;
  heading: number;
  t?: number | null;
}

type AnimationState = {
  playing: boolean;
  percent: number;
  accumulatedSeconds: number;
  lastTimestamp: number | null;
  animationFrameId: number | null;
  totalDuration: number;
  loop: boolean;
};

/**
 * Memoization for per-segment curve geometry.
 *
 * `calculateRobotState` is called on every animation frame, and each call used
 * to re-sample the bezier curve (100 recursive evaluations) just to recover the
 * curve's arc length. Since the geometry of a segment only changes when the
 * user edits the path, we cache the sampled points + length keyed by the exact
 * coordinates of the segment. This eliminates ~100 bezier evaluations per robot
 * per frame while staying correct after edits (a coordinate change produces a
 * different key).
 */
const curveGeometryCache = new Map<
  string,
  { points: BasePoint[]; length: number }
>();
const CURVE_CACHE_LIMIT = 1024;

function getCurveGeometry(
  start: BasePoint,
  line: AtomicPath,
): { points: BasePoint[]; length: number } {
  const end = line.endPoint;
  const cps = line.throughPoints ?? line.controlPoints;

  let key = start.x.toFixed(3) + "," + start.y.toFixed(3);
  for (let i = 0; i < cps.length; i++) {
    key += ";" + cps[i].x.toFixed(3) + "," + cps[i].y.toFixed(3);
  }
  key += ";" + end.x.toFixed(3) + "," + end.y.toFixed(3);

  const cached = curveGeometryCache.get(key);
  if (cached) return cached;

  const points = lineCurvePoints(start, line);
  const value = { points, length: approximateCurveLength(points) };

  if (curveGeometryCache.size >= CURVE_CACHE_LIMIT) {
    curveGeometryCache.clear();
  }
  curveGeometryCache.set(key, value);
  return value;
}

/**
 * Calculate the robot position and heading based on the Timeline
 */
export function calculateRobotState(
  percent: number,
  timeline: TimelineEvent[],
  lines: Path[],
  startPoint: StartPose,
  settings: Settings,
  xScale: ScaleLinear<number, number>,
  yScale: ScaleLinear<number, number>,
): RobotState {
  if (!timeline || timeline.length === 0) {
    return {
      x: xScale(startPoint.x),
      y: yScale(startPoint.y),
      heading: 0,
      t: null,
    };
  }

  // Calculate current time in seconds based on percent (0-100)
  const totalDuration = timeline[timeline.length - 1].endTime;
  const currentSeconds = (percent / 100) * totalDuration;

  // Find the active event for this time
  const activeEvent =
    timeline.find(
      (e) => currentSeconds >= e.startTime && currentSeconds <= e.endTime,
    ) || timeline[timeline.length - 1];

  if (activeEvent.type === "wait") {
    // --- STATIONARY ROTATION ---
    const point = activeEvent.atPoint!;

    // Calculate progress (0.0 to 1.0) within this specific wait event
    const eventProgress =
      (currentSeconds - activeEvent.startTime) / activeEvent.duration;
    const clampedProgress = Math.max(0, Math.min(1, eventProgress));

    // Interpolate heading smoothly
    const currentHeading = shortestRotation(
      activeEvent.startHeading!,
      activeEvent.targetHeading!,
      clampedProgress,
    );

    // Note: We use negative heading for visualizer (SVG/CSS rotation is CW, Math is usually CCW)
    return {
      x: xScale(point.x),
      y: yScale(point.y),
      heading: -currentHeading,
      t: null,
    };
  } else {
    // --- MOVEMENT TRAVEL ---
    const pathSegments = flattenToAtomicSegments(startPoint, lines);
    const segment = pathSegments.find(
      (entry) => entry.line.id === activeEvent.lineId,
    );
    if (!segment) {
      return { x: xScale(startPoint.x), y: yScale(startPoint.y), heading: 0 };
    }
    const currentLine = segment.line;
    const prevPoint = segment.start;

    // Calculate progress (in seconds) within this specific travel event
    const timeIntoEvent = currentSeconds - activeEvent.startTime;

    // Determine fraction along the path using motion profile when available
    let linePercent: number;
    const { points: curvePoints, length: segLength } = getCurveGeometry(
      prevPoint,
      currentLine,
    );

    // If settings provide a motion profile, compute distance fraction accordingly
    if (
      settings &&
      settings.maxVelocity !== undefined &&
      settings.maxAcceleration !== undefined
    ) {
      const maxV = settings.maxVelocity;
      const maxA = settings.maxAcceleration;
      const maxD = settings.maxDeceleration ?? settings.maxAcceleration;

      // Build profile parameters
      const accTime = maxV / maxA;
      const decTime = maxV / maxD;
      const accDist = 0.5 * maxA * accTime * accTime;
      const decDist = 0.5 * maxD * decTime * decTime;

      let constTime: number;
      let constDist = 0;
      let totalTime = 0;

      if (segLength >= accDist + decDist) {
        constDist = Math.max(0, segLength - accDist - decDist);
        constTime = constDist / maxV;
        totalTime = accTime + constTime + decTime;
      } else {
        // Triangular profile
        const vPeak = Math.sqrt((2 * segLength * maxA * maxD) / (maxA + maxD));
        constTime = 0;
        const accT = vPeak / maxA;
        const decT = vPeak / maxD;
        totalTime = accT + decT;
      }

      // Clamp timeIntoEvent to event duration
      const t = Math.max(0, Math.min(timeIntoEvent, activeEvent.duration));

      // Compute distance traveled at time t. A zero-length segment leaves this
      // at 0, which the fraction below turns into 0 anyway.
      let dist = 0;
      if (segLength === 0) {
        // nothing to travel
      } else if (segLength >= accDist + decDist) {
        if (t <= accTime) {
          dist = 0.5 * maxA * t * t;
        } else if (t <= accTime + constTime) {
          dist = accDist + maxV * (t - accTime);
        } else {
          const rem = t - (accTime + constTime);
          dist = accDist + constDist + maxV * rem - 0.5 * maxD * rem * rem;
        }
      } else {
        // triangular
        const vPeak = Math.sqrt((2 * segLength * maxA * maxD) / (maxA + maxD));
        const accT = vPeak / maxA;
        if (t <= accT) {
          dist = 0.5 * maxA * t * t;
        } else {
          const rem = t - accT;
          dist =
            0.5 * maxA * accT * accT + vPeak * rem - 0.5 * maxD * rem * rem;
        }
      }

      linePercent = Math.max(0, Math.min(1, dist / Math.max(1e-9, segLength)));
    } else {
      // Fallback: use easing over the event duration (preserves previous behaviour)
      const timeProgress = timeIntoEvent / activeEvent.duration;
      linePercent = easeInOutQuad(Math.max(0, Math.min(1, timeProgress)));
    }

    // Calculate Position
    const robotInchesXY = getCurvePoint(linePercent, curvePoints);

    const robotXY = { x: xScale(robotInchesXY.x), y: yScale(robotInchesXY.y) };
    let robotHeading = 0;

    // A group's heading replaces its children's and is measured across the
    // whole group, so both the rule and its t come from there.
    const effective = effectiveHeadingAt(
      pathSegments,
      segment.index,
      linePercent,
    );
    const lineHeading = effective.heading;
    const headingT = effective.t;
    const lineTraversal = getPointAndTangentAtProgress(
      curvePoints as BasePoint[],
      linePercent,
      lineHeading.type === "tangential" ? lineHeading.reverse : undefined,
    );

    // Calculate Heading based on Line Type
    if (lineHeading.type === "piecewise") {
      robotHeading = -evaluatePiecewiseHeading(
        lineHeading.piecewiseHeading,
        headingT,
        { ...lineTraversal, curvePoints: curvePoints as BasePoint[] },
      );
    } else {
      switch (lineHeading.type) {
        case "linear":
          robotHeading = -shortestRotation(
            lineHeading.startDeg,
            lineHeading.endDeg,
            headingT,
          );
          break;
        case "constant":
          robotHeading = -lineHeading.degrees;
          break;
        case "tangential": {
          const nextPointInches = getCurvePoint(
            linePercent + (lineHeading.reverse ? -0.01 : 0.01),
            curvePoints,
          );
          const nextPoint = {
            x: xScale(nextPointInches.x),
            y: yScale(nextPointInches.y),
          };
          const dx = nextPoint.x - robotXY.x;
          const dy = nextPoint.y - robotXY.y;

          if (dx !== 0 || dy !== 0) {
            // atan2 returns angle in pixels (Y is down), so -90 is Up.
            // This matches the -heading logic used elsewhere.
            const angle = Math.atan2(dy, dx);
            robotHeading = radiansToDegrees(angle);
          }
          break;
        }
      }
    }

    return {
      x: robotXY.x,
      y: robotXY.y,
      heading: robotHeading,
      t: linePercent,
    };
  }
}

/**
 * Create an animation controller for the robot simulation
 */
export function createAnimationController(
  totalDuration: number,
  onPercentChange: (percent: number) => void,
  onComplete?: () => void,
) {
  const state: AnimationState = {
    playing: false,
    percent: 0,
    accumulatedSeconds: 0, // total elapsed seconds (not tied to a single startTime)
    lastTimestamp: null, // last rAF timestamp seen while playing
    animationFrameId: null,
    totalDuration,
    loop: true,
  };

  let isExternalChange = false;

  function updatePercentFromAccumulated() {
    if (state.totalDuration > 0) {
      const rawPercent = (state.accumulatedSeconds / state.totalDuration) * 100;
      // clamp between 0 and 100 for non-looping; for looping we'll handle wrapping separately
      state.percent = Math.max(0, Math.min(100, rawPercent));
    } else {
      state.percent = 0;
    }
  }

  function animate(timestamp: number) {
    // If we aren't playing anymore, ensure we don't schedule anything further.
    if (!state.playing) {
      state.lastTimestamp = null;
      state.animationFrameId = null;
      return;
    }

    // Initialize lastTimestamp on first tick after play
    if (state.lastTimestamp === null) {
      state.lastTimestamp = timestamp;
      state.animationFrameId = requestAnimationFrame(animate);
      return;
    }

    // Compute delta time since last frame (in seconds)
    const deltaSeconds = (timestamp - state.lastTimestamp) / 1000;
    state.lastTimestamp = timestamp;

    // Advance accumulated time
    state.accumulatedSeconds += deltaSeconds;

    if (state.totalDuration > 0) {
      if (state.loop) {
        // For looping, wrap accumulatedSeconds so it doesn't grow unbounded.
        // Use modulo to allow continuous time even for large deltas.
        state.accumulatedSeconds =
          state.accumulatedSeconds % state.totalDuration;
        updatePercentFromAccumulated();
        if (!isExternalChange) onPercentChange(state.percent);
        // keep animating
        state.animationFrameId = requestAnimationFrame(animate);
      } else {
        // Not looping: clamp to duration and stop when done
        if (state.accumulatedSeconds >= state.totalDuration) {
          state.accumulatedSeconds = state.totalDuration;
          updatePercentFromAccumulated();
          if (!isExternalChange) onPercentChange(100);
          state.playing = false;
          state.lastTimestamp = null;
          if (state.animationFrameId) {
            cancelAnimationFrame(state.animationFrameId);
            state.animationFrameId = null;
          }
          if (onComplete) onComplete();
          return;
        } else {
          updatePercentFromAccumulated();
          if (!isExternalChange) onPercentChange(state.percent);
          state.animationFrameId = requestAnimationFrame(animate);
        }
      }
    } else {
      // duration is zero or invalid
      state.percent = 0;
      if (!isExternalChange) onPercentChange(state.percent);
      state.animationFrameId = requestAnimationFrame(animate);
    }
  }

  function play() {
    // If already playing, nothing to do
    if (state.playing) return;

    // If at the very end and not looping, reset to start so play restarts
    if (
      !state.loop &&
      state.totalDuration > 0 &&
      state.accumulatedSeconds >= state.totalDuration
    ) {
      state.accumulatedSeconds = 0;
      state.percent = 0;
      if (!isExternalChange) onPercentChange(0);
    }

    state.playing = true;
    // schedule the loop if not already scheduled
    if (state.animationFrameId === null) {
      state.lastTimestamp = null; // ensure animate initializes its timestamp properly
      state.animationFrameId = requestAnimationFrame(animate);
    }
  }

  function pause() {
    if (!state.playing) return;
    state.playing = false;
    // cancel outstanding rAF if any
    if (state.animationFrameId !== null) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
    state.lastTimestamp = null;
  }

  function reset() {
    state.accumulatedSeconds = 0;
    state.percent = 0;
    state.lastTimestamp = null;
    if (!isExternalChange) onPercentChange(0);
  }

  return {
    play,
    pause,
    reset() {
      pause();
      reset();
    },
    seekToPercent(targetPercent: number) {
      isExternalChange = true;
      const clamped = Math.max(0, Math.min(100, targetPercent));
      if (state.totalDuration > 0) {
        state.accumulatedSeconds = (clamped / 100) * state.totalDuration;
      } else {
        state.accumulatedSeconds = 0;
      }
      updatePercentFromAccumulated();
      onPercentChange(clamped);

      // If playing, we keep animating; lastTimestamp will sync on next tick
      // Clear the external flag immediately so normal anim ticks resume updating.
      // Use setTimeout(..., 0) so this call does not interrupt the current stack where this may be called
      setTimeout(() => {
        isExternalChange = false;
      }, 0);
    },
    setDuration(duration: number) {
      // If duration changes, keep current progress proportionally if possible
      const oldDuration = state.totalDuration;
      if (oldDuration > 0) {
        const progress = state.accumulatedSeconds / oldDuration;
        state.totalDuration = duration;
        state.accumulatedSeconds = progress * Math.max(0, duration);
      } else {
        state.totalDuration = duration;
        state.accumulatedSeconds = Math.min(
          state.accumulatedSeconds,
          Math.max(0, duration),
        );
      }
      updatePercentFromAccumulated();
      if (!isExternalChange) onPercentChange(state.percent);
    },
    setLoop(loop: boolean) {
      state.loop = loop;
    },
    isPlaying() {
      return state.playing;
    },
    getPercent() {
      updatePercentFromAccumulated();
      return state.percent;
    },
    getDuration() {
      return state.totalDuration;
    },
    isLooping() {
      return state.loop;
    },
  };
}

/**
 * The robot's heading part-way along one segment, in field degrees (CCW from
 * +x, measured in inches space).
 */
function segmentHeadingAt(
  segments: FlatSegment[],
  index: number,
  localT: number,
): number {
  const curvePoints = segments[index].points;
  const completion = curveCompletionAt(curvePoints, localT);
  // A group's heading replaces its children's and spans the whole group, so
  // both the rule and the t to read it at come from there.
  const { heading, t } = effectiveHeadingAt(segments, index, completion);

  switch (heading.type) {
    case "linear":
      return shortestRotation(heading.startDeg, heading.endDeg, t);
    case "constant":
      return heading.degrees;
    case "tangential":
      // The tangent is a property of the curve under the robot, so this stays
      // on the segment's own geometry even inside a group.
      return getPointAndTangentAtProgress(curvePoints, localT, heading.reverse)
        .tangentDegrees;
    case "piecewise": {
      return evaluatePiecewiseHeading(heading.piecewiseHeading, t, {
        ...getPointAndTangentAtProgress(curvePoints, localT),
        curvePoints,
      });
    }
  }
}

/**
 * Generate ghost path points that trace the robot's body along its path
 * Creates swept area by connecting consecutive robot corners properly
 * @param startPoint - The starting point of the path
 * @param lines - The path lines to trace
 * @param robotWidth - Robot width in inches
 * @param robotHeight - Robot height in inches
 * @param samples - Number of samples along the path (default 50)
 * @returns Array of points forming the boundary of the robot's swept path
 */
export function generateGhostPathPoints(
  startPoint: StartPose,
  lines: Path[],
  robotWidth: number,
  robotHeight: number,
  samples: number = 200, // Higher default for smoother turns
): BasePoint[] {
  if (lines.length === 0) return [];

  // Collect robot states with center, heading, and offset rails
  const robotStates: Array<{
    center: BasePoint;
    heading: number;
    left: BasePoint;
    right: BasePoint;
  }> = [];

  // For each line segment
  const pathSegments = flattenToAtomicSegments(startPoint, lines);
  for (const { index, points: curvePoints } of pathSegments) {
    // Sample along this line segment with a minimum to better capture curves
    const samplesPerLine = Math.max(10, Math.ceil(samples / lines.length));
    for (let i = 0; i <= samplesPerLine; i++) {
      const t = i / samplesPerLine;
      const robotPosInches = getCurvePoint(t, curvePoints);
      const heading = segmentHeadingAt(pathSegments, index, t);

      // Build left/right rails directly from center + normal offsets
      const headingRad = (heading * Math.PI) / 180;
      const nx = -Math.sin(headingRad);
      const ny = Math.cos(headingRad);
      const halfW = robotWidth / 2;

      const leftPoint = {
        x: robotPosInches.x + nx * halfW,
        y: robotPosInches.y + ny * halfW,
      };
      const rightPoint = {
        x: robotPosInches.x - nx * halfW,
        y: robotPosInches.y - ny * halfW,
      };

      robotStates.push({
        center: { x: robotPosInches.x, y: robotPosInches.y },
        heading,
        left: leftPoint,
        right: rightPoint,
      });
    }
  }

  if (robotStates.length === 0) return [];
  if (robotStates.length === 1) {
    // Single pose: return rectangle corners
    const single = robotStates[0];
    const heading = single.heading;
    const corners = getRobotCorners(
      single.center.x,
      single.center.y,
      heading,
      robotWidth,
      robotHeight,
    );
    return corners;
  }

  // Build swept boundary by tracing left rail forward and right rail backward
  const leftRail: BasePoint[] = [];
  const rightRail: BasePoint[] = [];

  for (let i = 0; i < robotStates.length; i++) {
    leftRail.push(robotStates[i].left);
  }

  for (let i = robotStates.length - 1; i >= 0; i--) {
    rightRail.push(robotStates[i].right);
  }

  // Build boundary: start bridge (right->left), left rail, end bridge (left->right), right rail
  const boundary: BasePoint[] = [];

  // Bridge at start from right to left (simple straight connector)
  const start = robotStates[0];
  boundary.push(start.right);
  boundary.push(start.left);

  // Left rail
  boundary.push(...leftRail);

  // Bridge at end from left to right (simple straight connector)
  const end = robotStates[robotStates.length - 1];
  boundary.push(end.right);

  // Right rail
  boundary.push(...rightRail);

  // Remove consecutive duplicates and ensure closure
  const result: BasePoint[] = [];
  const threshold = 1e-4;

  for (let i = 0; i < boundary.length; i++) {
    const curr = boundary[i];
    const prev = result[result.length - 1];

    if (
      !prev ||
      Math.abs(curr.x - prev.x) > threshold ||
      Math.abs(curr.y - prev.y) > threshold
    ) {
      result.push(curr);
    }
  }

  if (result.length >= 3) {
    const first = result[0];
    const last = result[result.length - 1];
    if (
      Math.abs(first.x - last.x) > threshold ||
      Math.abs(first.y - last.y) > threshold
    ) {
      result.push({ ...first });
    }
  }

  return result.length >= 3 ? result : [];
}

/**
 * Generate onion layer robot bodies at regular intervals along the path
 * Returns an array of robot states (position, heading, and corner points) for drawing
 * @param startPoint - The starting point of the path
 * @param lines - The path lines to trace
 * @param robotWidth - Robot width in inches
 * @param robotHeight - Robot height in inches
 * @param spacing - Distance in inches between each robot trace (default 6)
 * @returns Array of robot states with corner points for rendering
 */
export function generateOnionLayers(
  startPoint: StartPose,
  lines: Path[],
  robotWidth: number,
  robotHeight: number,
  spacing: number = 6,
): Array<{
  x: number;
  y: number;
  heading: number;
  corners: BasePoint[];
  lineId: string;
}> {
  if (lines.length === 0) return [];

  const layers: Array<{
    x: number;
    y: number;
    heading: number;
    corners: BasePoint[];
    lineId: string;
  }> = [];

  // Calculate total path length
  const segments = flattenToAtomicSegments(startPoint, lines);
  const totalLength = segments.reduce(
    (sum, segment) => sum + segment.arcLength,
    0,
  );

  // Sample robot positions at regular intervals
  let accumulatedLength = 0;
  let nextLayerDistance = spacing;

  for (const { line, index: li, points: curvePoints } of segments) {
    let prevPos = curvePoints[0];
    let prevT = 0;

    for (let i = 1; i <= CURVE_SAMPLES; i++) {
      const t = i / CURVE_SAMPLES;
      const pos = getCurvePoint(t, curvePoints);
      const dx = pos.x - prevPos.x;
      const dy = pos.y - prevPos.y;
      const segmentLength = Math.sqrt(dx * dx + dy * dy);

      accumulatedLength += segmentLength;

      // Check if we've reached the next layer position
      while (
        accumulatedLength >= nextLayerDistance &&
        nextLayerDistance <= totalLength
      ) {
        // Interpolate exact position for this layer
        const overshoot = accumulatedLength - nextLayerDistance;
        const interpolationT = 1 - overshoot / segmentLength;
        const layerT = prevT + (t - prevT) * interpolationT;
        const robotPosInches = getCurvePoint(layerT, curvePoints);
        const heading = segmentHeadingAt(segments, li, layerT);

        // Get robot corners for this position
        const corners = getRobotCorners(
          robotPosInches.x,
          robotPosInches.y,
          heading,
          robotWidth,
          robotHeight,
        );

        layers.push({
          x: robotPosInches.x,
          y: robotPosInches.y,
          heading: heading,
          corners: corners,
          lineId: line.id,
        });

        nextLayerDistance += spacing;
      }

      prevPos = pos;
      prevT = t;
    }
  }

  return layers;
}
