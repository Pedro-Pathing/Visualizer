import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  getDefaultPaths,
  getDefaultStartPoint,
} from "../src/config/defaults";
import { generatePointsArray } from "../src/lib/codegen/points";
import { snapPoint, type GridSnapOptions } from "../src/view/snap";
const snapPointToGrid = (x: number, y: number, options: GridSnapOptions) =>
  snapPoint({ x, y }, options);
import {
  createDefaultProject,
  parseProject,
  robotConfigOf,
  serializeProject,
} from "../src/io";
import {
  displayHeading,
  storedHeading,
  toDisplay,
  fromDisplay,
  editCoordinate,
  inchesPerUnit,
  inchesPerTile,
  fieldImageLayout,
  gridOrigin,
  gridSpacing,
  type CoordinateSettings,
} from "../src/utils/coordinates";

describe("coordinate frames", () => {
  it("keeps legacy Pedro coordinates in inches", () => {
    expect(toDisplay({ x: 12, y: 35 }, {})).toEqual({ x: 12, y: 35 });
    expect(displayHeading(45, {})).toBe(45);
  });

  it("centers FTC frames and gives them opposite X directions", () => {
    const point = { x: 70.75, y: 47.25 };
    expect(
      toDisplay(point, { coordinateSystem: "ftc", distanceUnit: "tiles" }),
    ).toEqual({ x: 1, y: 0 });
    expect(
      toDisplay(point, {
        coordinateSystem: "ftc-inverted",
        distanceUnit: "tiles",
      }),
    ).toEqual({ x: -1, y: -0 });
    expect(displayHeading(-90, { coordinateSystem: "ftc" })).toBe(0);
    expect(displayHeading(90, { coordinateSystem: "ftc-inverted" })).toBe(0);
  });

  for (const frame of ["pedro", "ftc", "ftc-inverted"] as const) {
    for (const unit of ["inches", "tiles"] as const) {
      it(`round trips points and headings in ${frame}/${unit}`, () => {
        const settings: CoordinateSettings = {
          coordinateSystem: frame,
          distanceUnit: unit,
          tileSize: 23.625,
        };
        for (const point of [
          { x: 0, y: 0 },
          { x: 141.5, y: 141.5 },
          { x: 31.25, y: 77.75 },
        ]) {
          const actual = fromDisplay(toDisplay(point, settings), settings);
          expect(actual.x).toBeCloseTo(point.x, 10);
          expect(actual.y).toBeCloseTo(point.y, 10);
        }
        for (const heading of [-180, 0, 90, 450])
          expect(
            storedHeading(displayHeading(heading, settings), settings),
          ).toBe(heading);
      });
    }
  }

  it("edits the intended FTC axis without changing the other coordinate or lock", () => {
    const result = editCoordinate(
      { x: 70.75, y: 70.75, locked: true },
      "x",
      2,
      { coordinateSystem: "ftc", distanceUnit: "tiles" },
    );
    expect(result).toEqual({ x: 70.75, y: 23.75, locked: true });
    expect(editCoordinate(result, "y", NaN, {})).toBe(result);
  });

  it("changes only the unit representation when tile size changes", () => {
    const point = { x: 47, y: 23.5 };
    expect(toDisplay(point, { distanceUnit: "tiles" })).toEqual({ x: 2, y: 1 });
    expect(toDisplay(point, { distanceUnit: "tiles", tileSize: 47 })).toEqual({
      x: 1,
      y: 0.5,
    });
    expect(point).toEqual({ x: 47, y: 23.5 });
    for (const tileSize of [0, -2, NaN, Infinity])
      expect(inchesPerUnit({ distanceUnit: "tiles", tileSize })).toBe(23.5);
  });

  it("aligns Pedro grid and snapping with the cropped image seams", () => {
    const seams = [23.75, 47.25, 70.75, 94.25, 117.75];
    expect(gridOrigin({})).toBe(0.25);
    for (const distanceUnit of ["inches", "tiles"] as const) {
      const settings = { coordinateSystem: "pedro" as const, distanceUnit };
      for (const size of [1, 3, 6, 12]) {
        const spacing = gridSpacing(size, settings);
        const origin = gridOrigin(settings);
        for (const seam of seams) {
          expect((seam - origin) / spacing).toBeCloseTo(
            Math.round((seam - origin) / spacing),
          );
          expect(
            snapPoint(
              { x: seam + 0.1, y: seam - 0.1 },
              { snapToGrid: true, showGrid: true, gridSize: spacing, origin },
            ),
          ).toEqual({ x: seam, y: seam });
        }
      }
    }
    // Callers without an explicit frame use Pedro's seam alignment too.
    expect(
      snapPoint(
        { x: 24, y: 48 },
        { snapToGrid: true, showGrid: true, gridSize: 11.75 },
      ),
    ).toEqual({ x: 23.75, y: 47.25 });
    expect(
      snapPoint(
        { x: -10, y: 155 },
        { snapToGrid: true, showGrid: true, gridSize: 12 },
      ),
    ).toEqual({ x: 0, y: 141.5 });
  });

  it("places FTC (2, 2) exactly on calibrated image seams at every supported tile scale", () => {
    for (const tileSize of [23.5, 23.625, 24, 25]) {
      const settings: CoordinateSettings = {
        coordinateSystem: "ftc",
        distanceUnit: "tiles",
        tileSize,
      };
      const point = fromDisplay({ x: 2, y: 2 }, settings);
      const layout = fieldImageLayout(settings);
      // The fifth vertical and first horizontal seams in the six-tile image.
      expect(point.x).toBeCloseTo(layout.offset + 5 * tileSize, 10);
      expect(point.y).toBeCloseTo(layout.offset + tileSize, 10);
      for (const coordinateSystem of [
        "pedro",
        "ftc",
        "ftc-inverted",
      ] as const) {
        const inches = {
          ...settings,
          coordinateSystem,
          distanceUnit: "inches" as const,
        };
        const tiles = { ...inches, distanceUnit: "tiles" as const };
        expect(fieldImageLayout(inches)).toEqual(fieldImageLayout(tiles));
        expect(inchesPerTile(inches)).toBe(tileSize);
        expect(gridSpacing(12, inches)).toBe(gridSpacing(12, tiles));
        for (let seam = 1; seam < 6; seam++) {
          const value = layout.offset + seam * tileSize;
          expect(
            snapPoint(
              { x: value + 0.1, y: value - 0.1 },
              {
                snapToGrid: true,
                showGrid: true,
                gridSize: gridSpacing(12, inches),
                origin: gridOrigin(inches),
              },
            ),
          ).toEqual({ x: value, y: value });
        }
      }
    }
  });

  it("snaps on the centered tile grid and clamps at field edges", () => {
    const settings: CoordinateSettings = {
      coordinateSystem: "ftc",
      distanceUnit: "tiles",
    };
    const options = {
      snapToGrid: true,
      showGrid: true,
      gridSize: gridSpacing(12, settings),
      origin: gridOrigin(settings),
    };
    expect(options.gridSize).toBe(11.75);
    expect(snapPointToGrid(72, 83, options)).toEqual({ x: 70.75, y: 82.5 });
    expect(snapPointToGrid(-10, 155, options)).toEqual({ x: 0, y: 141.5 });
    expect(snapPointToGrid(72, 83, { ...options, snapToGrid: false })).toEqual({
      x: 72,
      y: 83,
    });
  });

  it("exports selected coordinate units without changing stored geometry", () => {
    const start = { x: 70.75, y: 47.25, headingDeg: -90 };
    expect(
      generatePointsArray(start, [], {
        coordinateSystem: "ftc",
        distanceUnit: "tiles",
      }),
    ).toBe("[(1.0, 0.0)]");
    expect(generatePointsArray(start, [])).toBe("[(70.750, 47.250)]");
    expect(start.headingDeg).toBe(-90);
  });

  it("saves view settings with canonical geometry for lossless reopening", () => {
    const startPoint = getDefaultStartPoint();
    const lines = getDefaultPaths();
    const settings = {
      ...DEFAULT_SETTINGS,
      coordinateSystem: "ftc" as const,
      distanceUnit: "tiles" as const,
      tileSize: 23.625,
    };
    const doc = {
      ...createDefaultProject(robotConfigOf(settings), settings.fieldMap),
      startPoint,
      lines,
      coordinates: {
        coordinateSystem: settings.coordinateSystem,
        distanceUnit: settings.distanceUnit,
        tileSize: settings.tileSize,
      },
    };
    const loaded = parseProject(serializeProject(doc), doc.robot);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw Error(loaded.error);
    expect(loaded.doc.startPoint).toEqual(startPoint);
    expect(loaded.doc.lines).toEqual(lines);
    expect(loaded.doc.coordinates).toEqual(doc.coordinates);
  });
});
