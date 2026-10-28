import { FIELD_SIZE } from "../config/defaults";
import type { ProjectDoc } from "../io/project";
import { motionProfile, type MotionProfile } from "../sim/motionProfile";
import type {
  BasePoint,
  RobotConfig,
  Shape,
  StartPose,
  TimelineEvent,
} from "../types";
import { getRobotCorners, polygonsOverlap } from "../utils/geometry";
import { segmentHeadingAt } from "../utils/headingInterpolation";
import { getAngularDifference, shortestRotation } from "../utils/math";
import {
  flattenToAtomicSegments,
  type FlatSegment,
} from "../utils/pathTraversal";

export interface Pose {
  x: number;
  y: number;
  /** Degrees counter-clockwise from +x. */
  heading: number;
}

export type Obstacle = { kind: "shape"; shapeId: string } | { kind: "wall" };

/** A stretch of the timeline during which the robot overlaps one obstacle. */
export interface Collision {
  /** The segment being driven, or null while turning or waiting in place. */
  lineId: string | null;
  obstacle: Obstacle;
  /** Timeline seconds. */
  start: number;
  end: number;
  firstContact: Pose;
}

export interface CollisionOptions {
  /** Longest distance between samples, in inches. Defaults to half the footprint's short side. */
  step?: number;
  /** Largest heading change between samples, in degrees. */
  angleStep?: number;
}

type Footprint = Pick<RobotConfig, "rLength" | "rWidth" | "safetyMargin">;

const DEFAULT_ANGLE_STEP = 5;
/** Bisection rounds when locating where contact begins or ends. */
const BOUNDARY_ROUNDS = 12;

/** The robot rectangle at `pose`, grown by the safety margin on every side. */
export function robotFootprint(pose: Pose, robot: Footprint): BasePoint[] {
  const margin = Math.max(0, robot.safetyMargin || 0);
  return getRobotCorners(
    pose.x,
    pose.y,
    pose.heading,
    robot.rLength + 2 * margin,
    robot.rWidth + 2 * margin,
  );
}

/** Every interval of `timeline` where the robot touches an obstacle or leaves the field. */
export function findCollisions(
  doc: ProjectDoc,
  timeline: TimelineEvent[],
  options: CollisionOptions = {},
): Collision[] {
  const margin = Math.max(0, doc.robot.safetyMargin || 0);
  const shortSide = Math.min(doc.robot.rLength, doc.robot.rWidth) + 2 * margin;
  const step = options.step ?? shortSide / 2;
  const angleStep = options.angleStep ?? DEFAULT_ANGLE_STEP;
  if (!(step > 0 && angleStep > 0)) return [];

  const targets = targetsOf(doc.shapes);
  const segments = flattenToAtomicSegments(doc.startPoint, doc.lines);
  const segmentById = new Map(segments.map((entry) => [entry.line.id, entry]));

  const collisions: Collision[] = [];
  const open = new Map<Target, Collision>();
  let previous: { motion: Motion; sample: Sample } | null = null;

  for (const event of timeline) {
    const motion = motionOf(event, doc, segments, segmentById, step);
    if (!motion) continue;

    for (const sample of samplesOf(motion, angleStep)) {
      const footprint = robotFootprint(sample.pose, doc.robot);
      const before = previous?.motion === motion ? previous.sample : null;

      for (const target of targets) {
        const hit = target.hits(footprint);
        let current = open.get(target);

        if (current && (!hit || current.lineId !== motion.lineId)) {
          if (!hit && before) {
            const exit = boundary(
              motion,
              target,
              doc.robot,
              before.u,
              sample.u,
            );
            current.end = motion.timeAt(exit);
          }
          open.delete(target);
          current = undefined;
        }
        if (!hit) continue;

        if (current) {
          current.end = motion.timeAt(sample.u);
          continue;
        }
        const entry = before
          ? boundary(motion, target, doc.robot, sample.u, before.u)
          : sample.u;
        const start = motion.timeAt(entry);
        const collision: Collision = {
          lineId: motion.lineId,
          obstacle: target.obstacle,
          start,
          end: motion.timeAt(sample.u),
          firstContact: entry === sample.u ? sample.pose : motion.poseAt(entry),
        };
        collisions.push(collision);
        open.set(target, collision);
      }
      previous = { motion, sample };
    }
  }

  return collisions.sort((a, b) => a.start - b.start);
}

interface Target {
  obstacle: Obstacle;
  hits(footprint: BasePoint[]): boolean;
}

