import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/config/defaults";
import type { ProjectDoc } from "../src/io";
import {
  findCollisions,
  robotFootprint,
  type Collision,
} from "../src/model/collision";
import { robotPoseAt } from "../src/sim/pose";
import type { AtomicPath, BasePoint, Shape } from "../src/types";
import {
  calculatePathTime,
  calculateVisualizationPathTime,
} from "../src/utils/timeCalculator";
import {
  isProjectFileName,
  stripProjectExtension,
} from "../src/utils/filename";
import { DEFAULT_ROBOT, goldenPath, loadProject } from "./support/fixtures";

const ROBOT = { ...DEFAULT_ROBOT, rLength: 18, rWidth: 12, safetyMargin: 1 };

const line = (
  id: string,
  endPoint: BasePoint,
  overrides: Partial<AtomicPath> = {},
): AtomicPath => ({
  kind: "atomic",
  id,
  color: "#000",
  endPoint,
  controlPoints: [],
  heading: { type: "constant", degrees: 0 },
  ...overrides,
});

const box = (
  id: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Shape => ({
  id,
  vertices: [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ],
  color: "#000",
  fillColor: "#000",
});

const polygon = (id: string, vertices: BasePoint[]): Shape => ({
  id,
  vertices,
  color: "#000",
  fillColor: "#000",
});

function project(
  start: BasePoint & { headingDeg?: number },
  lines: AtomicPath[],
  shapes: Shape[],
  robot = ROBOT,
): ProjectDoc {
  return {
    startPoint: { headingDeg: 0, ...start },
    lines,
    shapes,
    sequence: lines.map((entry) => ({ kind: "path", lineId: entry.id })),
    fieldPoints: [],
    robot,
    activePaths: [],
  };
}

const settingsOf = (doc: ProjectDoc) => ({ ...DEFAULT_SETTINGS, ...doc.robot });

function collide(doc: ProjectDoc, options = {}) {
  const { timeline } = calculatePathTime(
    doc.startPoint,
    doc.lines,
    settingsOf(doc),
    doc.sequence,
  );
  return { timeline, collisions: findCollisions(doc, timeline, options) };
}

function poseAt(doc: ProjectDoc, seconds: number) {
  const { timeline } = collide(doc);
  return robotPoseAt(
    seconds,
    timeline,
    doc.startPoint,
    doc.lines,
    settingsOf(doc),
  );
}

const extent = (points: BasePoint[]) => ({
  minX: Math.min(...points.map((point) => point.x)),
  maxX: Math.max(...points.map((point) => point.x)),
  minY: Math.min(...points.map((point) => point.y)),
  maxY: Math.max(...points.map((point) => point.y)),
});

describe("robotFootprint", () => {
  it("runs rLength along the heading and grows by the margin", () => {
    const pose = { x: 50, y: 50, heading: 0 };
    expect(extent(robotFootprint(pose, ROBOT))).toEqual({
      minX: 40,
      maxX: 60,
      minY: 43,
      maxY: 57,
    });
  });

  it("turns counter-clockwise with the heading", () => {
    const turned = extent(robotFootprint({ x: 50, y: 50, heading: 90 }, ROBOT));
    expect(turned.minX).toBeCloseTo(43, 9);
    expect(turned.maxX).toBeCloseTo(57, 9);
    expect(turned.minY).toBeCloseTo(40, 9);
    expect(turned.maxY).toBeCloseTo(60, 9);

    const corners = robotFootprint({ x: 0, y: 0, heading: 30 }, ROBOT);
    const front = {
      x: (corners[1].x + corners[2].x) / 2,
      y: (corners[1].y + corners[2].y) / 2,
    };
    expect(Math.hypot(front.x, front.y)).toBeCloseTo(10, 9);
    expect((Math.atan2(front.y, front.x) * 180) / Math.PI).toBeCloseTo(30, 9);
  });
});

describe("findCollisions", () => {
  it("finds nothing on a clear path", () => {
    const doc = project(
      { x: 20, y: 30 },
      [line("east", { x: 120, y: 30 })],
      [box("far", 50, 80, 70, 100)],
    );
    expect(collide(doc).collisions).toEqual([]);
  });

  it("reports one interval for a drive through an obstacle", () => {
    const doc = project(
      { x: 20, y: 70 },
      [line("east", { x: 120, y: 70 })],
      [box("block", 60, 60, 70, 80)],
    );
    const { collisions } = collide(doc);
    expect(collisions).toHaveLength(1);
    const [hit] = collisions;
    expect(hit.lineId).toBe("east");
    expect(hit.obstacle).toEqual({ kind: "shape", shapeId: "block" });

    // The front edge (center + 10) meets x = 60; the back edge leaves x = 70.
    expect(hit.firstContact.x).toBeCloseTo(50, 2);
    expect(hit.firstContact.y).toBeCloseTo(70, 9);
    expect(poseAt(doc, hit.start).x).toBeCloseTo(50, 2);
    expect(poseAt(doc, hit.end).x).toBeCloseTo(80, 2);
  });

  describe("a non-convex obstacle", () => {
    const notch = polygon("notch", [
      { x: 50, y: 50 },
      { x: 90, y: 50 },
      { x: 90, y: 90 },
      { x: 50, y: 90 },
      { x: 50, y: 80 },
      { x: 80, y: 80 },
      { x: 80, y: 60 },
      { x: 50, y: 60 },
    ]);
    const into = [line("in", { x: 65, y: 70 })];

    it("lets the robot into a notch it fits", () => {
      expect(
        collide(project({ x: 20, y: 70 }, into, [notch])).collisions,
      ).toEqual([]);
    });

    it("catches a robot too wide for the notch", () => {
      const wide = { ...ROBOT, rWidth: 22 };
      const { collisions } = collide(
        project({ x: 20, y: 70 }, into, [notch], wide),
      );
      expect(collisions).toHaveLength(1);
      expect(collisions[0].firstContact.x).toBeCloseTo(40, 2);
    });

    it("catches the far wall of the notch", () => {
      const { collisions } = collide(
        project({ x: 20, y: 70 }, [line("in", { x: 75, y: 70 })], [notch]),
      );
      expect(collisions).toHaveLength(1);
      expect(collisions[0].firstContact.x).toBeCloseTo(70, 2);
    });
  });

  it("catches containment either way round", () => {
    const parked = [line("nudge", { x: 71, y: 70 })];
    const inside = collide(
      project({ x: 70, y: 70 }, parked, [box("big", 40, 40, 100, 100)]),
    );
    expect(inside.collisions).toHaveLength(1);

    const underneath = collide(
      project({ x: 70, y: 70 }, parked, [box("small", 69, 69, 71, 71)]),
    );
    expect(underneath.collisions).toHaveLength(1);
  });

  it("reports leaving the field as a wall hit", () => {
    const doc = project(
      { x: 70, y: 70, headingDeg: 90 },
      [
        line(
          "north",
          { x: 70, y: 135 },
          {
            heading: { type: "constant", degrees: 90 },
          },
        ),
      ],
      [],
    );
    const { timeline, collisions } = collide(doc);
    expect(collisions).toHaveLength(1);
    const [hit] = collisions;
    expect(hit.obstacle).toEqual({ kind: "wall" });
    expect(hit.lineId).toBe("north");
    expect(hit.firstContact.y).toBeCloseTo(131.5, 2);
    expect(hit.end).toBeCloseTo(timeline[timeline.length - 1].endTime, 9);
  });

  it("catches a corner swinging into an obstacle while turning in place", () => {
    const long = { ...ROBOT, rLength: 30, rWidth: 10, safetyMargin: 0 };
    const doc = project(
      { x: 20, y: 70 },
      [
        line("east", { x: 40, y: 70 }),
        line(
          "north",
          { x: 40, y: 120 },
          {
            heading: { type: "constant", degrees: 90 },
          },
        ),
      ],
      [box("corner", 47, 77, 50, 80)],
      long,
    );
    const { timeline, collisions } = collide(doc);
    const turn = timeline.find((event) => event.type === "wait")!;

    expect(collisions).toHaveLength(1);
    const [hit] = collisions;
    expect(hit.lineId).toBeNull();
    expect(hit.start).toBeGreaterThan(turn.startTime);
    expect(hit.end).toBeLessThan(turn.endTime);
    expect(hit.firstContact.heading).toBeGreaterThan(0);
    expect(hit.firstContact.heading).toBeLessThan(90);
  });

  it("splits re-entry into separate intervals and keeps obstacles apart", () => {
    const doc = project(
      { x: 20, y: 70 },
      [
        line("east", { x: 120, y: 70 }),
        line(
          "back",
          { x: 20, y: 70 },
          {
            heading: { type: "constant", degrees: 0 },
          },
        ),
      ],
      [box("first", 50, 65, 55, 75), box("second", 85, 65, 90, 75)],
    );
    const summary = collide(doc).collisions.map((hit) => [
      hit.lineId,
      hit.obstacle.kind === "shape" ? hit.obstacle.shapeId : "wall",
    ]);
    expect(summary).toEqual([
      ["east", "first"],
      ["east", "second"],
      ["back", "second"],
      ["back", "first"],
    ]);
  });

  it("merges contact across consecutive waits in place", () => {
    const doc = project(
      { x: 20, y: 70 },
      [
        line("east", { x: 50, y: 70 }, { waitAfterMs: 500 }),
        line(
          "north",
          { x: 50, y: 120 },
          {
            heading: { type: "constant", degrees: 90 },
          },
        ),
      ],
      [box("block", 59, 60, 62, 80)],
    );
    const { timeline } = calculateVisualizationPathTime(
      doc.startPoint,
      doc.lines,
      settingsOf(doc),
      doc.sequence,
    );
    const waits = timeline.filter((event) => event.type === "wait");
    expect(waits).toHaveLength(2);

    const collisions = findCollisions(doc, timeline);
    expect(collisions.map((hit) => hit.lineId)).toEqual(["east", null]);
    const parked = collisions[1];
    expect(parked.start).toBeCloseTo(waits[0].startTime, 9);
    expect(parked.end).toBeGreaterThan(waits[1].startTime);
    expect(parked.end).toBeLessThan(waits[1].endTime);
  });

  it("can't step over an obstacle thinner than a sample step", () => {
    const sliverAt = (x: number) => box("sliver", x, 60, x + 0.05, 80);
    const offsets = Array.from({ length: 40 }, (_, i) => 50 + i * 0.75);
    const route = [line("east", { x: 120, y: 70 })];
    const tiny = { ...ROBOT, rLength: 2, rWidth: 2, safetyMargin: 0 };

    for (const x of offsets) {
      const doc = project({ x: 20, y: 70 }, route, [sliverAt(x)], tiny);
      expect(collide(doc).collisions, `sliver at x=${x}`).toHaveLength(1);
    }

    // The same sliver slips through when samples are further apart than the robot is long.
    const missed = offsets.filter((x) => {
      const doc = project({ x: 20, y: 70 }, route, [sliverAt(x)], tiny);
      return collide(doc, { step: 10 }).collisions.length === 0;
    });
    expect(missed.length).toBeGreaterThan(0);
  });
});

const COLLISION_FIXTURE_DIR = join(import.meta.dirname, "fixtures/collision");
const collisionFixtures = readdirSync(COLLISION_FIXTURE_DIR)
  .filter(isProjectFileName)
  .sort()
  .map((file) => ({
    name: stripProjectExtension(file),
    text: readFileSync(join(COLLISION_FIXTURE_DIR, file), "utf8"),
  }));

const round = (value: number) => Math.round(value * 1000) / 1000;

function describeCollision(hit: Collision) {
  return {
    lineId: hit.lineId,
    obstacle: hit.obstacle,
    start: round(hit.start),
    end: round(hit.end),
    firstContact: {
      x: round(hit.firstContact.x),
      y: round(hit.firstContact.y),
      heading: round(hit.firstContact.heading),
    },
  };
}

describe.each(collisionFixtures)("collisions in $name", ({ name, text }) => {
  it("golden", async () => {
    const doc = loadProject(text);
    const { timeline } = calculateVisualizationPathTime(
      doc.startPoint,
      doc.lines,
      settingsOf(doc),
      doc.sequence,
    );
    const collisions = findCollisions(doc, timeline).map(describeCollision);
    await expect(
      JSON.stringify(collisions, null, 2) + "\n",
    ).toMatchFileSnapshot(goldenPath("collision", `${name}.json`));
  });
});

describe("collision performance", () => {
  it("rechecks features-1.5 in well under a frame", () => {
    const doc = loadProject(
      readFileSync(
        join(import.meta.dirname, "fixtures/projects/features-1.5.pp"),
        "utf8",
      ),
    );
    const { timeline } = calculateVisualizationPathTime(
      doc.startPoint,
      doc.lines,
      settingsOf(doc),
      doc.sequence,
    );
    for (let i = 0; i < 20; i++) findCollisions(doc, timeline);

    const runs = 200;
    const started = performance.now();
    for (let i = 0; i < runs; i++) findCollisions(doc, timeline);
    const perCall = (performance.now() - started) / runs;

    console.info(`findCollisions(features-1.5): ${perCall.toFixed(3)} ms/call`);
    expect(perCall).toBeLessThan(5);
  });
});
