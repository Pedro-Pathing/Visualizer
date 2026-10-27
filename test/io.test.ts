import { describe, expect, it } from "vitest";
import {
  PROJECT_VERSION,
  createDefaultProject,
  parseProject,
  serializeProject,
} from "../src/io";
import { DEFAULT_ROBOT, loadProject } from "./support/fixtures";

const minimal = {
  startPoint: { x: 0, y: 0, headingDeg: 0 },
  lines: [],
};

function parse(project: object) {
  return parseProject(JSON.stringify(project), DEFAULT_ROBOT);
}

describe("parseProject", () => {
  it("rejects text that isn't JSON", () => {
    expect(parseProject("{not json", DEFAULT_ROBOT)).toMatchObject({
      ok: false,
    });
  });

  it("rejects JSON without a start point or paths", () => {
    expect(parse({ lines: [] })).toMatchObject({ ok: false });
    expect(parse({ startPoint: minimal.startPoint })).toMatchObject({
      ok: false,
    });
  });

  it("warns about files from a newer version but still loads them", () => {
    const result = parse({ ...minimal, version: "99.0.0" });
    expect(result.ok && result.warnings).toHaveLength(1);
  });

  it("doesn't warn about current or older files", () => {
    for (const version of [PROJECT_VERSION, "1.5.0", undefined]) {
      const result = parse({ ...minimal, version });
      expect(result.ok && result.warnings).toEqual([]);
    }
  });

  it("keeps only string entries of activePaths", () => {
    const result = parse({ ...minimal, activePaths: ["a.pp", 3, null] });
    expect(result.ok && result.doc.activePaths).toEqual(["a.pp"]);
  });
});

describe("robot config", () => {
  it("is taken from the settings block of files before 2.0.0", () => {
    const result = parse({
      ...minimal,
      version: "1.5.0",
      settings: {
        rWidth: 18,
        rHeight: 14,
        xVelocity: 50,
        yVelocity: 45,
        maxVelocity: 40,
        fieldMap: "decode.webp",
      },
    });
    expect(result.ok && result.doc.robot).toEqual({
      ...DEFAULT_ROBOT,
      rLength: 18,
      rWidth: 14,
      forwardVelocity: 50,
      strafeVelocity: 45,
    });
  });

  it("falls back when a file doesn't record it", () => {
    const result = parse(minimal);
    expect(result.ok && result.doc.robot).toEqual(DEFAULT_ROBOT);
  });

  it("falls back per key for missing or invalid values", () => {
    const result = parse({
      ...minimal,
      version: PROJECT_VERSION,
      robot: { rLength: 20, rWidth: "wide", forwardVelocity: null },
    });
    expect(result.ok && result.doc.robot).toEqual({
      ...DEFAULT_ROBOT,
      rLength: 20,
    });
  });

  it("ignores a settings block in a current file", () => {
    const result = parse({
      ...minimal,
      version: PROJECT_VERSION,
      robot: { rLength: 20 },
      settings: { rWidth: 30 },
    });
    expect(result.ok && result.doc.robot.rLength).toBe(20);
  });
});

describe("serializeProject", () => {
  it("writes the current version and no settings block", () => {
    const doc = loadProject(
      JSON.stringify({
        ...minimal,
        version: "1.5.0",
        settings: { rWidth: 18 },
      }),
    );
    const saved = JSON.parse(serializeProject(doc));
    expect(saved.version).toBe(PROJECT_VERSION);
    expect(saved.settings).toBeUndefined();
    expect(saved.robot.rLength).toBe(18);
  });
});

describe("createDefaultProject", () => {
  it("uses the given robot config", () => {
    const robot = { ...DEFAULT_ROBOT, rLength: 12 };
    expect(createDefaultProject(robot, "biobuzz.webp").robot).toBe(robot);
  });

  it("round-trips through a save", () => {
    const doc = createDefaultProject(DEFAULT_ROBOT, "biobuzz.webp");
    expect(loadProject(serializeProject(doc))).toEqual(doc);
  });

  it("starts with the obstacles of the given field", () => {
    const names = (fieldMap: string) =>
      createDefaultProject(DEFAULT_ROBOT, fieldMap).shapes.map(
        (shape) => shape.name,
      );
    expect(names("decode.webp")).toEqual(["Red GOAL", "Blue GOAL"]);
    expect(names("biobuzz.webp")).toContain("Red HIVE");
    expect(names("custom")).toEqual([]);
  });
});