function targetsOf(shapes: Shape[]): Target[] {
  const wall: Target = {
    obstacle: { kind: "wall" },
    hits: (footprint) =>
      footprint.some(
        ({ x, y }) => x < 0 || x > FIELD_SIZE || y < 0 || y > FIELD_SIZE,
      ),
  };

  const obstacles = shapes
    .filter((shape) => shape.vertices.length >= 2)
    .map((shape): Target => {
      const bounds = boundsOf(shape.vertices);
      return {
        obstacle: { kind: "shape", shapeId: shape.id },
        hits: (footprint) =>
          boundsOverlap(bounds, boundsOf(footprint)) &&
          polygonsOverlap(footprint, shape.vertices),
      };
    });

  return [...obstacles, wall];
}

/**
 * One timeline event as a pose and a time, both addressed by progress `u`
 * from 0 to 1. `steps` is how many even slices of `u` keep the robot within
 * one sample step; slices are split further where the heading turns sharply.
 */
interface Motion {
  lineId: string | null;
  steps: number;
  poseAt(u: number): Pose;
  timeAt(u: number): number;
}

interface Sample {
  u: number;
  pose: Pose;
}

function motionOf(
  event: TimelineEvent,
  doc: ProjectDoc,
  segments: FlatSegment[],
  segmentById: Map<string, FlatSegment>,
  step: number,
): Motion | null {
  if (event.type === "wait") return turnInPlace(event, doc.startPoint);
  const segment = event.lineId ? segmentById.get(event.lineId) : undefined;
  if (!segment) return null;

  const { curve, index } = segment;
  const profile = motionProfile(curve.length, doc.robot);
  return {
    lineId: segment.line.id,
    steps: Math.max(1, Math.ceil(curve.length / step)),
    poseAt(s) {
      const point = curve.pointAt(s);
      return {
        x: point.x,
        y: point.y,
        heading: segmentHeadingAt(segments, index, s),
      };
    },
    timeAt: (s) =>
      event.startTime + timeToCover(profile, s * curve.length, event.duration),
  };
}

function turnInPlace(event: TimelineEvent, startPoint: StartPose): Motion {
  const point = event.atPoint ?? startPoint;
  const from = event.startHeading ?? 0;
  const to = event.targetHeading ?? 0;
  return {
    lineId: null,
    steps: 1,
    poseAt: (u) => ({
      x: point.x,
      y: point.y,
      heading: shortestRotation(from, to, u),
    }),
    timeAt: (u) => event.startTime + u * event.duration,
  };
}

function samplesOf(motion: Motion, angleStep: number): Sample[] {
  const samples: Sample[] = [{ u: 0, pose: motion.poseAt(0) }];
  for (let i = 1; i <= motion.steps; i++) {
    const last = samples[samples.length - 1];
    const next = { u: i / motion.steps, pose: motion.poseAt(i / motion.steps) };
    const turn = Math.abs(
      getAngularDifference(last.pose.heading, next.pose.heading),
    );
    const slices = Math.ceil(turn / angleStep);
    for (let j = 1; j < slices; j++) {
      const u = last.u + ((next.u - last.u) * j) / slices;
      samples.push({ u, pose: motion.poseAt(u) });
    }
    samples.push(next);
  }
  return samples;
}

/**
 * Narrows the change between a hit at `inside` and a miss at `outside` and
 * returns the progress of the last point still in contact.
 */
function boundary(
  motion: Motion,
  target: Target,
  robot: Footprint,
  inside: number,
  outside: number,
): number {
  for (let round = 0; round < BOUNDARY_ROUNDS; round++) {
    const middle = (inside + outside) / 2;
    if (target.hits(robotFootprint(motion.poseAt(middle), robot))) {
      inside = middle;
    } else {
      outside = middle;
    }
  }
  return inside;
}

/** Seconds into a profile at which `distance` inches have been covered. */
function timeToCover(
  profile: MotionProfile,
  distance: number,
  duration: number,
): number {
  // The profile flattens out as it stops, so searching for the very end
  // would land short of it.
  if (profile.distanceAt(duration) <= distance) return duration;
  let low = 0;
  let high = duration;
  for (let round = 0; round < 40; round++) {
    const middle = (low + high) / 2;
    if (profile.distanceAt(middle) < distance) low = middle;
    else high = middle;
  }
  return high;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundsOf(points: BasePoint[]): Bounds {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const { x, y } of points) {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
  return bounds;
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return (
    a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY
  );
}
