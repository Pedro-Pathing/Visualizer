export type ThemeChoice = "light" | "dark" | "system";

/** The same key the other Pedro web apps store their theme under. */
const STORAGE_KEY = "theme";
const THEME_COLORS = { light: "#fafafa", dark: "#0f0f14" };

function storedChoice(): ThemeChoice {
  try {
    // AutoTune stores the value JSON-encoded; next-themes stores it bare.
    const value = localStorage.getItem(STORAGE_KEY)?.replaceAll('"', "");
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch {
    // Storage can be unavailable; fall through to the default.
  }
  return "dark";
}

/** Light, dark or follow the system, applied to the page and remembered. */
export class Theme {
  choice = $state<ThemeChoice>(storedChoice());
  #systemDark = $state(false);
  resolved = $derived(
    this.choice === "system"
      ? this.#systemDark
        ? "dark"
        : "light"
      : this.choice,
  );

  constructor() {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    this.#systemDark = query.matches;
    $effect(() => {
      const onChange = (event: MediaQueryListEvent) =>
        (this.#systemDark = event.matches);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    });

    $effect(() => {
      document.documentElement.classList.toggle(
        "dark",
        this.resolved === "dark",
      );
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", THEME_COLORS[this.resolved]);
      try {
        localStorage.setItem(STORAGE_KEY, this.choice);
      } catch {
        // Not remembering the choice is harmless.
      }
    });
  }
}
