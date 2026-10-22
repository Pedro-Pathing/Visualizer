import { scaleLinear } from "d3";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/config/defaults";
import { calculateRobotState } from "../src/utils/animation";
import { calculateVisualizationPathTime } from "../src/utils/timeCalculator";
import { fixtures, goldenPath, loadProject } from "./support/fixtures";

const identity = scaleLinear();
const round = (value: number) => Math.round(value * 1000) / 1000;

describe.each(fixtures)("motion of $name", ({ name, raw }) => {
  it("timeline", async () => {
    const { startPoint, lines, sequence } = loadProject(raw);
    const prediction = calculateVisualizationPathTime(
      startPoint,
      lines,
      DEFAULT_SETTINGS,
      sequence,
    );
    await expect(
      JSON.stringify(prediction, null, 2) + "\n",
    ).toMatchFileSnapshot(goldenPath(name, "motion", "timeline.json"));
  });

  it("robot poses", async () => {
    const { startPoint, lines, sequence } = loadProject(raw);
    const { timeline } = calculateVisualizationPathTime(
      startPoint,
      lines,
      DEFAULT_SETTINGS,
      sequence,
    );
    const poses = Array.from({ length: 41 }, (_, step) => {
      const percent = step * 2.5;
      const state = calculateRobotState(
        percent,
        timeline,
        lines,
        startPoint,
        DEFAULT_SETTINGS,
        identity,
        identity,
      );
      return `${percent.toFixed(1).padStart(5)}%  x=${round(state.x)}  y=${round(state.y)}  heading=${round(state.heading)}`;
    });
    await expect(poses.join("\n") + "\n").toMatchFileSnapshot(
      goldenPath(name, "motion", "poses.txt"),
    );
  });
});
