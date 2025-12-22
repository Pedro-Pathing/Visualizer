import type { Shape } from "../types";

/**
 * Shape creation factory functions
 */

/**
 * Create a triangle shape at default position
 */
export function createTriangle(existingShapesCount: number): Shape {
  return {
    id: `triangle-${existingShapesCount + 1}`,
    name: "",
    vertices: [
      { x: 60, y: 60 },
      { x: 84, y: 60 },
      { x: 72, y: 84 },
    ],
    color: "#dc2626",
    fillColor: "#fca5a5",
  };
}

/**
 * Create a rectangle shape at default position
 */
export function createRectangle(existingShapesCount: number): Shape {
  return {
    id: `rectangle-${existingShapesCount + 1}`,
    name: `Obstacle ${existingShapesCount + 1}`,
    vertices: [
      { x: 30, y: 30 },
      { x: 60, y: 30 },
      { x: 60, y: 50 },
      { x: 30, y: 50 },
    ],
    color: "#dc2626",
    fillColor: "#fca5a5",
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
    id: `${sides}-gon-${existingShapesCount + 1}`,
    name: `Obstacle ${existingShapesCount + 1}`,
    vertices,
    color: "#dc2626",
    fillColor: "#fca5a5",
  };
}

export function createEventMarker(
  lineIndex: number,
  position: number = 0.5,
): EventMarker {
  return {
    id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: `Event_${lineIndex + 1}`,
    position: Math.max(0, Math.min(1, position)), // Clamp between 0-1
    lineIndex,
    parameters: {},
  };
}
