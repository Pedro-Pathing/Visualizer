import type { Point2D, CubicBezierCurve } from '../types/geometry';
import { ConstantHeadingDifferentialEquation } from './ConstantHeadingDifferentialEquation';
import { SolutionPoints } from './SolutionPoints';
import { CubicBezierCurveImpl } from './CubicBezierCurve.js';
import { BOBYQAOptimizer } from './BOBYQAOptimizer.js';

export class ConstantHeadingSolver {
  private vMax: number;
  private mass: number;
  private muK: number;
  private c1: number;
  private c2: number;
  private p0: Point2D;
  private p3: Point2D;
  private thetaFinal: number;
  private isBlueAlliance: boolean;
  private thetaInitial: number;
  private angularVelocity: number;
  private boundaryTolerance: number;
  private submersibleTolerance: number;
  private robotWidth: number;
  private robotHeight: number;

  constructor(
    vMax: number,
    mass: number,
    muK: number,
    c1: number,
    c2: number,
    p0: Point2D,
    p3: Point2D,
    thetaT2: number,
    boundaryTolerance: number,
    submersibleDistanceTolerance: number,
    isBlueAlliance: boolean,
    thetaInitial: number,
    angularVelocity: number,
    robotWidth: number,
    robotHeight: number
  ) {
    this.vMax = vMax;
    this.mass = mass;
    this.muK = muK;
    this.c1 = c1;
    this.c2 = c2;
    this.p0 = p0;
    this.p3 = p3;
    this.thetaFinal = thetaT2;
    this.isBlueAlliance = isBlueAlliance;
    this.thetaInitial = thetaInitial;
    this.angularVelocity = angularVelocity;
    this.boundaryTolerance = boundaryTolerance;
    this.submersibleTolerance = submersibleDistanceTolerance;
    this.robotWidth = robotWidth;
    this.robotHeight = robotHeight;
  }

  private performOptimization(): number[] {
    const initialGuess = [
      this.thetaFinal,
      this.p0.x,
      (this.p0.y + this.p3.y) / 2,
      this.p0.x,
      this.p3.y
    ];

    const lowerBounds = [
      0,
      this.boundaryTolerance + Math.min(this.robotHeight, this.robotWidth),
      this.boundaryTolerance + Math.min(this.robotHeight, this.robotWidth),
      this.boundaryTolerance + Math.min(this.robotHeight, this.robotWidth),
      this.boundaryTolerance + Math.min(this.robotHeight, this.robotWidth)
    ];

    const upperBounds = [
      Math.PI * 2,
      72 - this.boundaryTolerance - Math.min(this.robotHeight, this.robotWidth),
      144 - this.boundaryTolerance - Math.min(this.robotHeight, this.robotWidth),
      72 - this.boundaryTolerance - Math.min(this.robotHeight, this.robotWidth),
      144 - this.boundaryTolerance - Math.min(this.robotHeight, this.robotWidth)
    ];

    // Create optimizer with bounds
    const optimizer = new BOBYQAOptimizer(
      initialGuess.length * 2 + 1,
      lowerBounds,
      upperBounds
    );

    // Define objective function
    const objectiveFunction = (point: number[]): number => {
      const theta = point[0];
      const p1: Point2D = { x: point[1], y: point[2] };
      const p2: Point2D = { x: point[3], y: point[4] };
      const path = new CubicBezierCurveImpl(this.p0, p1, p2, this.p3);

      return path.intersectionWeight(
        this.isBlueAlliance,
        theta,
        this.boundaryTolerance,
        this.submersibleTolerance,
        this.robotWidth,
        this.robotHeight
      );
    };

    // Optimize
    const result = optimizer.optimize(objectiveFunction, initialGuess);
    return result.point;
  }

  private solveDifferentialEquation(theta: number, bezierCurve: CubicBezierCurve): Point2D[] {
    const diffeq = new ConstantHeadingDifferentialEquation(
      theta,
      this.vMax,
      this.mass,
      this.muK,
      this.c1,
      bezierCurve
    );

    const h = 0.005; // Step size
    const tEnd = 30.0;
    const steps = Math.ceil(tEnd / h);
    
    // Initial conditions
    let t = 0;
    let y = [this.p0.x, this.p0.y];
    const solutionPoints: Point2D[] = [{ x: y[0], y: y[1] }];

    // Gill coefficients
    const a = [0.5, 0.5, 1.0];
    const b = [0.5, 0.5, 1.0];
    const c = [0.5, (Math.sqrt(2) - 1) / 2, (2 - Math.sqrt(2)) / 2, 1/6];

    // Temporary arrays for the Gill method
    const k1 = [0, 0];
    const k2 = [0, 0];
    const k3 = [0, 0];
    const k4 = [0, 0];
    const yTemp = [0, 0];

    for (let i = 0; i < steps; i++) {
      // First step
      diffeq.computeDerivatives(t, y, k1);
      yTemp[0] = y[0] + h * c[0] * k1[0];
      yTemp[1] = y[1] + h * c[0] * k1[1];

      // Second step
      diffeq.computeDerivatives(t + a[0] * h, yTemp, k2);
      yTemp[0] = y[0] + h * (c[1] * k1[0] + c[2] * k2[0]);
      yTemp[1] = y[1] + h * (c[1] * k1[1] + c[2] * k2[1]);

      // Third step
      diffeq.computeDerivatives(t + a[1] * h, yTemp, k3);
      yTemp[0] = y[0] + h * (k1[0] - b[1] * k2[0] + b[2] * k3[0]);
      yTemp[1] = y[1] + h * (k1[1] - b[1] * k2[1] + b[2] * k3[1]);

      // Fourth step
      diffeq.computeDerivatives(t + a[2] * h, yTemp, k4);
      
      // Update solution
      y[0] += h * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6;
      y[1] += h * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
      t += h;

      solutionPoints.push({ x: y[0], y: y[1] });
    }

    // Interpolate to get exactly 1000 points
    const n = 1000;
    const result: Point2D[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const idx = (i * (solutionPoints.length - 1)) / (n - 1);
      const low = Math.floor(idx);
      const high = Math.ceil(idx);
      const frac = idx - low;
      
      result[i] = {
        x: solutionPoints[low].x * (1 - frac) + solutionPoints[high].x * frac,
        y: solutionPoints[low].y * (1 - frac) + solutionPoints[high].y * frac
      };
    }

    return result;
  }

  private findT1(velocity: Point2D[], L: number): number {
    let minDistIndex = 0;
    let dist = Math.abs(this.distance(velocity[minDistIndex], { x: 0, y: 0 }) - L);

    for (let i = 0; i < velocity.length; i++) {
      const point = velocity[i];
      const distI = Math.abs(this.distance(point, { x: 0, y: 0 }) - L);
      if (distI < dist) {
        minDistIndex = i;
        dist = distI;
      }
    }

    return (minDistIndex * 30) / 999;
  }

  private distance(p1: Point2D, p2: Point2D): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private findT2(theta: number): number {
    return (
      Math.abs(this.thetaFinal - theta) +
      Math.abs(this.thetaInitial - theta)
    ) / this.angularVelocity;
  }

  getSolution(): SolutionPoints {
    const solution = this.performOptimization();
    const theta = solution[0];
    const p1: Point2D = { x: solution[1], y: solution[2] };
    const p2: Point2D = { x: solution[3], y: solution[4] };
    const path = new CubicBezierCurveImpl(this.p0, p1, p2, this.p3);

    return new SolutionPoints(
      theta,
      path,
      this.findT1(this.solveDifferentialEquation(theta, path), path.getArcLength()),
      this.findT2(theta)
    );
  }
} 