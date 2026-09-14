import type { Frame } from "../../utils/frame";

export type ExportMode = "full" | "class" | "coordinates";

export interface ExportOptions {
  mirrorHorizontally: boolean;
  className: string;
  packageName: string;
  frame: Frame;
}

export interface PoseDecl {
  varName: string;
  x: number;
  y: number;
  headingDeg: number;
}

export type InterpolatorRef =
  | { kind: "constant"; poseVar: string }
  | { kind: "linear"; startPoseVar: string; endPoseVar: string }
  | { kind: "tangent" }
  | { kind: "facingPoint"; poseVar: string };

export interface PiecewiseNode {
  untilT: number;
  interpolator: InterpolatorRef;
  reversed: boolean;
}

export type HeadingCall =
  | { kind: "tangential"; reversed: boolean }
  | { kind: "constant"; poseVar: string }
  | { kind: "linear"; startPoseVar: string; endPoseVar: string }
  | { kind: "facingPoint"; poseVar: string }
  | { kind: "piecewise"; nodes: PiecewiseNode[] }
  | { kind: "unsupported"; reason: string };

/**
 * A path expression. A group becomes Pedro's `path(...)`, which takes the
 * child paths; its heading is null unless the group overrides its children's.
 */
export type PathExpr =
  | {
      kind: "segment";
      startPoseVar: string;
      controlPoseVars: string[];
      endPoseVar: string;
      heading: HeadingCall | null;
    }
  | { kind: "group"; children: PathExpr[]; heading: HeadingCall | null };

export interface PathDecl {
  methodName: string;
  expression: PathExpr;
  note?: string;
}

export type SequenceStep =
  | { kind: "path"; methodName: string }
  | { kind: "wait"; durationMs: number }
  | { kind: "command"; expression: string };

export interface ExportModel {
  options: ExportOptions;
  startPoseVar: string;
  poses: PoseDecl[];
  paths: PathDecl[];
  sequence: SequenceStep[];
  warnings: string[];
  usesInterpolator: boolean;
}
