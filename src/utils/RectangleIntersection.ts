import type { Point2D, Rectangle } from '../types/geometry';

export class RectangleIntersection {
  static rotatePoint(p: Point2D, pivot: Point2D, angle: number): Point2D {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const translatedX = p.x - pivot.x;
    const translatedY = p.y - pivot.y;

    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;

    return {
      x: rotatedX + pivot.x,
      y: rotatedY + pivot.y
    };
  }

  static createRotatedRectangle(center: Point2D, width: number, height: number, rotation: number): Rectangle {
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    const vertices: Point2D[] = [
      { x: center.x - halfWidth, y: center.y - halfHeight },
      { x: center.x + halfWidth, y: center.y - halfHeight },
      { x: center.x + halfWidth, y: center.y + halfHeight },
      { x: center.x - halfWidth, y: center.y + halfHeight }
    ];

    return {
      vertices: vertices.map(v => this.rotatePoint(v, center, rotation))
    };
  }

  static getMinimumSeparatingWidth(rect1: Rectangle, rect2: Rectangle): number {
    let minWidth = Number.MAX_VALUE;

    // Helper function to check edges
    const checkEdges = (rect: Rectangle, otherRect: Rectangle): number => {
      for (let i = 0; i < rect.vertices.length; i++) {
        const p1 = rect.vertices[i];
        const p2 = rect.vertices[(i + 1) % rect.vertices.length];

        const edge: Point2D = {
          x: p2.x - p1.x,
          y: p2.y - p1.y
        };
        const axis: Point2D = {
          x: -edge.y,
          y: edge.x
        };

        const rect1Projections = this.projectRectangle(rect, axis);
        const rect2Projections = this.projectRectangle(otherRect, axis);

        const overlap = this.getOverlap(rect1Projections, rect2Projections);
        if (overlap === 0) {
          return 0; // Separating rectangle exists
        }

        minWidth = Math.min(minWidth, overlap);
      }
      return minWidth;
    };

    // Check both rectangles' edges
    const width1 = checkEdges(rect1, rect2);
    if (width1 === 0) return 0;
    
    const width2 = checkEdges(rect2, rect1);
    return Math.min(width1, width2);
  }

  private static projectRectangle(rect: Rectangle, axis: Point2D): number[] {
    let min = Number.MAX_VALUE;
    let max = -Number.MAX_VALUE;
    const axisLength = Math.sqrt(axis.x * axis.x + axis.y * axis.y);

    rect.vertices.forEach(vertex => {
      const projection = (vertex.x * axis.x + vertex.y * axis.y) / axisLength;
      min = Math.min(min, projection);
      max = Math.max(max, projection);
    });

    return [min, max];
  }

  private static getOverlap(proj1: number[], proj2: number[]): number {
    const start = Math.max(proj1[0], proj2[0]);
    const end = Math.min(proj1[1], proj2[1]);
    return Math.max(0, end - start);
  }
} 