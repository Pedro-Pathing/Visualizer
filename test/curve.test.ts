import { describe, expect, it } from "vitest";
import { createCurve, curveOf, interpolatingBezier } from "../src/model/curve";
import { motionProfile } from "../src/sim/motionProfile";
import { getCurvePoint } from "../src/utils/math";
import type { AtomicPath } from "../src/types";

const segment = (overrides: Partial<AtomicPath>): AtomicPath => ({
  kind: "atomic",
  id: "segment",
  color: "#000",
  endPoint: { x: 0, y: 0 },
  controlPoints: [],
  heading: { type: "tangential", reverse: false },
  ...overrides,
});

describe("interpolatingBezier", () => {
  it("passes through every point at evenly spaced parameters", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 30, y: 50 },
      { x: 70, y: 20 },
      { x: 90, y: 90 },
      { x: 120, y: 60 },
    ];
    const controls = interpolatingBezier(points);
    points.forEach((point, i) => {
      const onCurve = getCurvePoint(i / (points.length - 1), controls);
      expect(onCurve.x).toBeCloseTo(point.x, 6);
      expect(onCurve.y).toBeCloseTo(point.y, 6);
    });
  });
});

describe("curve", () => {
  const line = createCurve([
    { x: 0, y: 0 },
    { x: 30, y: 40 },
  ]);

  it("measures and walks a straight line exactly", () => {
    expect(line.length).toBeCloseTo(50, 9);
    expect(line.pointAt(0.5)).toEqual({ x: 15, y: 20 });
    expect(line.tangentAt(0.3)).toBeCloseTo(53.1301, 3);
  });

  it("spaces samples evenly by distance, not by parameter", () => {
    const curve = createCurve([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ]);
    const points = curve.sample(20);
    const chords = points
      .slice(1)
      .map((point, i) =>
        Math.hypot(point.x - points[i].x, point.y - points[i].y),
      );
    const mean = chords.reduce((sum, chord) => sum + chord, 0) / chords.length;
    for (const chord of chords) expect(chord / mean).toBeCloseTo(1, 1);
  });

  it("finds a direction where a control point sits on an end point", () => {
    const curve = createCurve([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(curve.tangentAt(0)).toBeCloseTo(45, 3);
  });

  it("models through-point paths as one curve through every point", () => {
    const through = [
      { x: 40, y: 80 },
      { x: 90, y: 30 },
    ];
    const curve = curveOf(
      { x: 10, y: 10 },
      segment({ endPoint: { x: 120, y: 100 }, throughPoints: through }),
    );
    for (const point of through) {
      const nearest = Math.min(
        ...curve
          .sample(2000)
          .map((sample) => Math.hypot(sample.x - point.x, sample.y - point.y)),
      );
      expect(nearest).toBeLessThan(0.05);
    }
  });
});

describe("motionProfile", () => {
  const limits = {
    forwardVelocity: 75,
    strafeVelocity: 65,
    maxAcceleration: 30,
    maxDeceleration: 20,
  };

  it.each([5, 100])("covers exactly %d inches in its duration", (distance) => {
    const profile = motionProfile(distance, limits);
    expect(profile.distanceAt(profile.duration)).toBeCloseTo(distance, 9);
    expect(profile.distanceAt(profile.duration + 1)).toBeCloseTo(distance, 9);
  });

  it("never moves backwards", () => {
    const profile = motionProfile(100, limits);
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
      const travelled = profile.distanceAt((profile.duration * i) / 100);
      expect(travelled).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = travelled;
    }
  });

  it("drives at the average axis speed without acceleration limits", () => {
    const profile = motionProfile(70, { ...limits, maxAcceleration: 0 });
    expect(profile.duration).toBeCloseTo(1, 9);
  });
});
