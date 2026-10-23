import {
  getDefaultPaths,
  getDefaultShapes,
  getDefaultStartPoint,
} from "../config/defaults";
import type {
  FieldPoint,
  Path,
  RobotConfig,
  SequenceItem,
  Shape,
  StartPose,
} from "../types";
import {
  deriveSequence,
  normalizeFieldPoints,
  normalizePaths,
  normalizeShapes,
  normalizeStartPose,
  type StoredPath,
  type StoredStartPose,
} from "../utils/normalize";
import { compareVersions, isRecord, migrateProject } from "./migrations";
import { normalizeRobotConfig } from "./robot";

export const PROJECT_VERSION = "2.0.0";

export interface ProjectDoc {
  startPoint: StartPose;
  lines: Path[];
  shapes: Shape[];
  sequence: SequenceItem[];
  fieldPoints: FieldPoint[];
  robot: RobotConfig;
  /** Other saved files shown alongside this one. */
  activePaths: string[];
}

export type LoadResult =
  | { ok: true; doc: ProjectDoc; warnings: string[] }
  | { ok: false; error: string };

/**
 * Read a saved project. `robotFallback` fills in robot settings that the file
 * doesn't record, which is every file written before 2.0.0.
 */
export function parseProject(
  text: string,
  robotFallback: RobotConfig,
): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  return projectFromJson(raw, robotFallback);
}

export function projectFromJson(
  raw: unknown,
  robotFallback: RobotConfig,
): LoadResult {
  if (!isRecord(raw) || !isRecord(raw.startPoint) || !raw.lines) {
    return {
      ok: false,
      error: "This isn't a path file: it has no start point or paths.",
    };
  }

  const warnings: string[] = [];
  if (
    typeof raw.version === "string" &&
    compareVersions(raw.version, PROJECT_VERSION) > 0
  ) {
    warnings.push(
      `This file was saved by a newer version of the visualizer (${raw.version}, this build writes ${PROJECT_VERSION}). Some settings may not load correctly.`,
    );
  }

  const project = migrateProject(raw);
  const lines = normalizePaths(project.lines as StoredPath[]);
  const doc: ProjectDoc = {
    startPoint: normalizeStartPose(project.startPoint as StoredStartPose),
    lines,
    shapes: normalizeShapes(project.shapes),
    sequence: deriveSequence(project, lines),
    fieldPoints: normalizeFieldPoints(project),
    robot: normalizeRobotConfig(project.robot, robotFallback),
    activePaths: Array.isArray(project.activePaths)
      ? project.activePaths.filter((path) => typeof path === "string")
      : [],
  };
  return { ok: true, doc, warnings };
}

export function serializeProject(
  doc: ProjectDoc,
  options: { pretty?: boolean } = {},
): string {
  return JSON.stringify(
    { version: PROJECT_VERSION, timestamp: new Date().toISOString(), ...doc },
    null,
    options.pretty ? 2 : undefined,
  );
}

export function createDefaultProject(
  robot: RobotConfig,
  fieldMap: string,
): ProjectDoc {
  const lines = normalizePaths(getDefaultPaths());
  return {
    startPoint: getDefaultStartPoint(),
    lines,
    shapes: getDefaultShapes(fieldMap),
    sequence: deriveSequence({}, lines),
    fieldPoints: [],
    robot,
    activePaths: [],
  };
}
