// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/config/defaults";
import {
  createDefaultProject,
  parseProject,
  robotConfigOf,
  serializeProject,
} from "../src/io";
import { normalizeCoordinateSettings } from "../src/utils/coordinates";
import {
  saveSessionSnapshot,
  loadSessionSnapshot,
} from "../src/lib/session/sessionSnapshot";
import {
  generateJavaCode,
  generateKotlinCode,
  generatePointsArray,
} from "../src/lib/codegen";
import { loadSettings, saveSettings } from "../src/utils/settingsPersistence";

const robot = robotConfigOf(DEFAULT_SETTINGS);
const coordinates = {
  coordinateSystem: "ftc-inverted",
  distanceUnit: "tiles",
  tileSize: 23.625,
} as const;
const project = () => ({
  ...createDefaultProject(robot, "decode.webp", coordinates),
  coordinates,
  fieldPoints: [{ x: 20, y: 30, color: "red" }],
});

describe("fork project compatibility", () => {
  it("migrates the 1.5 settings block while retaining canonical points and robot dimensions", () => {
    const doc = project();
    const result = parseProject(
      JSON.stringify({
        ...doc,
        coordinates: undefined,
        robot: undefined,
        version: "1.5.0",
        settings: {
          ...coordinates,
          xVelocity: 40,
          yVelocity: 45,
          rWidth: 18,
          rHeight: 14,
        },
      }),
      robot,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error);
    expect(result.doc.coordinates).toEqual(coordinates);
    expect(result.doc.startPoint).toEqual(doc.startPoint);
    expect(result.doc.lines).toEqual(doc.lines);
    expect(result.doc.robot).toMatchObject({
      forwardVelocity: 40,
      strafeVelocity: 45,
      rLength: 18,
      rWidth: 14,
    });
    const reopened = parseProject(serializeProject(result.doc), robot);
    expect(reopened.ok && reopened.doc).toEqual(result.doc);
  });

  it("keeps both coordinate preferences and field points in recovery snapshots", () => {
    const doc = project();
    saveSessionSnapshot({
      project: doc,
      settings: { ...DEFAULT_SETTINGS, ...coordinates },
      currentFilePath: "example.pp",
    });
    const restored = loadSessionSnapshot();
    expect(restored?.project).toEqual(doc);
    expect(restored?.currentFilePath).toBe("example.pp");
    expect(restored?.settings).toMatchObject(coordinates);
  });

  it("retains coordinate preferences in browser settings", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, ...coordinates });
    expect(await loadSettings()).toMatchObject(coordinates);
  });

  it("sanitizes invalid coordinate preferences", () => {
    expect(
      normalizeCoordinateSettings({
        coordinateSystem: "bogus",
        distanceUnit: "meters",
        tileSize: -5,
      }),
    ).toEqual({
      coordinateSystem: "pedro",
      distanceUnit: "inches",
      tileSize: 23.5,
    });
  });

  it("keeps robot code canonical while points arrays include through points in display units", async () => {
    const doc = project();
    const line = doc.lines[0];
    if (line.kind !== "atomic") throw Error("Expected atomic path");
    const paths = [
      { ...line, controlPoints: [], throughPoints: [{ x: 70.75, y: 47.25 }] },
    ];
    const before = structuredClone(paths);
    const java = await generateJavaCode(doc.startPoint, paths);
    const kotlin = await generateKotlinCode(doc.startPoint, paths);
    expect(
      generatePointsArray(doc.startPoint, paths, {
        coordinateSystem: "ftc",
        distanceUnit: "tiles",
      }),
    ).toContain("(1.0, 0.0)");
    expect(java).toContain("poseFactory.of(56, 8, 90)");
    expect(kotlin).toContain("poseFactory.of(56.0, 8.0, 90.0)");
    expect(paths).toEqual(before);
  });
});
