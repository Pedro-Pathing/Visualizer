import { debounce } from "lodash";
import type { Settings } from "../types";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { robotConfigOf } from "../io";
import {
  loadSettings,
  normalizeLegacyFieldMap,
  saveSettings,
} from "../utils/settingsPersistence";
import type { ProjectStore } from "./project.svelte";

/**
 * The user's preferences. The robot settings stored with them are only the
 * starting robot for a fresh document; the open project's robot wins.
 */
export class Prefs {
  value = $state<Settings>({ ...DEFAULT_SETTINGS });
  #project: ProjectStore;

  settings: Settings = $derived.by(() => ({
    ...this.value,
    ...this.#project.doc.robot,
  }));

  constructor(project: ProjectStore) {
    this.#project = project;
    const persist = debounce(
      (settings: Settings) => saveSettings(settings),
      1000,
    );
    $effect(() => {
      persist(this.settings);
    });
    $effect(() => () => persist.flush());
  }

  async load() {
    this.value = normalizeLegacyFieldMap({ ...(await loadSettings()) });
  }

  /** The robot a document starts with when it doesn't record its own. */
  get fallbackRobot() {
    return robotConfigOf({ ...DEFAULT_SETTINGS, ...this.value });
  }
}
