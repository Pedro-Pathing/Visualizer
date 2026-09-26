import type {
  BasePoint,
  ControlPoint,
  Heading,
  HeadingType,
  AtomicPath,
  Path,
  WaitSegment,
  PiecewiseHeadingInterpolation,
  Point,
  SequenceItem,
  StartPose,
} from "../types";
import { getRandomColor } from "./color";
import { headingAngleAt } from "./headingInterpolation";
import { atomicSegments } from "./pathTraversal";

import { makePathId } from "./ids";

export { makePathId };

/** The heading a segment gets when none is recorded. */
export const DEFAULT_HEADING: Heading = { type: "tangential", reverse: false };

/**
 * Legacy heading fields that used to live on a point.
 */
interface LegacyHeadingFields {
  heading?: HeadingType;
  startDeg?: number;
  endDeg?: number;
  degrees?: number;
  reverse?: boolean;
  piecewiseHeading?: PiecewiseHeadingInterpolation;
}

type LegacyPoint = Point & LegacyHeadingFields;

/** Fields every stored path carries, whatever its kind. */
type StoredCommon = {
  /** Absent in files written before segments carried ids. */
  id?: string;
  color?: string;
  name?: string;
  locked?: boolean;
  waitBefore?: WaitSegment;
  waitAfter?: WaitSegment;
  waitBeforeMs?: number;
  waitAfterMs?: number;
  waitBeforeName?: string;
  waitAfterName?: string;
  /** Either the current object form or the pre-migration string. */
  heading?: Heading | HeadingType;
};

/**
 * A path as it may appear in a file.
 */
export type StoredPath = StoredCommon & {
  kind?: "atomic" | "compound";
  endPoint?: LegacyPoint;
  controlPoints?: ControlPoint[];
  throughPoints?: BasePoint[];
  segments?: StoredPath[];
};

/** A start point as it may appear in a file: `headingDeg`, or legacy fields. */
export type StoredStartPose = Point &
  LegacyHeadingFields & { headingDeg?: number };

function isHeading(value: unknown): value is Heading {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Heading).type === "string"
  );
}

/** Build a `Heading` from the legacy fields that used to live on a point. */
function headingFromLegacy(source: LegacyHeadingFields): Heading {
  switch (source.heading) {
    case "linear":
      return {
        type: "linear",
        startDeg: source.startDeg ?? 0,
        endDeg: source.endDeg ?? 0,
      };
    case "constant":
      return { type: "constant", degrees: source.degrees ?? 0 };
    case "tangential":
      return { type: "tangential", reverse: source.reverse ?? false };
    case "piecewise":
      return source.piecewiseHeading
        ? { type: "piecewise", piecewiseHeading: source.piecewiseHeading }
        : DEFAULT_HEADING;
    default:
      return DEFAULT_HEADING;
  }
}

/**
 * Resolve a line's heading, preferring the current path-level field and
 * falling back to the pre-migration copy stored on its endpoint.
 */
export function normalizeHeading(line: StoredPath): Heading {
  if (isHeading(line.heading)) return line.heading;
  if (typeof line.heading === "string") {
    return headingFromLegacy({ ...line.endPoint, heading: line.heading });
  }
  return headingFromLegacy(line.endPoint ?? {});
}

/** A new drivable segment ending at (x, y), with defaults matching normalizePaths. */
export function createSegment(
  x: number,
  y: number,
  options: { reverse?: boolean } = {},
): AtomicPath {
  return {
    kind: "atomic",
    id: makePathId(),
    endPoint: { x, y },
    controlPoints: [],
    heading: { type: "tangential", reverse: options.reverse ?? false },
    color: getRandomColor(),
    locked: false,
    waitBeforeMs: 0,
    waitAfterMs: 0,
    waitBeforeName: "",
    waitAfterName: "",
  };
}

/**
 * Migrate a start pose from the legacy format to the new one.
 */
export function normalizeStartPose(input: StoredStartPose): StartPose {
  const headingDeg =
    typeof input?.headingDeg === "number"
      ? input.headingDeg
      : headingAngleAt(headingFromLegacy(input ?? {}), "start");

  return {
    x: input?.x ?? 0,
    y: input?.y ?? 0,
    name: input?.name,
    locked: input?.locked,
    headingDeg,
  };
}

function normalizeCommon(path: StoredPath) {
  return {
    id: path.id || makePathId(),
    color: path.color || getRandomColor(),
    name: path.name || "",
    locked: path.locked,
    waitBefore: path.waitBefore,
    waitAfter: path.waitAfter,
    waitBeforeMs: Math.max(
      0,
      Number(path.waitBeforeMs ?? path.waitBefore?.durationMs ?? 0),
    ),
    waitAfterMs: Math.max(
      0,
      Number(path.waitAfterMs ?? path.waitAfter?.durationMs ?? 0),
    ),
    waitBeforeName: path.waitBeforeName ?? path.waitBefore?.name ?? "",
    waitAfterName: path.waitAfterName ?? path.waitAfter?.name ?? "",
  };
}

export function normalizePaths(input: StoredPath[] = []): Path[] {
  return (input || []).map((path): Path => {
    const common = normalizeCommon(path);

    if (Array.isArray(path.segments)) {
      return {
        ...common,
        kind: "compound",
        segments: normalizePaths(path.segments),
        // A group's heading is optional: without one, each child keeps its own.
        heading: isHeading(path.heading) ? path.heading : undefined,
      };
    }

    return {
      ...common,
      kind: "atomic",
      endPoint: {
        x: path.endPoint?.x ?? 0,
        y: path.endPoint?.y ?? 0,
        name: path.endPoint?.name,
        locked: path.endPoint?.locked,
      },
      controlPoints: path.controlPoints || [],
      throughPoints: path.throughPoints?.map((point) => ({
        x: Number(point.x) || 0,
        y: Number(point.y) || 0,
        locked: point.locked,
      })),
      heading: normalizeHeading(path),
    };
  });
}

export function deriveSequence(
  data: any,
  normalizedLines: Path[],
): SequenceItem[] {
  if (Array.isArray(data?.sequence) && data.sequence.length) {
    return data.sequence as SequenceItem[];
  }

  return atomicSegments(normalizedLines).map((ln) => ({
    kind: "path",
    lineId: ln.id,
  }));
}
