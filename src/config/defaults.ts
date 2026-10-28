import type {
  StartPose,
  AtomicPath,
  Shape,
  Settings,
  BasePoint,
} from "../types";
import { makePathId } from "../utils/ids";

/**
 * Default robot dimensions
 */
export const DEFAULT_ROBOT_LENGTH = 16;
export const DEFAULT_ROBOT_WIDTH = 16;

/**
 * Default canvas drawing settings
 */
export const POINT_RADIUS = 1;
export const LINE_WIDTH = 0.57;
/**
 * The floor inside the perimeter walls, in inches; coordinates run from 0 to
 * this. Six 24" tiles make 144", and the walls cover the outer 1.25" of the
 * edge tiles.
 */
export const FIELD_SIZE = 141.5;
export const TILE_SIZE = 24;
/**
 * Field images show all six tiles at full size, so they extend this far past
 * the floor on every side and are cropped to it.
 */
export const FIELD_IMAGE_OVERHANG = (6 * TILE_SIZE - FIELD_SIZE) / 2;
/** The tile seams in every field image are drawn in this color. */
export const FIELD_SEAM_COLOR = "#000000";

/**
 * Available field maps
 */
export const AVAILABLE_FIELD_MAPS = [
  { value: "biobuzz.webp", label: "BIOBUZZ Field (2026-2027)" },
  { value: "decode.webp", label: "DECODE Field (2025-2026)" },
  { value: "intothedeep.webp", label: "INTO THE DEEP Field (2024-2025)" },
  { value: "centerstage.webp", label: "CENTERSTAGE (2023-2024)" },
  { value: "custom", label: "Custom Field (Upload)" },
];

export type ColorScheme = "light" | "dark";

/**
 * Fields drawn in both schemes. The key is the field's id, which is not a file
 * itself; fields not listed here use `/fields/<id>` in either scheme.
 */
export const FIELD_SCHEME_IMAGES: Record<
  string,
  Record<ColorScheme, string>
> = {
  "biobuzz.webp": { light: "biobuzz-light.webp", dark: "biobuzz-dark.webp" },
};

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: Settings = {
  forwardVelocity: 75,
  strafeVelocity: 65,
  aVelocity: Math.PI,
  kFriction: 0.1,
  rLength: DEFAULT_ROBOT_LENGTH,
  rWidth: DEFAULT_ROBOT_WIDTH,
  safetyMargin: 1,
  maxAcceleration: 50,
  maxDeceleration: 50,
  fieldMap: "biobuzz.webp",
  robotImage: "/robot.png",
  showGhostPaths: false,
  showOnionLayers: false,
  onionLayerSpacing: 3, // inches between each robot body trace
  onionColor: "#dc2626",
  onionNextPointOnly: false,
  showHeadingArrow: false,
  showAllPoints: true,
  leftPanelWidth: 280,
  rightPanelWidth: 360,
  headingArrowLength: 50,
  headingArrowColor: "#ffffff",
  headingArrowThickness: 2,
  pathOpacity: 1,
  leftPanelMinWidth: 200,
  rightPanelMinWidth: 240,
  penToolMaxPaths: 8,
  curveThroughMaxPoints: 4,
  autoCollapsePanels: false,
  experimentalFeatures: {
    optimize: false,
    curveThrough: false,
    obstacles: false,
  },
};

/**
 * Get default starting point
 */
export function getDefaultStartPoint(): StartPose {
  return {
    x: 56,
    y: 8,
    headingDeg: 90,
    locked: false,
  };
}

/**
 * Get default initial path lines
 */
export function getDefaultPaths(): AtomicPath[] {
  return [
    {
      kind: "atomic",
      id: makePathId(),
      name: "Path 1",
      endPoint: { x: 56, y: 36 },
      controlPoints: [],
      heading: { type: "linear", startDeg: 90, endDeg: 180 },
      color: "#ffc516",
      locked: false,
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    },
  ];
}

/** Outline and fill for obstacles that belong to an alliance. */
export const RED_ALLIANCE_COLORS = { color: "#dc2626", fillColor: "#ff6b6b" };
export const BLUE_ALLIANCE_COLORS = { color: "#2563eb", fillColor: "#60a5fa" };

