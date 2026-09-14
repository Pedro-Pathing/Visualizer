export const PEDRO_API = {
  factoryVar: "poseFactory",

  poseFactory: () => "PoseFactory.degrees()",

  /**
   * In released Pedro, PoseFactory.mirrorX and mirrorY carry the wrong heading
   * rule: mirrorX negates the heading where a reflection about a vertical line
   * calls for PI - heading, and mirrorY leaves the heading alone. These
   * general-purpose maps express the reflection correctly.
   */
  mapX: (lambda: string) => `.mapX(${lambda})`,
  mapY: (lambda: string) => `.mapY(${lambda})`,
  /** In released Pedro this takes radians, whatever unit the factory uses. */
  mapHeading: (lambda: string) => `.mapHeading(${lambda})`,

  /** A single pose literal: `p.of(x, y, heading)`. */
  pose(x: string, y: string, headingDeg: string): string {
    return `${PEDRO_API.factoryVar}.of(${x}, ${y}, ${headingDeg})`;
  },

  paths: {
    line: (start: string, end: string) => `line(${start}, ${end})`,
    curve: (start: string, controls: string[], end: string) =>
      `curve(${[start, ...controls, end].join(", ")})`,
    group: (expressions: string[]) => `path(${expressions.join(", ")})`,
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
