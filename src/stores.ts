import { writable } from "svelte/store";

// Show/hide robot collision overlays (pink/blue lines)
// Keep legacy flag off by default so new, separate toggles control visibility.
export const showRobotCollisionOverlays = writable(false);
// Show/hide live robot coordinates (disabled by default as requested)
export const showRobotLiveCoordinates = writable(false);
// Show/hide origin -> corner (pink) lines (disabled by default)
export const showRobotOriginToCornerLines = writable(false);
// Show/hide collider edges (lines between corners) (enabled by default)
export const showRobotColliderEdges = writable(true);
export const showAllCollisions = writable(false);
export const colliderTrailColorMode = writable<'same' | 'different'>('different');

// Collision color settings
export const collisionBoxColor = writable('#00ffff'); // color used for collider edges/boxes
export const robotCollisionColor = writable('#ff00ff'); // color used for robot-origin overlays (lines/dot)

function createDarkModeStore() {
  const { set, subscribe, update } = writable<"light" | "dark">("dark");

  return {
    set,
    subscribe,
    toggle: () => {
      update((_) => (_ === "dark" ? "light" : "dark"));
    },
  };
}

export const darkMode = createDarkModeStore();

// Math tools stores
export const showRuler = writable(false);
export const showProtractor = writable(false);
export const showGrid = writable(false);
export const protractorLockToRobot = writable(true);
export const gridSize = writable(12);

// Path editing tools
export const clickToPlaceMode = writable(false);
export const centerLineWarningEnabled = writable(true);
export const showCollisionPath = writable(false);
export const collisionNextSegmentOnly = writable(false);

// Collision sample rate (number of samples per segment)
// Collision sampling - fixed in code for now

// Show small corner dots for debugging miscalculations
export const showCornerDots = writable(true);
