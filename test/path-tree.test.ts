import { describe, expect, it } from "vitest";
import type { Path } from "../src/types";
import { createSegment } from "../src/utils/normalize";
import { groupPaths, insertPaths, movePath } from "../src/utils/pathTraversal";

const ids = (paths: Path[]): unknown[] =>
  paths.map((path) =>
    path.kind === "compound" ? { [path.id]: ids(path.segments) } : path.id,
  );

function tree() {
  const [a, b, c] = [1, 2, 3].map((n) => ({
    ...createSegment(n * 10, n * 10),
    id: `p${n}`,
  }));
  const grouped = groupPaths([a, b, c], ["p2", "p3"]);
  const group = grouped[1];
  return { lines: [a, { ...group, id: "g" }] as Path[] };
}

describe("insertPaths", () => {
  const added = { ...createSegment(5, 5), id: "new" };

  it("inserts next to a path inside a group", () => {
    const { lines } = tree();
    expect(ids(insertPaths(lines, "p2", "after", [added]))).toEqual([
      "p1",
      { g: ["p2", "new", "p3"] },
    ]);
    expect(ids(insertPaths(lines, "p3", "before", [added]))).toEqual([
      "p1",
      { g: ["p2", "new", "p3"] },
    ]);
  });

  it("inserts at the top level", () => {
    const { lines } = tree();
    expect(ids(insertPaths(lines, "p1", "before", [added]))).toEqual([
      "new",
      "p1",
      { g: ["p2", "p3"] },
    ]);
  });

  it("returns the same array when the target is missing", () => {
    const { lines } = tree();
    expect(insertPaths(lines, "nope", "after", [added])).toBe(lines);
  });
});

describe("movePath", () => {
  it("moves a path into a group", () => {
    const { lines } = tree();
    expect(ids(movePath(lines, "p1", "p3", "after"))).toEqual([
      { g: ["p2", "p3", "p1"] },
    ]);
  });

  it("won't move a group inside itself", () => {
    const { lines } = tree();
    expect(movePath(lines, "g", "p2")).toBe(lines);
  });
});
