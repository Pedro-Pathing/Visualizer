import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/config/defaults";
import { segmentStroke, type SegmentStroke } from "../src/lib/scene/stroke";
import { robotPoseAt } from "../src/sim/pose";
import type { BasePoint } from "../src/types";
import { getCurvePoint } from "../src/utils/math";
import { flattenToAtomicSegments } from "../src/utils/pathTraversal";
import { calculateVisualizationPathTime } from "../src/utils/timeCalculator";
import { fixtures, loadProject } from "./support/fixtures";

/** What the renderer draws, as a polyline fine enough to measure against. */
function drawnPolyline(stroke: SegmentStroke): BasePoint[] {
  switch (stroke.kind) {
    case "line":
      return [stroke.from, stroke.to];
    case "cubic": {
      const controls = [
        stroke.from,
        stroke.control1,
        stroke.control2,
        stroke.to,
      ];
      return Array.from({ length: 2001 }, (_, i) =>
        getCurvePoint(i / 2000, controls),
      );
    }
    case "polyline":
      return stroke.points;
  }
}

function distanceToPolyline(point: BasePoint, polyline: BasePoint[]): number {
  let best = Infinity;
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1];
    const b = polyline[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const along =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
            ),
          );
    best = Math.min(
      best,
      Math.hypot(point.x - (a.x + along * dx), point.y - (a.y + along * dy)),
    );
  }
  return best;
}

describe.each(fixtures)("simulated robot on $name", ({ text }) => {
  it("stays on the drawn path", () => {
    const doc = loadProject(text);
    const settings = { ...DEFAULT_SETTINGS, ...doc.robot };
    const { timeline } = calculateVisualizationPathTime(
      doc.startPoint,
      doc.lines,
      settings,
      doc.sequence,
    );
    const segments = flattenToAtomicSegments(doc.startPoint, doc.lines);

    for (const event of timeline.filter((entry) => entry.type === "travel")) {
      const segment = segments.find((entry) => entry.line.id === event.lineId)!;
      const drawn = drawnPolyline(segmentStroke(segment.curve));

      for (let i = 0; i <= 40; i++) {
        const seconds = event.startTime + (event.duration * i) / 40;
        const pose = robotPoseAt(
          seconds,
          timeline,
          doc.startPoint,
          doc.lines,
          settings,
        );
        expect(distanceToPolyline(pose, drawn)).toBeLessThan(0.05);
      }
    }
  });
});
