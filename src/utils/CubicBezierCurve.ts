import type { Point2D, CubicBezierCurve } from '../types/geometry';
import { RectangleIntersection } from './RectangleIntersection';

export class CubicBezierCurveImpl implements CubicBezierCurve {
  private P0: Point2D;
  private P1: Point2D;
  private P2: Point2D;
  private P3: Point2D;
  private pathX: number[];
  private pathY: number[];
  private arcLength: number = -1;

  constructor(P0: Point2D, P1: Point2D, P2: Point2D, P3: Point2D) {
    this.P0 = P0;
    this.P1 = P1;
    this.P2 = P2;
    this.P3 = P3;

    const cubeTermX = P3.x - 3 * P2.x + 3 * P1.x - P0.x;
    const cubeTermY = P3.y - 3 * P2.y + 3 * P1.y - P0.y;
    const squareTermX = 3 * P2.x - 6 * P1.x + 3 * P0.x;
    const squareTermY = 3 * P2.y - 6 * P1.y + 3 * P0.y;
    const proportionalTermX = 3 * P1.x - 3 * P0.x;
    const proportionalTermY = 3 * P1.y - 3 * P0.y;
    const constantTermX = P0.x;
    const constantTermY = P0.y;

    this.pathX = [cubeTermX, squareTermX, proportionalTermX, constantTermX];
    this.pathY = [cubeTermY, squareTermY, proportionalTermY, constantTermY];
  }

  compute(t: number): Point2D {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;

    return {
      x: mt3 * this.P0.x + 3 * mt2 * t * this.P1.x + 3 * mt * t2 * this.P2.x + t3 * this.P3.x,
      y: mt3 * this.P0.y + 3 * mt2 * t * this.P1.y + 3 * mt * t2 * this.P2.y + t3 * this.P3.y
    };
  }

  computePathPrimes(t: number): Point2D {
    return {
      x: this.evaluatePolynomialDerivative(this.pathX, t),
      y: this.evaluatePolynomialDerivative(this.pathY, t)
    };
  }

  theta(t: number): number {
    const nabla = this.computePathPrimes(t);
    return Math.atan2(nabla.y, nabla.x);
  }

  pathInversion(point: Point2D): number {
    // Simple approximation - in practice you'd want a more sophisticated root finding algorithm
    let bestT = 0.5;
    let bestDistance = Number.MAX_VALUE;
    
    for (let t = 0; t <= 1; t += 0.01) {
      const computed = this.compute(t);
      const distance = Math.sqrt(
        Math.pow(computed.x - point.x, 2) + 
        Math.pow(computed.y - point.y, 2)
      );
      
      if (distance < bestDistance) {
        bestDistance = distance;
        bestT = t;
      }
    }
    
    return bestT;
  }

