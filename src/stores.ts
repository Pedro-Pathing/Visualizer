import { writable } from "svelte/store";

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
export const currentFilePath = writable<string | null>(null);
export const isUnsaved = writable(false);
export const snapToGrid = writable(true);

// Multiple paths visualization stores
export const activePaths = writable<string[]>([]);
export const dualPathMode = writable(false); // Deprecated - kept for backwards compatibility
export const secondFilePath = writable<string | null>(null); // Deprecated - kept for backwards compatibility
