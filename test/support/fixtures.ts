import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "../../src/config/defaults";
import { parseProject, robotConfigOf, type ProjectDoc } from "../../src/io";
import {
  isProjectFileName,
  stripProjectExtension,
} from "../../src/utils/filename";

const FIXTURE_DIR = join(import.meta.dirname, "../fixtures/projects");

export const DEFAULT_ROBOT = robotConfigOf(DEFAULT_SETTINGS);

export interface Fixture {
  name: string;
  text: string;
}

export const fixtures: Fixture[] = readdirSync(FIXTURE_DIR)
  .filter(isProjectFileName)
  .sort()
  .map((file) => ({
    name: stripProjectExtension(file),
    text: readFileSync(join(FIXTURE_DIR, file), "utf8"),
  }));

export function loadProject(text: string): ProjectDoc {
  const result = parseProject(text, DEFAULT_ROBOT);
  if (!result.ok) throw new Error(result.error);
  return result.doc;
}

export function goldenPath(...segments: string[]): string {
  return join(import.meta.dirname, "../golden", ...segments);
}
