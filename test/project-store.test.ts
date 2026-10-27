import { describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../src/io";
import {
  addSegment,
  pointAt,
  removePath,
  updatePoint,
  updateRobot,
  type PointAddress,
} from "../src/model/commands";
import { ProjectStore } from "../src/state/project.svelte";
import { createSegment } from "../src/utils/normalize";
import { DEFAULT_ROBOT } from "./support/fixtures";

function store() {
  return new ProjectStore(createDefaultProject(DEFAULT_ROBOT, "biobuzz.webp"));
}

const endpoint = (project: ProjectStore): PointAddress => ({
  kind: "path",
  lineId: project.doc.lines[0].id,
  index: 0,
});

describe("ProjectStore", () => {
  it("records each edit as one undo step and redoes it", () => {
    const project = store();
    const original = project.doc;
    project.apply(updatePoint(endpoint(project), { x: 10 }));
    expect(project.canUndo).toBe(true);

    project.undo();
    expect(project.doc).toBe(original);
    project.redo();
    expect(pointAt(project.doc, endpoint(project))?.x).toBe(10);
  });

  it("never mutates a document it has handed out", () => {
    const project = store();
    const original = project.doc;
    const snapshot = structuredClone(original);
    project.apply(updatePoint(endpoint(project), { x: 10, y: 20 }));
    project.apply(updateRobot({ rLength: 30 }));
    expect(original).toEqual(snapshot);
  });

  it("records a whole transaction as one step", () => {
    const project = store();
    const original = project.doc;
    for (let x = 1; x <= 5; x++) {
      project.preview(updatePoint(endpoint(project), { x }));
    }
    project.commit();
    project.undo();
    expect(project.doc).toBe(original);
    expect(project.canUndo).toBe(false);
  });

  it("restores the document when a transaction is cancelled", () => {
    const project = store();
    const original = project.doc;
    project.preview(updatePoint(endpoint(project), { x: 99 }));
    project.cancel();
    expect(project.doc).toBe(original);
    expect(project.canUndo).toBe(false);
  });

  it("merges coalesced edits that arrive together", () => {
    vi.useFakeTimers();
    const project = store();
    const original = project.doc;
    project.apply(updatePoint(endpoint(project), { x: 1 }), { coalesce: "x" });
    vi.advanceTimersByTime(200);
    project.apply(updatePoint(endpoint(project), { x: 12 }), { coalesce: "x" });
    project.undo();
    expect(project.doc).toBe(original);

    project.apply(updatePoint(endpoint(project), { x: 1 }), { coalesce: "x" });
    vi.advanceTimersByTime(5000);
    project.apply(updatePoint(endpoint(project), { x: 12 }), { coalesce: "x" });
    project.undo();
    expect(pointAt(project.doc, endpoint(project))?.x).toBe(1);
  });

  it("tracks unsaved changes by document", () => {
    const project = store();
    expect(project.dirty).toBe(false);
    project.apply(updatePoint(endpoint(project), { x: 10 }));
    expect(project.dirty).toBe(true);
    project.undo();
    expect(project.dirty).toBe(false);
    project.redo();
    project.markSaved();
    expect(project.dirty).toBe(false);
  });

  it("starts a fresh history when a document is loaded", () => {
    const project = store();
    project.apply(updatePoint(endpoint(project), { x: 10 }));
    project.load(createDefaultProject(DEFAULT_ROBOT, "biobuzz.webp"));
    expect(project.canUndo).toBe(false);
    expect(project.dirty).toBe(false);
  });
});

describe("commands", () => {
  it("removes a path along with its sequence entries", () => {
    const project = store();
    const extra = createSegment(80, 80);
    project.apply(addSegment(extra));
    expect(project.doc.sequence).toHaveLength(2);

    project.apply(removePath(extra.id));
    expect(project.doc.lines).toHaveLength(1);
    expect(project.doc.sequence).toHaveLength(1);
  });

  it("addresses through-points before control points", () => {
    const project = store();
    const segment = {
      ...createSegment(80, 80),
      controlPoints: [{ x: 1, y: 1 }],
      throughPoints: [{ x: 2, y: 2 }],
    };
    project.apply(addSegment(segment));
    const address: PointAddress = {
      kind: "path",
      lineId: segment.id,
      index: 1,
    };
    project.apply(updatePoint(address, { x: 5 }));
    expect(pointAt(project.doc, address)).toEqual({ x: 5, y: 2 });
  });
});
