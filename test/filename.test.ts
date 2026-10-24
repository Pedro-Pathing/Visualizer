import { describe, expect, it } from "vitest";
import { toClassName } from "../src/lib/codegen/identifiers";
import { withExtension } from "../src/lib/files/fileNames";
import {
  PROJECT_EXTENSION,
  isProjectFileName,
  pathStem,
  stripProjectExtension,
} from "../src/utils/filename";

describe("project file names", () => {
  it("accepts the current and the legacy extension", () => {
    expect(isProjectFileName("auto.pp.json")).toBe(true);
    expect(isProjectFileName("auto.pp")).toBe(true);
    expect(isProjectFileName("AUTO.PP.JSON")).toBe(true);
    expect(isProjectFileName("auto.json")).toBe(false);
  });

  it("strips either extension", () => {
    expect(stripProjectExtension("auto.pp.json")).toBe("auto");
    expect(stripProjectExtension("auto.pp")).toBe("auto");
    expect(stripProjectExtension("auto.json")).toBe("auto.json");
    expect(pathStem("saved/auto.pp.json")).toBe("auto");
  });

  it("adds the current extension once, replacing a legacy one", () => {
    expect(withExtension("auto")).toBe(`auto${PROJECT_EXTENSION}`);
    expect(withExtension("auto.pp.json")).toBe(`auto${PROJECT_EXTENSION}`);
    expect(withExtension("auto.pp")).toBe(`auto${PROJECT_EXTENSION}`);
  });

  it("names code classes without the extension", () => {
    expect(toClassName("myAuto.pp.json", "Fallback")).toBe("MyAuto");
    expect(toClassName("2024Auto.pp", "Fallback")).toBe("Path2024Auto");
  });
});
