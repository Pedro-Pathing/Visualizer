import { FIELD_SIZE } from "../../config";

export const PEDRO_API = {
  factoryVar: "poseFactory",

  poseFactory(mirrorHorizontally: boolean): string {
    const mirror = mirrorHorizontally ? `.mirrorX(${FIELD_SIZE / 2})` : "";
    return `PoseFactory.degrees()${mirror}`;
  },

  /** A single pose literal: `p.of(x, y, heading)`. */
  pose(x: string, y: string, headingDeg: string): string {
    return `${PEDRO_API.factoryVar}.of(${x}, ${y}, ${headingDeg})`;
  },

  paths: {
    line: (start: string, end: string) => `Paths.line(${start}, ${end})`,
    curve: (start: string, controls: string[], end: string) =>
      `Paths.curve(${[start, ...controls, end].join(", ")})`,
    through: (poses: string[]) => `Paths.through(${poses.join(", ")})`,
    group: (expressions: string[]) => `Paths.path(${expressions.join(", ")})`,
  },

  heading: {
    constant: (poseVar: string) => `.constant(${poseVar})`,
    linear: (startPoseVar: string, endPoseVar: string) =>
      `.linear(${startPoseVar}, ${endPoseVar})`,
    tangentialForward: () => ".tangent()",
    tangentialReversed: () => ".reverseTangent()",
    facingPoint: (poseVar: string) => `.facingPoint(${poseVar})`,
    piecewise: (interpolatorExpression: string) =>
      `.heading(${interpolatorExpression})`,
  },

  interpolator: {
    typeName: "Interpolator",
    importPath: "com.pedropathing.paths.interpolator.Interpolator",
    piecewise: () => "Interpolator.piecewise()",
    /** Nodes must have strictly increasing t and cover through 1.0. */
    until: (t: string, expression: string) => `.until(${t}, ${expression})`,
    constant: (poseVar: string) => `Interpolator.constant(${poseVar})`,
    linear: (startPoseVar: string, endPoseVar: string) =>
      `Interpolator.linear(${startPoseVar}, ${endPoseVar})`,
    tangent: () => "Interpolator.tangent",
    facingPoint: (poseVar: string) => `Interpolator.facingPoint(${poseVar})`,
    reverse: (expression: string) => `${expression}.reverse()`,
  },

  commands: {
    follow: (followerVar: string, methodName: string) =>
      `follow(${followerVar}, ${methodName}())`,
    wait: (durationMs: number) => `waitMs(${durationMs})`,
    sequential: "sequential",
  },
} as const;
