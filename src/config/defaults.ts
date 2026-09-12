import type { StartPose, AtomicPath, Shape, Settings } from "../types";
import { makePathId } from "../utils/ids";

/**
 * Default robot dimensions
 */
export const DEFAULT_ROBOT_WIDTH = 16;
export const DEFAULT_ROBOT_HEIGHT = 16;

/**
 * Default canvas drawing settings
 */
export const POINT_RADIUS = 1.15;
export const LINE_WIDTH = 0.57;
export const FIELD_SIZE = 141.5;

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

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: Settings = {
  xVelocity: 75,
  yVelocity: 65,
  aVelocity: Math.PI,
  kFriction: 0.1,
  rWidth: DEFAULT_ROBOT_WIDTH,
  rHeight: DEFAULT_ROBOT_HEIGHT,
  safetyMargin: 1,
  maxVelocity: 40,
  maxAcceleration: 30,
  maxDeceleration: 30,
  fieldMap: "biobuzz.webp",
  robotImage: "/robot.png",
  showGhostPaths: false,
  showOnionLayers: false,
  onionLayerSpacing: 3, // inches between each robot body trace
  onionColor: "#dc2626",
  onionNextPointOnly: false,
  showHeadingArrow: false,
  showCurrentTValue: false,
  leftPanelWidth: 370,
  rightPanelWidth: 620,
  headingArrowLength: 50,
  headingArrowColor: "#ffffff",
  headingArrowThickness: 2,
  pathOpacity: 1,
  leftPanelMinWidth: 0,
  rightPanelMinWidth: 0,
  penToolMaxPaths: 8,
  experimentalFeatures: {
    optimize: false,
    curveThrough: false,
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

/**
 * Get default shapes (field obstacles)
 */
export function getDefaultShapes(): Shape[] {
  return [
    {
      id: "triangle-1",
      name: "Red Goal",
      vertices: [
        { x: 141.5, y: 70 },
        { x: 141.5, y: 141.5 },
        { x: 118.3, y: 141.5 },
        { x: 135.5, y: 118 },
        { x: 136.3, y: 70.2 },
      ],
      color: "#dc2626",
      fillColor: "#ff6b6b",
    },
    {
      id: "triangle-2",
      name: "Blue Goal",
      vertices: [
        { x: 6.2, y: 116.9 },
        { x: 25, y: 141.5 },
        { x: 0, y: 141.5 },
        { x: 0, y: 70 },
        { x: 6, y: 70 },
      ],
      color: "#2563eb",
      fillColor: "#60a5fa",
    },
  ];
}
