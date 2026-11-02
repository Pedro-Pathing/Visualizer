import { generateJavaCode, generateKotlinCode } from "../src/lib/codegen";
import { describe, expect, it } from "vitest";
import { createDefaultProject, robotConfigOf } from "../src/io";
import { DEFAULT_SETTINGS } from "../src/config/defaults";
import { ProjectStore } from "../src/state/project.svelte";
import { updatePoint } from "../src/model/commands";
import {
  fromDisplay,
  toDisplay,
  type CoordinateSystem,
} from "../src/utils/coordinates";

describe("tile-size edits", () => {
  it("exports recalibrated Pedro inches in Java and Kotlin", () => {
    const before = {
      coordinateSystem: "ftc" as const,
      distanceUnit: "tiles" as const,
      tileSize: 23.5,
    };
    const doc = createDefaultProject(
      robotConfigOf(DEFAULT_SETTINGS),
      "biobuzz.webp",
      before,
    );
    doc.startPoint = { ...fromDisplay({ x: 1, y: 1 }, before), headingDeg: 0 };
    doc.lines = [
      {
        id: "path",
        kind: "atomic",
        color: "red",
        endPoint: fromDisplay({ x: 2, y: 2 }, before),
        controlPoints: [fromDisplay({ x: 1, y: 2 }, before)],
        heading: { type: "constant", degrees: 0 },
      },
    ];
    const store = new ProjectStore(doc);
    for (const generate of [generateJavaCode, generateKotlinCode]) {
      expect(generate(store.doc.startPoint, store.doc.lines)).toMatch(
        /poseFactory\.of\(117\.75, 23\.75, 0(?:\.0)?\)/,
      );
    }
    store.changeTileSize(before, 24);
    for (const generate of [generateJavaCode, generateKotlinCode]) {
      for (const mode of ["coordinates", "class", "full"] as const) {
        const code = generate(store.doc.startPoint, store.doc.lines, mode);
        expect(code).toMatch(/poseFactory\.of\(94\.75, 46\.75, 0(?:\.0)?\)/);
        expect(code).toMatch(/poseFactory\.of\(118\.75, 22\.75, 0(?:\.0)?\)/);
        expect(code).toMatch(/poseFactory\.of\(118\.75, 46\.75, 0(?:\.0)?\)/);
        expect(code).not.toContain("117.75");
        expect(code).not.toMatch(/poseFactory\.of\(2(?:\.0)?, 2(?:\.0)?,/);
      }
    }
  });

  for (const coordinateSystem of [
    "pedro",
    "ftc",
    "ftc-inverted",
  ] as CoordinateSystem[]) {
    it(`preserves tile positions and undo/redo in ${coordinateSystem}`, () => {
      const before = {
        coordinateSystem,
        distanceUnit: "tiles" as const,
        tileSize: 23.5,
      };
      const doc = createDefaultProject(
        robotConfigOf(DEFAULT_SETTINGS),
        "biobuzz.webp",
        before,
      );
      const position = fromDisplay({ x: 2, y: 2 }, before);
      doc.startPoint = { ...doc.startPoint, ...position };
      doc.fieldPoints = [{ ...position, color: "red" }];
      doc.shapes.push({
        id: "custom",
        color: "red",
        fillColor: "red",
        vertices: [position],
      });
      doc.lines = [
        {
          id: "path",
          kind: "compound",
          color: "red",
          segments: [
            {
              id: "segment",
              kind: "atomic",
              color: "red",
              endPoint: position,
              controlPoints: [position],
              throughPoints: [position],
              heading: {
                type: "piecewise",
                piecewiseHeading: {
                  segments: [
                    {
                      startProgress: 0,
                      endProgress: 1,
                      interpolationType: "facing-point",
                      parameters: { point: position },
                    },
                  ],
                },
              },
            },
          ],
        },
      ];
      const store = new ProjectStore(doc);
      store.apply(
        updatePoint({ kind: "start" }, fromDisplay({ x: 1, y: 1 }, before)),
      );
      store.changeTileSize(before, 24);
      const after = { ...before, tileSize: 24 };
      expect(toDisplay(store.doc.startPoint, after)).toEqual({ x: 1, y: 1 });
      store.undo();
      expect(toDisplay(store.doc.startPoint, after)).toEqual({ x: 2, y: 2 });
      const compound = store.doc.lines[0];
      if (compound.kind !== "compound") throw new Error("compound expected");
      const segment = compound.segments[0];
      if (segment.kind !== "atomic" || segment.heading.type !== "piecewise")
        throw new Error("atomic expected");
      for (const p of [
        segment.endPoint,
        ...segment.controlPoints,
        ...segment.throughPoints!,
        segment.heading.piecewiseHeading.segments[0].parameters!.point!,
        store.doc.fieldPoints[0],
        store.doc.shapes.at(-1)!.vertices[0],
      ]) {
        expect(toDisplay(p, after).x).toBeCloseTo(2);
        expect(toDisplay(p, after).y).toBeCloseTo(2);
      }
      expect(store.doc.robot).toEqual(doc.robot);
      store.redo();
      expect(toDisplay(store.doc.startPoint, after)).toEqual({ x: 1, y: 1 });
      store.changeTileSize(after, 23.5);
      expect(toDisplay(store.doc.startPoint, before)).toEqual({ x: 1, y: 1 });
    });
  }
  it("keeps physical positions when Inches is selected", () => {
    const store = new ProjectStore(
      createDefaultProject(robotConfigOf(DEFAULT_SETTINGS), "biobuzz.webp"),
    );
    const start = store.doc.startPoint;
    store.changeTileSize({ distanceUnit: "inches", tileSize: 23.5 }, 24);
    expect(store.doc.startPoint).toBe(start);
  });
});
