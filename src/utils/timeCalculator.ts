import type {
  BasePoint,
  Path,
  Settings,
  StartPose,
  TimePrediction,
  TimelineEvent,
  SequenceItem,
} from "../types";
import { getAngularDifference } from "./math";
import { getLineStartHeading, getLineEndHeading } from "./headingInterpolation";
import {
  atomicSegments,
  effectiveHeadingAt,
  flattenToAtomicSegments,
} from "./pathTraversal";

/**
 * Calculate time for a motion profile (trapezoidal or triangular)
 */
function calculateMotionProfileTime(
  distance: number,
  maxVel: number,
  maxAcc: number,
  maxDec?: number,
): number {
  const deceleration = maxDec || maxAcc;

  const accDist = (maxVel * maxVel) / (2 * maxAcc);
  const decDist = (maxVel * maxVel) / (2 * deceleration);

  if (distance >= accDist + decDist) {
    const accTime = maxVel / maxAcc;
    const decTime = maxVel / deceleration;
    const constDist = distance - accDist - decDist;
    const constTime = constDist / maxVel;

    return accTime + constTime + decTime;
  } else {
    const vPeak = Math.sqrt(
      (2 * distance * maxAcc * deceleration) / (maxAcc + deceleration),
    );
    const accTime = vPeak / maxAcc;
    const decTime = vPeak / deceleration;

    return accTime + decTime;
  }
}

export function calculatePathTime(
  startPoint: StartPose,
  lines: Path[],
  settings: Settings,
  sequence?: SequenceItem[],
): TimePrediction {
  const msToSeconds = (value?: number | string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric / 1000;
  };

  const useMotionProfile =
    settings.maxVelocity !== undefined &&
    settings.maxAcceleration !== undefined;

  const segmentLengths: number[] = [];
  const segmentTimes: number[] = [];
  const timeline: TimelineEvent[] = [];

  let currentTime = 0;
  let currentHeading = startPoint.headingDeg;

  // Create map by order of segments
  const pathSegments = flattenToAtomicSegments(startPoint, lines);
  const segmentById = new Map(
    pathSegments.map((segment) => [segment.line.id, segment]),
  );

  // The default sequence drives every leaf, not every top-level entry: a group
  // is not itself drivable.
  const seq: SequenceItem[] =
    sequence && sequence.length
      ? sequence
      : atomicSegments(lines).map((ln) => ({ kind: "path", lineId: ln.id }));

  // Where the robot actually sits, which does follow execution order.
  let robotPoint: BasePoint = startPoint;

  seq.forEach((item, idx) => {
    if (item.kind === "wait") {
      const waitSeconds = msToSeconds(item.durationMs);
      if (waitSeconds > 0) {
        timeline.push({
          type: "wait",
          name: item.name,
          duration: waitSeconds,
          startTime: currentTime,
          endTime: currentTime + waitSeconds,
          startHeading: currentHeading,
          targetHeading: currentHeading,
          atPoint: robotPoint,
        });
        currentTime += waitSeconds;
      }
      return;
    }

    const segment = segmentById.get(item.lineId);
    if (!segment) {
      // Skip missing or malformed lines in sequence
      return;
    }
    const line = segment.line;
    const prevPoint = segment.start;

    // --- ROTATION CHECK ---
    // Read the heading the same way the animation does, so a group override
    // does not leave the timeline turning to an angle that is never shown.
    const startHeading = effectiveHeadingAt(pathSegments, segment.index, 0);
    const endHeading = effectiveHeadingAt(pathSegments, segment.index, 1);

    const requiredStartHeading = getLineStartHeading(
      line,
      prevPoint,
      startHeading.heading,
      startHeading.t,
    );
    if (idx === 0) currentHeading = requiredStartHeading;
    const diff = Math.abs(
      getAngularDifference(currentHeading, requiredStartHeading),
    );
    if (diff > 0.1) {
      const diffRad = diff * (Math.PI / 180);
      const rotTime = diffRad / settings.aVelocity;
      timeline.push({
        type: "wait",
        duration: rotTime,
        startTime: currentTime,
        endTime: currentTime + rotTime,
        startHeading: currentHeading,
        targetHeading: requiredStartHeading,
        atPoint: prevPoint,
      });
      currentTime += rotTime;
      currentHeading = requiredStartHeading;
    }

    // --- TRAVEL ---
    const length = segment.arcLength;
    segmentLengths.push(length);
    let segmentTime: number;

    if (useMotionProfile) {
      segmentTime = calculateMotionProfileTime(
        length,
        settings.maxVelocity!,
        settings.maxAcceleration!,
        settings.maxDeceleration,
      );
    } else {
      const avgVelocity = (settings.xVelocity + settings.yVelocity) / 2;
      segmentTime = length / avgVelocity;
    }
    segmentTimes.push(segmentTime);
    timeline.push({
      type: "travel",
      duration: segmentTime,
      startTime: currentTime,
      endTime: currentTime + segmentTime,
      lineId: line.id,
    });
    currentTime += segmentTime;
    currentHeading = getLineEndHeading(
      line,
      prevPoint,
      endHeading.heading,
      endHeading.t,
    );
    robotPoint = line.endPoint;
  });

  const totalTime = currentTime;
  const totalDistance = segmentLengths.reduce((sum, length) => sum + length, 0);

  return {
    totalTime,
    segmentTimes,
    totalDistance,
    timeline,
  };
}

/**
 * Calculate playback timing with path-level visualization pauses.
 * These waits are intentionally kept out of calculatePathTime so exports keep
 * using the trajectory's actual timing.
 */
export function calculateVisualizationPathTime(
  startPoint: StartPose,
  lines: Path[],
  settings: Settings,
  sequence?: SequenceItem[],
): TimePrediction {
  const waitsByPathId = new Map(
    flattenToAtomicSegments(startPoint, lines).map(({ line }) => [
      line.id,
      Math.max(0, Number(line.waitAfterMs) || 0),
    ]),
  );
  const baseSequence =
    sequence && sequence.length
      ? sequence
      : atomicSegments(lines).map((line) => ({
          kind: "path" as const,
          lineId: line.id,
        }));
  const visualizationSequence: SequenceItem[] = [];

  baseSequence.forEach((item) => {
    visualizationSequence.push(item);
    if (item.kind === "path") {
      const durationMs = waitsByPathId.get(item.lineId) ?? 0;
      if (durationMs > 0) {
        visualizationSequence.push({
          kind: "wait",
          id: `visualization-wait-${item.lineId}`,
          name: "Path visualization wait",
          durationMs,
        });
      }
    }
  });

  return calculatePathTime(
    startPoint,
    lines,
    settings,
    visualizationSequence,
  );
}

export function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0.0s";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}s`;
  }
  return `${seconds.toFixed(1)}s`;
}

export function getAnimationDuration(
  totalTime: number,
  speedFactor: number = 1.0,
): number {
  return (totalTime * 1000) / speedFactor;
}
