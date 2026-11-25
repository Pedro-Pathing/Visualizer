import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/config/defaults";
import type { ProjectDoc } from "../src/io";
import { showToast } from "../src/lib/toast";
import { EditorState } from "../src/state/editor.svelte";
import { ProjectStore } from "../src/state/project.svelte";
import type { AtomicPath } from "../src/types";
import { DEFAULT_ROBOT } from "./support/fixtures";

vi.mock("../src/lib/toast", () => ({ showToast: vi.fn() }));

const segment = (id: string, x: number): AtomicPath => ({
  kind: "atomic",
  id,
  color: "#000",
  endPoint: { x, y: 10 },
  controlPoints: [{ x: x - 10, y: 30 }],
  heading: { type: "constant", degrees: 0 },
});

function editor() {
  const lines = [segment("a", 40), segment("b", 80)];
  const doc: ProjectDoc = {
    startPoint: { x: 20, y: 10, headingDeg: 0 },
    lines,
    shapes: [],
    sequence: lines.map((line) => ({ kind: "path", lineId: line.id })),
    fieldPoints: [],
    robot: DEFAULT_ROBOT,
    activePaths: [],
  };
  const project = new ProjectStore(doc);
  return { project, editor: new EditorState(project) };
}

/** A fetch that answers each request only when the test says so. */
function deferredFetch() {
  const pending: ((response: Response) => void)[] = [];
  const fetch = vi.fn(
    () => new Promise<Response>((resolve) => pending.push(resolve)),
  );
  vi.stubGlobal("fetch", fetch);
  return { fetch, pending };
}

const answer = (waypoints: number[][]) =>
  new Response(
    JSON.stringify({
      status: "completed",
      result: { optimized_waypoints: waypoints, changed: true },
    }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(showToast).mockClear();
});

describe("optimizeLines", () => {
  it("sends every segment's request before any answers, and applies each as it arrives", async () => {
    const { project, editor: ed } = editor();
    const { fetch, pending } = deferredFetch();
    const done = ed.optimizeLines(["a", "b"], DEFAULT_SETTINGS);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    pending[1](answer([[40, 10], [60, 20], [80, 10]]));
    // b updates while a's request is still out.
    await vi.waitFor(() =>
      expect((project.doc.lines[1] as AtomicPath).controlPoints).toEqual([
        { x: 60, y: 20 },
      ]),
    );
    expect((project.doc.lines[0] as AtomicPath).controlPoints).toEqual([
      { x: 30, y: 30 },
    ]);
    expect(ed.optimizing).toBe(true);

    pending[0](answer([[20, 10], [30, 20], [40, 10]]));
    await done;

    const [a, b] = project.doc.lines as AtomicPath[];
    expect(a.controlPoints).toEqual([{ x: 30, y: 20 }]);
    expect(b.controlPoints).toEqual([{ x: 60, y: 20 }]);
    expect(ed.optimizing).toBe(false);
  });

  it("keeps the segments that answered when another request fails", async () => {
    const { project, editor: ed } = editor();
    const { fetch, pending } = deferredFetch();
    const done = ed.optimizeLines(["a", "b"], DEFAULT_SETTINGS);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    pending[0](new Response("down", { status: 503 }));
    pending[1](answer([[40, 10], [60, 20], [80, 10]]));
    await done;

    const [a, b] = project.doc.lines as AtomicPath[];
    expect(a.controlPoints).toEqual([{ x: 30, y: 30 }]);
    expect(b.controlPoints).toEqual([{ x: 60, y: 20 }]);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("503"),
      "error",
    );
  });
});
