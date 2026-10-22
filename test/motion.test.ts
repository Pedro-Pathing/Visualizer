import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/config/defaults";
import { robotPoseAt } from "../src/sim/pose";
import { calculateVisualizationPathTime } from "../src/utils/timeCalculator";
import { fixtures, goldenPath, loadProject } from "./support/fixtures";

const round = (value: number) => Math.round(value * 1000) / 1000;

function load(text: string) {
  const doc = loadProject(text);
  return { ...doc, settings: { ...DEFAULT_SETTINGS, ...doc.robot } };
}

describe.each(fixtures)("motion of $name", ({ name, text }) => {
  it("timeline", async () => {
    const { startPoint, lines, sequence, settings } = load(text);
    const prediction = calculateVisualizationPathTime(
      startPoint,
      lines,
      settings,
      sequence,
    );
    await expect(
      JSON.stringify(prediction, null, 2) + "\n",
    ).toMatchFileSnapshot(goldenPath(name, "motion", "timeline.json"));
  });

  it("robot poses", async () => {
    const { startPoint, lines, sequence, settings } = load(text);
    const { timeline } = calculateVisualizationPathTime(
      startPoint,
      lines,
      settings,
      sequence,
    );
    const totalTime = timeline.at(-1)?.endTime ?? 0;
    const poses = Array.from({ length: 41 }, (_, step) => {
      const percent = step * 2.5;
      const pose = robotPoseAt(
        (percent / 100) * totalTime,
        timeline,
        startPoint,
        lines,
        settings,
      );
      return `${percent.toFixed(1).padStart(5)}%  x=${round(pose.x)}  y=${round(pose.y)}  heading=${round(pose.heading)}`;
    });
    await expect(poses.join("\n") + "\n").toMatchFileSnapshot(
      goldenPath(name, "motion", "poses.txt"),
    );
  });
});
