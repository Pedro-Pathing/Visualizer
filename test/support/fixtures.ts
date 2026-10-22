import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { normalizeFieldPoints } from "../../src/utils/fieldPoints";
import type { Shape } from "../../src/types";
import {
  deriveSequence,
  normalizePaths,
  normalizeStartPose,
  type StoredPath,
  type StoredStartPose,
} from "../../src/utils/normalize";
import type { ProjectDoc } from "../../src/utils/project";

const FIXTURE_DIR = join(import.meta.dirname, "../fixtures/projects");

export interface Fixture {
  name: string;
  raw: unknown;
}

export const fixtures: Fixture[] = readdirSync(FIXTURE_DIR)
  .filter((file) => file.endsWith(".pp"))
  .sort()
  .map((file) => ({
    name: basename(file, ".pp"),
    raw: JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8")),
  }));

interface StoredProject {
  startPoint: StoredStartPose;
  lines?: StoredPath[];
  shapes?: Shape[];
}

/** The normalization FileManager applies when it opens a file. */
export function loadProject(input: unknown): ProjectDoc {
  const raw = input as StoredProject;
  const lines = normalizePaths(raw.lines ?? []);
  return {
    startPoint: normalizeStartPose(raw.startPoint),
    lines,
    shapes: raw.shapes ?? [],
    sequence: deriveSequence(raw, lines),
    fieldPoints: normalizeFieldPoints(raw),
  };
}

export function goldenPath(...segments: string[]): string {
  return join(import.meta.dirname, "../golden", ...segments);
}
