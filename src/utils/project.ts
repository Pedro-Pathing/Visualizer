import { get } from "svelte/store";
import type { Path, SequenceItem, Settings, Shape, StartPose } from "../types";
import type { FieldPoint } from "./fieldPoints";
import { fieldFrame } from "../stores";
import { readFrame, transformDoc, type Frame } from "./frame";
import {
  deriveSequence,
  normalizePaths,
  normalizeStartPose,
} from "./normalize";
import { normalizeFieldPoints } from "./fieldPoints";
import { FIELD_SIZE } from "../config/defaults";

export const PROJECT_VERSION = "1.6.0";

/**
 * A warning when the document came from a newer build, else null. Fields added
 * after this build are dropped silently, so the file may not mean what it says.
 */
export function newerVersionWarning(version: unknown): string | null {
  if (typeof version !== "string") return null;

  const parse = (value: string) =>
    value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const stored = parse(version);
  const current = parse(PROJECT_VERSION);

  for (
    let index = 0;
    index < Math.max(stored.length, current.length);
    index++
  ) {
    const left = stored[index] ?? 0;
    const right = current[index] ?? 0;
    if (left > right) {
      return `This file was saved by a newer version of the visualizer (${version}, this build writes ${PROJECT_VERSION}). Some settings may not load correctly.`;
    }
    if (left < right) return null;
  }

  return null;
}

export interface ProjectDoc {
  startPoint: StartPose;
  lines: Path[];
  shapes: Shape[];
  sequence: SequenceItem[];
  fieldPoints?: FieldPoint[];
  settings?: Settings;
  activePaths?: string[];
}

/**
 * A document's frame says how to read its numbers; which frame the user works
 * in is their own preference and stays untouched by opening a file.
 */
function stripFrameSettings(settings: Settings | undefined) {
  if (!settings) return settings;
  const { origin: _origin, axes: _axes, ...rest } = settings;
  return rest as Settings;
}

/**
 * A parsed document brought into canonical coordinates, plus the frame its
 * numbers were stored in.
 */
export interface HydratedProject extends ProjectDoc {
  frame: Frame;
}

/**
 * Read a parsed document into canonical coordinates. Shape migration runs
 * first so that the frame transform sees objects rather than the legacy array
 * form of field points.
 */
export function hydrateProjectDoc(data: any): HydratedProject {
  const frame = readFrame(data);
  const lines = normalizePaths(data?.lines || []);

  const doc: ProjectDoc = {
    startPoint: normalizeStartPose(
      data?.startPoint ?? { x: FIELD_SIZE / 2, y: FIELD_SIZE / 2 },
    ),
    lines,
    shapes: data?.shapes || [],
    sequence: deriveSequence(data, lines),
    fieldPoints: normalizeFieldPoints(data),
    settings: stripFrameSettings(data?.settings),
    activePaths: Array.isArray(data?.activePaths) ? data.activePaths : [],
  };

  return { ...transformDoc(doc, frame, "toCanonical"), frame };
}

/**
 * Overrides carry whole documents for the second and additional paths, so the
 * frame has to be applied to the merged result rather than to `doc`.
 */
export function buildProject(
  doc: ProjectDoc,
  overrides: Record<string, unknown> = {},
) {
  const { frame: frameOverride, ...rest } = overrides as {
    frame?: Frame;
  } & Record<string, unknown>;
  const frame = frameOverride ?? get(fieldFrame);

  // transformDoc rebuilds every field it touches, so the live canonical state
  // is never written through.
  return {
    ...transformDoc({ ...doc, ...rest } as ProjectDoc, frame, "toDoc"),
    version: PROJECT_VERSION,
    center: frame.center,
    axes: frame.axes,
    timestamp: new Date().toISOString(),
  };
}

export function serializeProject(
  doc: ProjectDoc,
  options: { pretty?: boolean; overrides?: Record<string, unknown> } = {},
): string {
  const { pretty = false, overrides = {} } = options;
  return JSON.stringify(
    buildProject(doc, overrides),
    null,
    pretty ? 2 : undefined,
  );
}
