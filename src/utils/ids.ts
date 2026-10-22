function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A unique, opaque id for a path.
 */
export function makePathId(): string {
  return `line-${uniqueSuffix()}`;
}

/** A unique id for an obstacle; edits address its vertices by it. */
export function makeShapeId(): string {
  return `shape-${uniqueSuffix()}`;
}