/** The obstacles a new project starts with, by field map. Other fields start empty. */
const FIELD_OBSTACLES: Record<string, () => Shape[]> = {
  "decode.webp": decodeObstacles,
  "biobuzz.webp": biobuzzObstacles,
};

export function getDefaultShapes(fieldMap: string): Shape[] {
  return FIELD_OBSTACLES[fieldMap]?.() ?? [];
}

const HIVE_CENTER = { x: 71.25, y: 70.7 };

/**
 * One alliance's HIVE: just the bar along its field-side edge, so the open
 * floor between the two HIVEs stays driveable. `place` maps the red bar onto
 * the alliance's side of the field.
 */
function hiveObstacle(
  alliance: "red" | "blue",
  colors: { color: string; fillColor: string },
  place: (point: BasePoint) => BasePoint,
): Shape {
  return {
    id: `biobuzz-${alliance}-hive`,
    name: alliance === "red" ? "Red HIVE" : "Blue HIVE",
    vertices: [
      { x: 46, y: 50 },
      { x: 48.6, y: 50 },
      { x: 48.6, y: 91.4 },
      { x: 46, y: 91.4 },
    ].map(place),
    ...colors,
  };
}

/**
 * The BIOBUZZ seesaws, one outline per alliance. A seesaw tips between its two
 * cells during the match, and robots can drive under the raised end, so each
 * outline stops short of it.
 */
function biobuzzObstacles(): Shape[] {
  return [
    hiveObstacle("red", RED_ALLIANCE_COLORS, (p) => p),
    // The blue HIVE is the red one rotated half a turn about the field's centre.
    hiveObstacle("blue", BLUE_ALLIANCE_COLORS, ({ x, y }) => ({
      x: HIVE_CENTER.x * 2 - x,
      y: HIVE_CENTER.y * 2 - y,
    })),
    {
      id: "biobuzz-flower-top",
      name: "Scoring-Side FLOWER",
      vertices: [
        { x: 43.4, y: 141.5 },
        { x: 50.1, y: 141.5 },
        { x: 50.1, y: 139.4 },
        { x: 46.75, y: 137.7 },
        { x: 43.4, y: 139.4 },
      ],
      ...RED_ALLIANCE_COLORS,
    },
    {
      id: "biobuzz-flower-right",
      name: "Blue Alliance FLOWER",
      vertices: [
        { x: 141.5, y: 98.1 },
        { x: 139.4, y: 98.1 },
        { x: 137.7, y: 94.75 },
        { x: 139.4, y: 91.4 },
        { x: 141.5, y: 91.4 },
      ],
      ...BLUE_ALLIANCE_COLORS,
    },
    {
      id: "biobuzz-flower-bottom",
      name: "Audience-Side FLOWER",
      vertices: [
        { x: 91.15, y: 0 },
        { x: 97.8, y: 0 },
        { x: 97.8, y: 2.1 },
        { x: 94.5, y: 3.8 },
        { x: 91.15, y: 2.1 },
      ],
      ...BLUE_ALLIANCE_COLORS,
    },
    {
      id: "biobuzz-flower-left",
      name: "Red Alliance FLOWER",
      vertices: [
        { x: 0, y: 50.35 },
        { x: 2.1, y: 50.35 },
        { x: 3.8, y: 47 },
        { x: 2.1, y: 43.65 },
        { x: 0, y: 43.65 },
      ],
      ...RED_ALLIANCE_COLORS,
    },
  ];
}

/** The DECODE goals and the structures along the side walls below them. */
function decodeObstacles(): Shape[] {
  return [
    {
      id: "triangle-1",
      name: "Red GOAL",
      vertices: [
        { x: 141.5, y: 70 },
        { x: 141.5, y: 141.5 },
        { x: 119.1, y: 141.5 },
        { x: 136.6, y: 118.8 },
        { x: 136.4, y: 70 },
      ],
      ...RED_ALLIANCE_COLORS,
    },
    {
      id: "triangle-2",
      name: "Blue GOAL",
      vertices: [
        { x: 5.1, y: 117.7 },
        { x: 24.2, y: 141.5 },
        { x: 0, y: 141.5 },
        { x: 0, y: 70 },
        { x: 5.1, y: 70 },
      ],
      ...BLUE_ALLIANCE_COLORS,
    },
  ];
}
