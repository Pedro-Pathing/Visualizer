import type { Point2D, CubicBezierCurve } from '../types/geometry';

export class ConstantHeadingDifferentialEquation {
  private theta: number;
  private vMax: number;
  private mass: number;
  private muK: number;
  private c1: number;
  private path: CubicBezierCurve;

  constructor(
    theta: number,
    vMax: number,
    mass: number,
    muK: number,
    c1: number,
    path: CubicBezierCurve
  ) {
    this.theta = theta;
    this.vMax = vMax;
    this.mass = mass;
    this.muK = muK;
    this.c1 = c1;
    this.path = path;
  }

  getDimension(): number {
    return 2;
  }

  computeDerivatives(v: number, state: number[], derivatives: number[]): void {
    const point: Point2D = { x: state[0], y: state[1] };
    const t = this.path.pathInversion(point);
    const pathPrime = this.path.computePathPrimes(t);

    // Create vector operations
    const pathPrimeNorm = Math.sqrt(pathPrime.x * pathPrime.x + pathPrime.y * pathPrime.y);
    const dotProduct = 
      pathPrime.x * Math.cos(this.theta) + 
      pathPrime.y * Math.sin(this.theta);

    const pathAngle = Math.atan2(pathPrime.y, pathPrime.x);
    const scalar = (
      dotProduct * this.vMax - 
      pathPrimeNorm * (
        (this.muK * this.mass) + 
        this.c1 * Math.abs(Math.sin(this.theta - pathAngle))
      )
    ) / (pathPrimeNorm * pathPrimeNorm);

    derivatives[0] = scalar * pathPrime.x;
    derivatives[1] = scalar * pathPrime.y;
  }
} 