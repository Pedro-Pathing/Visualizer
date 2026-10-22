import { ROBOT_CONFIG_KEYS } from "./robot";

export type RawProject = Record<string, unknown>;

interface Migration {
  /** The format version this migration produces. */
  version: string;
  up(raw: RawProject): RawProject;
}

/**
 * Structural changes between format versions, oldest first. Older shapes of
 * individual fields (headings on endpoints, missing ids) are repaired by
 * normalization, which runs on every load.
 */
const MIGRATIONS: Migration[] = [
  {
    version: "1.6.0",
    up({ settings, ...rest }) {
      if (!isRecord(settings)) return rest;
      const robot = Object.fromEntries(
        ROBOT_CONFIG_KEYS.filter((key) => key in settings).map((key) => [
          key,
          settings[key],
        ]),
      );
      return { ...rest, robot };
    },
  },
];

export function migrateProject(raw: RawProject): RawProject {
  const from = typeof raw.version === "string" ? raw.version : "0.0.0";
  return MIGRATIONS.filter(
    (migration) => compareVersions(from, migration.version) < 0,
  ).reduce((project, migration) => migration.up(project), raw);
}

/** Negative, zero or positive as `a` is older than, equal to or newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
