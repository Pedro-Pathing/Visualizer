import { get } from "svelte/store";
import {
  gridSize,
  protractorLockToRobot,
  showGrid,
  showProtractor,
  showRuler,
  snapToGrid,
} from "../stores";

/** Grid spacings in inches, in the order the grid button steps through them. */
export const GRID_SIZES = [1, 3, 6, 12];

/** Step to the next grid size; after the largest, hide the grid. */
export function cycleGrid() {
  if (!get(showGrid)) {
    gridSize.set(GRID_SIZES[0]);
    showGrid.set(true);
    return;
  }
  const next = GRID_SIZES[GRID_SIZES.indexOf(get(gridSize)) + 1];
  if (next) gridSize.set(next);
  else showGrid.set(false);
}

export const toggleSnap = () => snapToGrid.update((on) => !on);
export const toggleRuler = () => showRuler.update((on) => !on);
export const toggleProtractor = () => showProtractor.update((on) => !on);
export const toggleProtractorLock = () =>
  protractorLockToRobot.update((on) => !on);
