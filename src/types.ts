// Exported type definitions for use in Svelte and TS modules

export interface BasePoint {
  x: number;
  y: number;
  locked?: boolean;
}

export type Origin = "center" | "bottom-left";

export type Axes = "first" | "legacy";

export type PiecewiseHeadingInterpolationType =
  "linear" | "constant" | "tangential" | "facing-point";

export interface PiecewiseHeadingSegment {
  startProgress: number;
  endProgress: number;
  interpolationType: PiecewiseHeadingInterpolationType;
  reversed?: boolean;
  /** Take the start angle from where the previous segment ends. Linear and constant only. */
  continueFromPrevious?: boolean;
  parameters?: {
    startDeg?: number;
    endDeg?: number;
    degrees?: number;
    point?: BasePoint;
  };
}

export interface PiecewiseHeadingInterpolation {
  segments: PiecewiseHeadingSegment[];
}

export interface FieldPoint extends BasePoint {
  color?: string;
  radius?: number;
  opacity?: number;
}

export type HeadingType = "linear" | "constant" | "tangential" | "piecewise";

export type Heading =
  | { type: "linear"; startDeg: number; endDeg: number }
  | { type: "constant"; degrees: number }
  | { type: "tangential"; reverse: boolean }
  | { type: "piecewise"; piecewiseHeading: PiecewiseHeadingInterpolation };

export type Point = BasePoint & { name?: string };

export interface StartPose extends BasePoint {
  name?: string;
  headingDeg: number;
}

export type ControlPoint = BasePoint;

export interface WaitSegment {
  name?: string;
  durationMs: number;
  position?: "before" | "after";
}

export type Path = {
  id: string;
  color: string;
  name?: string;
  locked?: boolean;
  waitBefore?: WaitSegment;
  waitAfter?: WaitSegment;
  waitBeforeMs?: number;
  waitAfterMs?: number;
  waitBeforeName?: string;
  waitAfterName?: string;
} & (Atomic | Compound);

export interface Atomic {
  kind: "atomic";
  endPoint: Point;
  controlPoints: ControlPoint[];
  heading: Heading;
}

export type AtomicPath = Extract<Path, Atomic>;

export interface Compound {
  kind: "compound";
  segments: Path[];
  heading?: Heading;
}

export type CompoundPath = Extract<Path, Compound>;

export type PathListItem = {
  id: string;
  name: string;
} & (
  | { kind: "atomic"; x: string; y: string; children?: never }
  | { kind: "compound"; children: PathListItem[]; x?: never; y?: never }
);

export type SequencePathItem = {
  kind: "path";
  lineId: string;
};

export type SequenceWaitItem = {
  kind: "wait";
  id: string;
  name: string;
  durationMs: number;
  locked?: boolean;
};

export type SequenceItem = SequencePathItem | SequenceWaitItem;

export interface Settings {
  xVelocity: number;
  yVelocity: number;
  aVelocity: number;
  kFriction: number;
  rWidth: number;
  rHeight: number;
  safetyMargin: number;
  maxVelocity: number; // inches/sec
  maxAcceleration: number; // inches/sec²
  maxDeceleration?: number; // inches/sec²
  fieldMap: string;
  origin?: Origin;
  axes?: Axes;
  customFieldImage?: string; // Base64 data URL for custom field image
  robotImage?: string;
  showGhostPaths?: boolean; // Show collision overlays via ghost paths
  showOnionLayers?: boolean; // Show robot body at intervals along the path
  onionLayerSpacing?: number; // Distance in inches between onion layers
  onionColor?: string; // Color for onion-layer colliders
  onionNextPointOnly?: boolean; // When true, onion layers show only for the next point (UI-only for now)
  showHeadingArrow?: boolean; // Show arrow indicating robot heading direction
  showCurrentTValue?: boolean; // Show the current path t value near the robot
  leftPanelWidth?: number; // Width of the left sidebar in pixels
  rightPanelWidth?: number; // Width of the right sidebar in pixels
  headingArrowLength?: number; // Length of the heading arrow in pixels
  headingArrowColor?: string; // Color of the heading arrow
  headingArrowThickness?: number; // Thickness/stroke width of the heading arrow
  pathOpacity?: number; // Opacity of path lines (0-1)
  leftPanelMinWidth?: number; // Minimum width of the left sidebar in pixels
  rightPanelMinWidth?: number; // Minimum width of the right sidebar in pixels
  penToolMaxPaths?: number; // Maximum number of paths a single pen stroke may create
  experimentalFeatures?: {
    optimize?: boolean;
    curveThrough?: boolean;
    obstacles?: boolean;
  };
}

export interface Shape {
  id: string;
  name?: string;
  vertices: BasePoint[];
  color: string;
  fillColor: string;
}

export type TimelineEventType = "travel" | "wait";

export interface TimelineEvent {
  type: TimelineEventType;
  duration: number;
  startTime: number;
  endTime: number;
  name?: string;
  waitPosition?: "before" | "after";
  lineId?: string; // for travel
  startHeading?: number;
  targetHeading?: number;
  atPoint?: BasePoint;
}

export interface TimePrediction {
  totalTime: number;
  segmentTimes: number[];
  totalDistance: number;
  timeline: TimelineEvent[];
}

export interface DirectorySettings {
  autoPathsDirectory: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
  error?: string;
}
