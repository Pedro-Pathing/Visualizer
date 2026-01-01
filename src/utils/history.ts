import type { Point, Line, Shape, SequenceItem, Settings } from "../types";
import { writable } from "svelte/store";

export type AppState = {
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
  sequence: SequenceItem[];
  settings: Settings;
};

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function createHistory(maxSize = 200) {
  let undoStack: AppState[] = [];
  let redoStack: AppState[] = [];
  let lastHash = "";

  // Create writable stores to trigger reactivity
  const canUndoStore = writable(false);
  const canRedoStore = writable(false);

  function updateStores() {
    canUndoStore.set(undoStack.length > 1);
    canRedoStore.set(redoStack.length > 0);
  }

  function hash(state: AppState): string {
    // Stable hash via JSON string; sufficient for change detection here
    return JSON.stringify(state);
  }

  function record(state: AppState) {
    const snapshot = deepClone(state);
    const currentHash = hash(snapshot);
    if (currentHash === lastHash) {
      // No meaningful change
      return;
    }
    undoStack.push(snapshot);
    lastHash = currentHash;
    // Cap stack size
    if (undoStack.length > maxSize) {
      undoStack.shift();
    }
    // Clear redo on new action
    redoStack = [];
    updateStores();
  }

  function canUndo() {
    return undoStack.length > 1; // keep initial state; require at least one prior state
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function undo(): AppState | null {
    if (!canUndo()) return null;
    const current = undoStack.pop()!; // current state to redo
    const prev = undoStack[undoStack.length - 1];
    redoStack.push(current);
    lastHash = hash(prev);
    updateStores();
    return deepClone(prev);
  }

  function redo(): AppState | null {
    if (!canRedo()) return null;
    const next = redoStack.pop()!;
    undoStack.push(next);
    lastHash = hash(next);
    updateStores();
    return deepClone(next);
  }

  function peek(): AppState | null {
    if (undoStack.length === 0) return null;
    return deepClone(undoStack[undoStack.length - 1]);
  }

  return {
    record,
    undo,
    redo,
    canUndo,
    canRedo,
    peek,
    canUndoStore,
    canRedoStore,
  };
}
