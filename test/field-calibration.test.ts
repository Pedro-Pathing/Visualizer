import { describe, expect, it } from "vitest";
import {
  calibrateFieldShapes,
  DEFAULT_SETTINGS,
  getDefaultShapes,
} from "../src/config/defaults";
import {
  createDefaultProject,
  parseProject,
  robotConfigOf,
  serializeProject,
} from "../src/io";
import { ProjectStore } from "../src/state/project.svelte";
import { updatePoint, updateShape } from "../src/model/commands";
import { findCollisions } from "../src/model/collision";
import { calculateVisualizationPathTime } from "../src/utils/timeCalculator";
import type { Shape } from "../src/types";

const robot = robotConfigOf({
  ...DEFAULT_SETTINGS,
  rLength: 1,
  rWidth: 1,
  safetyMargin: 0,
});
const legacyHive: Shape = {
  id: "biobuzz-red-hive",
  name: "Red HIVE",
  color: "red",
  fillColor: "red",
  vertices: [
    { x: 46, y: 50 },
    { x: 48.6, y: 50 },
    { x: 48.6, y: 91.4 },
    { x: 46, y: 91.4 },
  ],
};

describe("calibrated built-in obstacles", () => {
  it("puts outlines at the same image positions at 23.5 and 24 inches per tile", () => {
    const legacy = getDefaultShapes("biobuzz.webp", { tileSize: 24 });
    const calibrated = getDefaultShapes("biobuzz.webp", { tileSize: 23.5 });
    const red = calibrated.find((s) => s.id === "biobuzz-red-hive")!;
    expect(red.vertices[0].x).toBe(46.515625);
    expect(red.vertices[0].y).toBeCloseTo(50.4322916667, 8);
    // Top flower is centered exactly on the second vertical tile seam.
    const flower = calibrated.find((s) => s.id === "biobuzz-flower-top")!;
    expect(flower.vertices[3].x).toBe(47.25);
    expect(Math.max(...flower.vertices.map((p) => p.y))).toBe(141.25);
    expect(calibrateFieldShapes(calibrated, { tileSize: 24 })).toEqual(legacy);
    expect(calibrateFieldShapes(calibrated, { tileSize: 23.5 })).toBe(
      calibrated,
    );
  });

  it("migrates exact old defaults, but never moves edited or unrelated shapes", () => {
    const edited = {
      ...legacyHive,
      vertices: legacyHive.vertices.map((p, i) => (i ? p : { ...p, x: 45 })),
    };
    const custom = { ...legacyHive, id: "custom" };
    const result = calibrateFieldShapes([legacyHive, edited, custom], {
      tileSize: 23.5,
    });
    expect(result[0].fieldCalibration).toEqual({
      fieldMap: "biobuzz.webp",
      tileSize: 23.5,
    });
    expect(result[1]).toBe(edited);
    expect(result[2]).toBe(custom);
    const forged = { ...result[0], vertices: edited.vertices };
    expect(calibrateFieldShapes([forged], { tileSize: 24 })[0]).toMatchObject({
      vertices: edited.vertices,
    });
    expect(
      calibrateFieldShapes([forged], { tileSize: 24 })[0].fieldCalibration,
    ).toBeUndefined();
  });

  it("keeps edits, undo, save and reload consistent with calibration", () => {
    const store = new ProjectStore(createDefaultProject(robot, "biobuzz.webp"));
    const id = "biobuzz-red-hive";
    const original = store.doc.shapes.find((s) => s.id === id)!;
    store.apply(
      updatePoint({ kind: "vertex", shapeId: id, index: 0 }, { x: 40 }),
    );
    expect(
      store.doc.shapes.find((s) => s.id === id)?.fieldCalibration,
    ).toBeUndefined();
    store.calibrateField({ tileSize: 24 });
    expect(store.doc.shapes.find((s) => s.id === id)?.vertices[0].x).toBe(40);
    store.undo();
    expect(store.doc.shapes.find((s) => s.id === id)?.vertices[0].x).toBe(46);
    store.calibrateField({ tileSize: 23.5 });
    expect(store.doc.shapes.find((s) => s.id === id)).toEqual(original);
    store.apply(updateShape(id, (s) => ({ ...s, color: "purple" })));
    store.calibrateField({ tileSize: 24 });
    expect(store.doc.shapes.find((s) => s.id === id)?.color).toBe("purple");
    const doc = { ...store.doc, coordinates: { tileSize: 24 } };
    const loaded = parseProject(serializeProject(doc), robot);
    expect(loaded.ok && loaded.doc.shapes).toEqual(doc.shapes);
  });

  it("detects contact at the displayed calibrated edge, not the old edge", () => {
    const doc = createDefaultProject(robot, "biobuzz.webp");
    doc.shapes = doc.shapes.filter((s) => s.id === legacyHive.id);
    doc.startPoint = { x: 44, y: 70.75, headingDeg: 0 };
    doc.lines = [
      {
        kind: "atomic",
        id: "cross",
        color: "red",
        endPoint: { x: 52, y: 70.75 },
        controlPoints: [],
        heading: { type: "constant", degrees: 0 },
      },
    ];
    doc.sequence = [{ kind: "path", lineId: "cross" }];
    const { timeline } = calculateVisualizationPathTime(
      doc.startPoint,
      doc.lines,
      { ...DEFAULT_SETTINGS, ...robot },
      doc.sequence,
    );
    const hit = findCollisions(doc, timeline).find(
      (c) => c.obstacle.kind === "shape",
    );
    const left = Math.min(...doc.shapes[0].vertices.map((p) => p.x));
    expect(hit?.firstContact.x).toBeCloseTo(left - robot.rLength / 2, 3);
    const stationary = (x: number) => [
      {
        type: "wait" as const,
        duration: 1,
        startTime: 0,
        endTime: 1,
        startHeading: 0,
        targetHeading: 0,
        atPoint: { x, y: 70.75 },
      },
    ];
    expect(findCollisions(doc, stationary(left - 0.51))).toEqual([]);
    expect(findCollisions(doc, stationary(left - 0.49))).toHaveLength(1);
    expect(
      findCollisions(
        { ...doc, robot: { ...robot, safetyMargin: 1 } },
        stationary(left - 1.49),
      ),
    ).toHaveLength(1);
  });
});
