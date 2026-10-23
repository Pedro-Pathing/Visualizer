import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateJavaCode } from "../src/lib/codegen";
import { MIRROR_AXIS, mirrorProject } from "../src/model/mirror";
import { fixtures, loadProject } from "./support/fixtures";

const POSE = /(\w+) = poseFactory\.of\(([-\d.e]+), ([-\d.e]+), ([-\d.e]+)\)/g;
/** Poses whose heading Pedro ignores: curve controls, through-points, facing targets. */
const POSITION_ONLY = /(Control\d+|Through\d+|Target)$/;

type Pose = { x: number; y: number; heading: number };

function posesIn(source: string): Map<string, Pose> {
  return new Map(
    [...source.matchAll(POSE)].map(([, name, x, y, heading]) => [
      name,
      { x: Number(x), y: Number(y), heading: Number(heading) },
    ]),
  );
}

/** What Pedro's `PoseFactory.mirrorX(axis)` does to a pose. */
const pedroMirrorX = ({ x, y, heading }: Pose): Pose => ({
  x: 2 * MIRROR_AXIS - x,
  y,
  heading: 180 - heading,
});

const sameAngle = (a: number, b: number) =>
  Math.abs(((((a - b) % 360) + 540) % 360) - 180) < 1e-3;

describe.each(fixtures)("mirroring $name", ({ text }) => {
  it("matches exporting with mirrorX", async () => {
    const doc = loadProject(text);
    const exported = posesIn(
      await generateJavaCode(doc.startPoint, doc.lines, "class", true),
    );
    const mirrored = mirrorProject(doc);
    const expected = posesIn(
      await generateJavaCode(
        mirrored.startPoint,
        mirrored.lines,
        "class",
        false,
      ),
    );

    expect([...exported.keys()]).toEqual([...expected.keys()]);
    for (const [name, pose] of exported) {
      const actual = pedroMirrorX(pose);
      const wanted = expected.get(name)!;
      expect(actual.x, name).toBeCloseTo(wanted.x, 3);
      expect(actual.y, name).toBeCloseTo(wanted.y, 3);
      if (!POSITION_ONLY.test(name)) {
        expect(sameAngle(actual.heading, wanted.heading), name).toBe(true);
      }
    }
  });

  it("is its own inverse", () => {
    const doc = loadProject(text);
    expect(mirrorProject(mirrorProject(doc))).toEqual(doc);
  });
});

describe("mirrorProject", () => {
  const doc = loadProject(
    readFileSync(
      join(import.meta.dirname, "fixtures/collision/through-obstacles.pp"),
      "utf8",
    ),
  );
  const original = structuredClone(doc);
  const mirrored = mirrorProject(doc);

  it("moves obstacles with the paths", () => {
    expect(mirrored.shapes).toHaveLength(doc.shapes.length);
    mirrored.shapes.forEach((shape, i) =>
      shape.vertices.forEach((vertex, j) => {
        expect(vertex.x).toBeCloseTo(
          2 * MIRROR_AXIS - doc.shapes[i].vertices[j].x,
        );
        expect(vertex.y).toBe(doc.shapes[i].vertices[j].y);
      }),
    );
  });

  it("leaves the original untouched", () => {
    expect(doc).toEqual(original);
  });
});
