import type { Point2D, CubicBezierCurve } from '../types/geometry';
import { CubicBezierCurveImpl } from './CubicBezierCurve.js';

export class SolutionPoints {
  private theta: number;
  private path: CubicBezierCurve;
  private T1: number;
  private T2: number;

  constructor(
    theta: number,
    pathOrP0: CubicBezierCurve | Point2D,
    P1OrT1: Point2D | number,
    P2OrT2: Point2D | number,
    P3?: Point2D,
    t1?: number,
    t2?: number
  ) {
    this.theta = theta;

    if (this.isCubicBezierCurve(pathOrP0)) {
      this.path = pathOrP0;
      this.T1 = P1OrT1 as number;
      this.T2 = P2OrT2 as number;
    } else {
      this.path = new CubicBezierCurveImpl(
        pathOrP0 as Point2D,
        P1OrT1 as Point2D,
        P2OrT2 as Point2D,
        P3!
      );
      this.T1 = t1!;
      this.T2 = t2!;
    }
  }

  private isCubicBezierCurve(obj: any): obj is CubicBezierCurve {
    return 'compute' in obj && 'computePathPrimes' in obj;
  }

  getTheta(): number {
    return this.theta;
  }

  getPath(): CubicBezierCurve {
    return this.path;
  }

  getT1(): number {
    return this.T1;
  }

  getT2(): number {
    return this.T2;
  }

  getPathFollowingTargetTime(): number {
    return this.T1 + this.T2;
  }
} 