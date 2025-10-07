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
