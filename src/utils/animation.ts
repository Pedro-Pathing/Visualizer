import {
  getCurvePoint,
  easeInOutQuad,
  shortestRotation,
  radiansToDegrees,
} from "./math";
import { getRobotCorners } from "./geometry";
import type { Point, Line, TimelineEvent, BasePoint, Settings } from "../types";
import type { ScaleLinear } from "d3";

export interface RobotState {
  x: number;
  y: number;
  heading: number;
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
 * Calculate the robot position and heading based on the Timeline
 */
export function calculateRobotState(
  percent: number,
  timeline: TimelineEvent[],
  lines: Line[],
  startPoint: Point,
  settings: Settings,
  xScale: ScaleLinear<number, number>,
  yScale: ScaleLinear<number, number>,
): RobotState {
  if (!timeline || timeline.length === 0) {
    return { x: xScale(startPoint.x), y: yScale(startPoint.y), heading: 0 };
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
    };
  } else {
    // --- MOVEMENT TRAVEL ---
    const lineIdx = activeEvent.lineIndex!;
    const currentLine = lines[lineIdx];
    const prevPoint = lineIdx === 0 ? startPoint : lines[lineIdx - 1].endPoint;

    // Calculate progress (in seconds) within this specific travel event
    const timeIntoEvent = currentSeconds - activeEvent.startTime;

    // Determine fraction along the path using motion profile when available
    let linePercent = 0;
    const curvePoints = [prevPoint, ...currentLine.controlPoints, currentLine.endPoint];

    // Helper: approximate curve length by sampling
    function calculateCurveLength(start: BasePoint, controlPoints: BasePoint[], end: BasePoint, samples = 100) {
      let length = 0;
      let prev = start;
      for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const p = getCurvePoint(t, [start, ...controlPoints, end]);
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        length += Math.sqrt(dx * dx + dy * dy);
        prev = p;
      }
      return length;
    }

    const segLength = calculateCurveLength(prevPoint as BasePoint, currentLine.controlPoints as BasePoint[], currentLine.endPoint as BasePoint);

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

      let constTime = 0;
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

      // Compute distance traveled at time t
      let dist = 0;
      if (segLength === 0) {
        linePercent = 0;
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
          dist = 0.5 * maxA * accT * accT + vPeak * rem - 0.5 * maxD * rem * rem;
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

    // Calculate Heading based on Line Type
    switch (currentLine.endPoint.heading) {
      case "linear":
        robotHeading = -shortestRotation(
          currentLine.endPoint.startDeg,
          currentLine.endPoint.endDeg,
          linePercent,
        );
        break;
      case "constant":
        robotHeading = -currentLine.endPoint.degrees;
        break;
      case "tangential":
        const nextPointInches = getCurvePoint(
          linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01),
          [prevPoint, ...currentLine.controlPoints, currentLine.endPoint],
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

    return {
      x: robotXY.x,
      y: robotXY.y,
      heading: robotHeading,
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
  startPoint: Point,
  lines: Line[],
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

  let currentLineStart = startPoint;

  // For each line segment
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const curvePoints = [
      currentLineStart,
      ...line.controlPoints,
      line.endPoint,
    ];

    // Sample along this line segment with a minimum to better capture curves
    const samplesPerLine = Math.max(10, Math.ceil(samples / lines.length));
    for (let i = 0; i <= samplesPerLine; i++) {
      const t = i / samplesPerLine;
      const robotPosInches = getCurvePoint(t, curvePoints);

      // Calculate heading at this position
      let heading = 0;
      if (line.endPoint.heading === "linear") {
        heading = shortestRotation(
          line.endPoint.startDeg,
          line.endPoint.endDeg,
          t,
        );
      } else if (line.endPoint.heading === "constant") {
        heading = line.endPoint.degrees;
      } else if (line.endPoint.heading === "tangential") {
        // Calculate tangent direction
        const nextT = Math.min(t + 0.01, 1);
        const nextPos = getCurvePoint(nextT, curvePoints);
        const dx = nextPos.x - robotPosInches.x;
        const dy = nextPos.y - robotPosInches.y;
        if (dx !== 0 || dy !== 0) {
          heading = radiansToDegrees(Math.atan2(dy, dx));
        }
      }

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

    currentLineStart = line.endPoint;
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
  startPoint: Point,
  lines: Line[],
  robotWidth: number,
  robotHeight: number,
  spacing: number = 6,
): Array<{ x: number; y: number; heading: number; corners: BasePoint[]; lineIndex: number }> {
  if (lines.length === 0) return [];

  const layers: Array<{
    x: number;
    y: number;
    heading: number;
    corners: BasePoint[];
  }> = [];

  // Calculate total path length
  let totalLength = 0;
  let currentLineStart = startPoint;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const curvePoints = [
      currentLineStart,
      ...line.controlPoints,
      line.endPoint,
    ];

    // Approximate line length by sampling
    const samples = 100;
    let lineLength = 0;
    let prevPos = curvePoints[0];

    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const pos = getCurvePoint(t, curvePoints);
      const dx = pos.x - prevPos.x;
      const dy = pos.y - prevPos.y;
      lineLength += Math.sqrt(dx * dx + dy * dy);
      prevPos = pos;
    }

    totalLength += lineLength;
    currentLineStart = line.endPoint;
  }

  // Calculate number of layers based on spacing
  const numLayers = Math.max(1, Math.floor(totalLength / spacing));

  // Sample robot positions at regular intervals
  currentLineStart = startPoint;
  let accumulatedLength = 0;
  let nextLayerDistance = spacing;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const curvePoints = [
      currentLineStart,
      ...line.controlPoints,
      line.endPoint,
    ];
    const samples = 100;
    let prevPos = curvePoints[0];
    let prevT = 0;

    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
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

        // Calculate heading for this position
        let heading = 0;
        if (line.endPoint.heading === "linear") {
          heading = shortestRotation(
            line.endPoint.startDeg,
            line.endPoint.endDeg,
            layerT,
          );
        } else if (line.endPoint.heading === "constant") {
          heading = -line.endPoint.degrees;
        } else if (line.endPoint.heading === "tangential") {
          // Calculate tangent direction
          const nextT = Math.min(
            layerT + (line.endPoint.reverse ? -0.01 : 0.01),
            1,
          );
          const nextPos = getCurvePoint(nextT, curvePoints);
          const tdx = nextPos.x - robotPosInches.x;
          const tdy = nextPos.y - robotPosInches.y;
          if (tdx !== 0 || tdy !== 0) {
            heading = radiansToDegrees(Math.atan2(tdy, tdx));
          }
        }

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
          lineIndex: li,
        });

        nextLayerDistance += spacing;
      }

      prevPos = pos;
      prevT = t;
    }

    currentLineStart = line.endPoint;
  }

  return layers;
}
