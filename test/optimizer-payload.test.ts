import { describe, expect, it } from "vitest";
import {
  applyOptimizedWaypoints,
  buildOptimizationPayload,
  describeOptimization,
  optimizeBlocker,
} from "../src/lib/optimizer/optimizer";
import { DEFAULT_SETTINGS } from "../src/config/defaults";
import type { ProjectDoc } from "../src/io/project";
import type {
  AtomicPath,
  CompoundPath,
  Path,
  Settings,
  Shape,
  StartPose,
} from "../src/types";
import { flattenToAtomicSegments } from "../src/utils/pathTraversal";

const START: StartPose = { x: 10, y: 10, headingDeg: 0 };
const LINE: AtomicPath = {
  kind: "atomic",
  id: "l1",
  color: "#000",
  endPoint: { x: 50, y: 10 },
  controlPoints: [{ x: 30, y: 10 }],
  heading: { type: "constant", degrees: 0 },
};
const shape = (id: string, vertices: { x: number; y: number }[]): Shape => ({
  id,
  vertices,
  color: "#000",
  fillColor: "#000",
});
const BOX = shape("box", [
  { x: 20, y: 20 },
  { x: 30, y: 20 },
  { x: 30, y: 30 },
  { x: 20, y: 30 },
]);
const settings = (obstacles: boolean, overrides: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  rLength: 18,
  rWidth: 12,
  safetyMargin: 2,
  experimentalFeatures: { obstacles },
  ...overrides,
});
const build = (shapes: Shape[], s: Settings) =>
  buildOptimizationPayload("l1", START, [LINE], shapes, s);
const triangles = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    shape(`t${i}`, [
      { x: i, y: 0 },
      { x: i + 1, y: 0 },
      { x: i, y: 1 },
    ]),
  );

describe("optimizer payload obstacles", () => {
  it("sends no obstacles and the raw robot size when the flag is off", () => {
    const payload = build([BOX], settings(false));
    expect(payload.obstacles).toEqual([]);
    expect(payload.robot_width).toBe(18);
    expect(payload.robot_height).toBe(12);
    expect(payload.safety_margin).toBe(0);
    expect(payload.min_coord_field).toBe(0);
    expect(payload.max_coord_field).toBe(141.5);
    expect(payload.waypoints).toHaveLength(3);
  });

  it("sends the raw robot, the margin plus slack, its ramp and the obstacle polygons when on", () => {
    const payload = build([BOX], settings(true));
    expect(payload.robot_width).toBe(18);
    expect(payload.robot_height).toBe(12);
    expect(payload.safety_margin).toBeCloseTo(2.1);
    expect(payload.margin_ramp).toBe(6);
    expect(payload.obstacles).toEqual([
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
      ],
    ]);
    expect(payload.min_coord_field).toBe(0);
    expect(payload.max_coord_field).toBe(141.5);
  });

  it.each([
    ["undefined", undefined as unknown as number],
    ["negative", -3],
    ["NaN", NaN],
  ])("clamps a safety margin that is %s to zero, as robotFootprint does", (_, margin) => {
    const payload = build([BOX], settings(true, { safetyMargin: margin }));
    expect(payload.safety_margin).toBe(0.1);
  });

  it("turns segments into thin rectangles and skips points and zero-length segments", () => {
    const payload = build(
      [
        shape("dot", [{ x: 5, y: 5 }]),
        shape("same", [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ]),
        shape("seg", [
          { x: 20, y: 20 },
          { x: 30, y: 20 },
        ]),
        BOX,
      ],
      settings(true),
    );
    expect(payload.obstacles).toHaveLength(2);
    const expected = [
      [20, 20.01],
      [30, 20.01],
      [30, 19.99],
      [20, 19.99],
    ];
    expect(payload.obstacles[0]).toHaveLength(4);
    payload.obstacles[0].forEach((point, i) => {
      expect(point[0]).toBeCloseTo(expected[i][0], 6);
      expect(point[1]).toBeCloseTo(expected[i][1], 6);
    });
    expect(payload.obstacles[1]).toEqual(BOX.vertices.map((v) => [v.x, v.y]));
  });

  it("rejects more than 64 obstacles or 64 points per obstacle when on", () => {
    expect(() => build(triangles(65), settings(true))).toThrow(
      /Too many obstacles/,
    );
    const many = shape(
      "many",
      Array.from({ length: 65 }, (_, i) => ({ x: i, y: i % 2 })),
    );
    expect(() => build([many], settings(true))).toThrow(/Too many obstacles/);
  });

  it("accepts exactly 64 obstacles and exactly 64 points per obstacle", () => {
    expect(() => build(triangles(64), settings(true))).not.toThrow();
    const max = shape(
      "max",
      Array.from({ length: 64 }, (_, i) => ({ x: i, y: i % 2 })),
    );
    expect(() => build([...triangles(63), max], settings(true))).not.toThrow();
  });

  it("does not limit obstacles when the flag is off", () => {
    expect(() => build(triangles(65), settings(false))).not.toThrow();
    expect(build(triangles(65), settings(false)).obstacles).toEqual([]);
  });
});

