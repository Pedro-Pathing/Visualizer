import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/config/defaults";
import { migrateSettings } from "../src/utils/settingsPersistence";

const saved = (version: string, optimize: boolean) => ({
  version,
  lastUpdated: "",
  settings: {
    ...DEFAULT_SETTINGS,
    experimentalFeatures: { optimize, curveThrough: true, obstacles: true },
  },
});

describe("optimizer default", () => {
  it("is on for new settings", () => {
    expect(DEFAULT_SETTINGS.experimentalFeatures?.optimize).toBe(true);
  });

  it("turns on once for settings saved while it defaulted off, keeping the other flags", () => {
    expect(migrateSettings(saved("1.0.1", false)).experimentalFeatures).toEqual({
      optimize: true,
      curveThrough: true,
      obstacles: true,
    });
  });

  it("stays off when it was turned off after the change", () => {
    expect(migrateSettings(saved("1.0.2", false)).experimentalFeatures?.optimize).toBe(false);
    expect(migrateSettings(saved("1.0.10", false)).experimentalFeatures?.optimize).toBe(false);
  });
});