  getArcLength(): number {
    if (this.arcLength === -1) {
      // Simple approximation - can be improved if needed
      const steps = 100;
      let length = 0;
      let prevPoint = this.compute(0);

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const point = this.compute(t);
        length += Math.sqrt(
          Math.pow(point.x - prevPoint.x, 2) + 
          Math.pow(point.y - prevPoint.y, 2)
        );
        prevPoint = point;
      }
      this.arcLength = length;
    }
    return this.arcLength;
  }

  intersectionWeight(
    isBlue: boolean,
    theta: number,
    boundaryTolerance: number,
    submersibleTolerance: number,
    robotWidth: number,
    robotHeight: number
  ): number {
    let a = 0, b = 0, c = 0, d = 0, e = 0;
    
    for (let i = 0; i < 100; i++) {
      const center = this.compute(i / 100);
      a = this.collidesWithSubmersible(theta, center, submersibleTolerance, robotWidth, robotHeight);
      b = this.collidesWithAllianceBoundary(theta, center, boundaryTolerance, robotWidth, robotHeight);
      
      if (!isBlue) {
        c = this.collidesWithOuterBoundaryRed(theta, center, boundaryTolerance, robotWidth, robotHeight);
      } else {
        c = this.collidesWithOuterBoundaryBlue(theta, center, boundaryTolerance, robotWidth, robotHeight);
      }

      d = this.collidesWithLeftBoundary(theta, center, robotWidth, robotHeight, boundaryTolerance);
      e = this.collidesWithRightBoundary(theta, center, boundaryTolerance, robotWidth, robotHeight);
    }

    return 20 * (a + b + c + d + e) / 100;
  }

  private collidesWithSubmersible(
    theta: number,
    center: Point2D,
    submersibleTolerance: number,
    robotWidth: number,
    robotHeight: number
  ): number {
    const robot = RectangleIntersection.createRotatedRectangle(center, robotWidth, robotHeight, theta);
    const submersible = RectangleIntersection.createRotatedRectangle(
      { x: 72, y: 72 },
      27.5 + 2 * submersibleTolerance,
      42.75 + 2 * submersibleTolerance,
      0
    );
    return RectangleIntersection.getMinimumSeparatingWidth(robot, submersible);
  }

  private collidesWithAllianceBoundary(
    theta: number,
    center: Point2D,
    boundaryTolerance: number,
    robotWidth: number,
    robotHeight: number
  ): number {
    const robot = RectangleIntersection.createRotatedRectangle(center, robotWidth, robotHeight, theta);
    const boundary = RectangleIntersection.createRotatedRectangle(
      { x: 72, y: 72 },
      144,
      2 * boundaryTolerance,
      0
    );
    return RectangleIntersection.getMinimumSeparatingWidth(robot, boundary);
  }

  private collidesWithOuterBoundaryBlue(
    theta: number,
    center: Point2D,
    boundaryTolerance: number,
    robotWidth: number,
    robotHeight: number
  ): number {
    const robot = RectangleIntersection.createRotatedRectangle(center, robotWidth, robotHeight, theta);
    const boundary = RectangleIntersection.createRotatedRectangle(
      { x: 0, y: 72 },
      144,
      boundaryTolerance,
      0
    );
    return RectangleIntersection.getMinimumSeparatingWidth(robot, boundary);
  }

  private collidesWithOuterBoundaryRed(
    theta: number,
    center: Point2D,
    boundaryTolerance: number,
    robotWidth: number,
    robotHeight: number
  ): number {
    const robot = RectangleIntersection.createRotatedRectangle(center, robotWidth, robotHeight, theta);
    const boundary = RectangleIntersection.createRotatedRectangle(
      { x: 144, y: 72 },
      144,
      boundaryTolerance,
      0
    );
    return RectangleIntersection.getMinimumSeparatingWidth(robot, boundary);
  }

  private collidesWithRightBoundary(
    theta: number,
    center: Point2D,
    boundaryTolerance: number,
    robotWidth: number,
    robotHeight: number
  ): number {
    const robot = RectangleIntersection.createRotatedRectangle(center, robotWidth, robotHeight, theta);
    const boundary = RectangleIntersection.createRotatedRectangle(
      { x: 72, y: 144 },
      boundaryTolerance,
      144,
      0
    );
    return RectangleIntersection.getMinimumSeparatingWidth(robot, boundary);
  }

  private collidesWithLeftBoundary(
    theta: number,
    center: Point2D,
    robotWidth: number,
    robotHeight: number,
    boundaryTolerance: number
  ): number {
    const robot = RectangleIntersection.createRotatedRectangle(center, robotWidth, robotHeight, theta);
    const boundary = RectangleIntersection.createRotatedRectangle(
      { x: 72, y: 0 },
      boundaryTolerance,
      144,
      0
    );
    return RectangleIntersection.getMinimumSeparatingWidth(robot, boundary);
  }

  private evaluatePolynomial(coefficients: number[], t: number): number {
    let result = 0;
    for (let i = 0; i < coefficients.length; i++) {
      result += coefficients[i] * Math.pow(t, coefficients.length - 1 - i);
    }
    return result;
  }

  private evaluatePolynomialDerivative(coefficients: number[], t: number): number {
    let result = 0;
    for (let i = 0; i < coefficients.length - 1; i++) {
      result += (coefficients.length - 1 - i) * 
                coefficients[i] * 
                Math.pow(t, coefficients.length - 2 - i);
    }
    return result;
  }

  getP0(): Point2D { return this.P0; }
  getP1(): Point2D { return this.P1; }
  getP2(): Point2D { return this.P2; }
  getP3(): Point2D { return this.P3; }

  exportAsLine(degrees: number, color: string): Line {
    return {
      endPoint: { x: this.P3.x, y: this.P3.y, heading: "constant", degrees: degrees },
      controlPoints: [this.P1, this.P2],
      color: color
    };
  }
}

