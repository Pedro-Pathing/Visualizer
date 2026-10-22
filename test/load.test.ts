import { describe, expect, it } from "vitest";
import { serializeProject } from "../src/utils/project";
import { fixtures, goldenPath, loadProject } from "./support/fixtures";

describe.each(fixtures)("loading $name", ({ name, raw }) => {
  it("normalizes to the golden document", async () => {
    const doc = loadProject(raw);
    await expect(JSON.stringify(doc, null, 2) + "\n").toMatchFileSnapshot(
      goldenPath(name, "normalized.json"),
    );
  });

  it("is unchanged by a second normalization", () => {
    const doc = loadProject(raw);
    expect(loadProject(structuredClone(doc))).toEqual(doc);
  });

  it("survives a save and reload", () => {
    const doc = loadProject(raw);
    const reloaded = loadProject(JSON.parse(serializeProject(doc)));
    expect(reloaded).toEqual(doc);
  });
});
