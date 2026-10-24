import { writable } from "svelte/store";

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
export const snapToGrid = writable(true);

// Multiple paths visualization stores
export const activePaths = writable<string[]>([]);