// A 30x6 robot driving straight through a box at 60..80 x 72..90.
const CROSSING: AtomicPath = {
  ...LINE,
  endPoint: { x: 120, y: 80 },
  controlPoints: [{ x: 70, y: 80 }],
};
const BLOCK = shape("block", [
  { x: 60, y: 72 },
  { x: 80, y: 72 },
  { x: 80, y: 90 },
  { x: 60, y: 90 },
]);
const robotSettings = (obstacles: boolean) =>
  settings(obstacles, { rLength: 30, rWidth: 6, safetyMargin: 1 });
const docOf = (lines: Path[], shapes: Shape[]): ProjectDoc => ({
  startPoint: { x: 20, y: 80, headingDeg: 0 },
  lines,
  shapes,
  sequence: flattenToAtomicSegments({ x: 20, y: 80 }, lines).map(({ line }) => ({
    kind: "path" as const,
    lineId: line.id,
  })),
  fieldPoints: [],
  robot: { ...DEFAULT_SETTINGS, rLength: 30, rWidth: 6, safetyMargin: 1 },
  activePaths: [],
});

describe("describeOptimization", () => {
  it("returns no warning when obstacles are off", () => {
    const doc = docOf([CROSSING], [BLOCK]);
    expect(describeOptimization(doc, robotSettings(false), ["l1"], [])).toBeNull();
  });

  it("returns no warning when the Visualizer finds the segment clear", () => {
    const doc = docOf([CROSSING], []);
    expect(describeOptimization(doc, robotSettings(true), ["l1"], [])).toBeNull();
  });

  it("ignores collisions on segments that were not optimized", () => {
    const doc = docOf([CROSSING], [BLOCK]);
    expect(describeOptimization(doc, robotSettings(true), ["other"], [])).toBeNull();
  });

  it("warns from the Visualizer's own check, whatever the server claimed", () => {
    const doc = docOf([CROSSING], [BLOCK]);
    expect(describeOptimization(doc, robotSettings(true), ["l1"], [])).toContain(
      "shown in red",
    );
  });

  it("warns about the endpoint when the optimizer could not change the path", () => {
    const doc = docOf([CROSSING], [BLOCK]);
    expect(
      describeOptimization(doc, robotSettings(true), ["l1"], ["l1"]),
    ).toContain("endpoint");
  });
});

describe("optimizeBlocker", () => {
  const blocker = (lines: Path[], s: Settings, id = "l1") =>
    optimizeBlocker(
      flattenToAtomicSegments(START, lines).find((entry) => entry.line.id === id)!,
      s,
    );
  const PIECEWISE: AtomicPath = {
    ...CROSSING,
    heading: {
      type: "piecewise",
      piecewiseHeading: {
        segments: [
          {
            startProgress: 0,
            endProgress: 0.5,
            interpolationType: "linear",
            parameters: { startDeg: 0, endDeg: 90 },
          },
          {
            startProgress: 0.5,
            endProgress: 1,
            interpolationType: "linear",
            parameters: { startDeg: 90, endDeg: 0 },
          },
        ],
      },
    },
  };
  const group = (heading?: CompoundPath["heading"]): CompoundPath => ({
    kind: "compound",
    id: "g",
    color: "#000",
    segments: [CROSSING],
    heading,
  });

  it("lets a plain segment through, with obstacles on or off", () => {
    expect(blocker([LINE], settings(true))).toBeNull();
    expect(blocker([LINE], settings(false))).toBeNull();
  });

  it("blocks piecewise headings only while obstacles are on", () => {
    expect(blocker([PIECEWISE], settings(true))).toMatch(/Piecewise\/group headings/);
    expect(blocker([PIECEWISE], settings(false))).toBeNull();
  });

  it("blocks a segment inside a group with its own heading while obstacles are on", () => {
    const linear = { type: "linear" as const, startDeg: 0, endDeg: 90 };
    expect(blocker([group(linear)], settings(true))).toMatch(/Piecewise\/group headings/);
    expect(blocker([group(linear)], settings(false))).toBeNull();
    expect(blocker([group()], settings(true))).toBeNull();
  });

  it("blocks locked paths, locked control points, through-curves and too many control points", () => {
    const s = settings(false);
    expect(blocker([{ ...LINE, locked: true }], s)).toBe("Path is locked");
    expect(
      blocker([{ ...LINE, controlPoints: [{ x: 30, y: 10, locked: true }] }], s),
    ).toMatch(/Unlock/);
    expect(blocker([{ ...LINE, throughPoints: [{ x: 30, y: 12 }] }], s)).toMatch(
      /Through-curves/,
    );
    expect(blocker([{ ...LINE, controlPoints: [] }], s)).toMatch(/control point/);
    const points = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ x: 12 + i, y: 10 }));
    expect(blocker([{ ...LINE, controlPoints: points(10) }], s)).toBeNull();
    expect(blocker([{ ...LINE, controlPoints: points(11) }], s)).toMatch(/at most 10/);
  });
});

describe("applyOptimizedWaypoints", () => {
  it("drops the control points when the optimizer answers with a straight line", () => {
    const next = applyOptimizedWaypoints([LINE], "l1", {
      optimized_waypoints: [
        [10, 10],
        [50, 10],
      ],
    });
    expect(next?.[0]).toMatchObject({ controlPoints: [], endPoint: { x: 50, y: 10 } });
  });
});
