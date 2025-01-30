export interface Point2D {
  x: number;
  y: number;
}

export interface Rectangle {
  vertices: Point2D[];
}

export interface CubicBezierCurve {
  compute(t: number): Point2D;
  computePathPrimes(t: number): Point2D;
  getArcLength(): number;
  pathInversion(point: Point2D): number;
  getP0(): Point2D;
  getP1(): Point2D;
  getP2(): Point2D;
  getP3(): Point2D;
}

export interface SolutionPoints {
  theta: number;
  path: CubicBezierCurve;
  T1: number;
  T2: number;
  getPathFollowingTargetTime: () => number;
} 