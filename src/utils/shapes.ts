import type { Shape } from "../types";
import { RED_ALLIANCE_COLORS } from "../config/defaults";
import { makeShapeId } from "./ids";

/**
 * Shape creation factory functions
 */

/**
 * Create a triangle shape at default position
 */
export function createTriangle(): Shape {
  return {
    id: makeShapeId(),
    name: "",
    vertices: [
      { x: 60, y: 60 },
      { x: 84, y: 60 },
      { x: 72, y: 84 },
    ],
    ...RED_ALLIANCE_COLORS,
  };
}

/**
 * Create a rectangle shape at default position
 */
export function createRectangle(existingShapesCount: number): Shape {
  return {
    id: makeShapeId(),
    name: `Obstacle ${existingShapesCount + 1}`,
    vertices: [
      { x: 30, y: 30 },
      { x: 60, y: 30 },
      { x: 60, y: 50 },
      { x: 30, y: 50 },
    ],
    ...RED_ALLIANCE_COLORS,
  };
}

/**
 * Create an N-sided regular polygon (n-gon) shape
 */
export function createNGon(sides: number, existingShapesCount: number): Shape {
  const centerX = 45;
  const centerY = 45;
  const radius = 15;
  const vertices = [];

  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides;
    vertices.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }

  return {
    id: makeShapeId(),
    name: `Obstacle ${existingShapesCount + 1}`,
    vertices,
    ...RED_ALLIANCE_COLORS,
  };
}

// createEventMarker function removed
