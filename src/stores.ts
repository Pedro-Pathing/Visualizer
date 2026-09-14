import { writable } from "svelte/store";
import { DEFAULT_SETTINGS } from "./config/defaults";
import { frameForSettings, type Frame } from "./utils/frame";

/**
 * The frame the UI displays coordinates in and that saved documents are
 * written in. Mirrors the origin/axes settings; in-memory coordinates stay
 * canonical regardless.
 */
export const fieldFrame = writable<Frame>(frameForSettings(DEFAULT_SETTINGS));

// Math tools stores
export const showRuler = writable(false);
export const showProtractor = writable(false);
export const showGrid = writable(false);
export const protractorLockToRobot = writable(true);
function createGridSizeStore() {
  const { subscribe, set, update } = writable(12);

  return {
    subscribe,
    set: (value: number) => {
      const n = Number(value) || 0;
      const clamped = Math.max(0, Math.min(12, n));
      set(clamped);
    },
    update: (fn: (v: number) => number) =>
      update((curr) => {
        const next = fn(curr);
        const n = Number(next) || 0;
        return Math.max(0, Math.min(12, n));
      }),
  };
}

export const gridSize = createGridSizeStore();
export const currentFilePath = writable<string | null>(null);
export const isUnsaved = writable(false);
export const snapToGrid = writable(true);

// Multiple paths visualization stores
export const activePaths = writable<string[]>([]);
export const dualPathMode = writable(false); // Deprecated - kept for backwards compatibility
export const secondFilePath = writable<string | null>(null); // Deprecated - kept for backwards compatibility
