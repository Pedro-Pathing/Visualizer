import { debounce } from "lodash";
import type { BasePoint, Settings } from "../types";
import { parseProject, serializeProject, type ProjectDoc } from "../io";
import { updatePoint, type PointAddress } from "../model/commands";
import { activePaths } from "../stores";
import * as browserFileStore from "../utils/browserFileStore";
import type { ProjectStore } from "./project.svelte";

/** Up to this many saved files can be shown at once. */
const MAX_OVERLAYS = 4;
const OVERLAY_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A"];

export interface Overlay {
  filePath: string;
  doc: ProjectDoc;
  color: string;
}

/**
 * Other saved files shown on the field alongside the open project, each with
 * its own robot. Their points can be dragged; edits save back to their files.
 */
export class Overlays {
  items = $state.raw<Overlay[]>([]);
  active = $derived(this.items.length > 0);

  #project: ProjectStore;
  #getSettings: () => Settings;
  // Debounced writers, not state; nothing renders from this.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  #pendingSaves = new Map<number, ReturnType<typeof debounce>>();

  constructor(project: ProjectStore, getSettings: () => Settings) {
    this.#project = project;
    this.#getSettings = getSettings;
    $effect(() => activePaths.subscribe((paths) => void this.load(paths)));
  }

  /** The current settings with an overlay's own robot applied. */
  settingsFor(overlay: Overlay): Settings {
    return { ...this.#getSettings(), ...overlay.doc.robot };
  }

  async load(filePaths: string[]) {
    const loaded: Overlay[] = [];
    for (const [index, filePath] of filePaths
      .slice(0, MAX_OVERLAYS)
      .entries()) {
      try {
        const text = await browserFileStore.readFile(filePath);
        const result = parseProject(text, this.#project.doc.robot);
        if (result.ok) {
          loaded.push({
            filePath,
            doc: result.doc,
            color: OVERLAY_COLORS[index],
          });
        }
      } catch (error) {
        console.error(`Failed to load overlay ${filePath}:`, error);
      }
    }
    this.items = loaded;
  }

  movePoint(index: number, address: PointAddress, point: BasePoint) {
    const overlay = this.items[index];
    if (!overlay) return;
    const doc = updatePoint(address, point)(overlay.doc);
    this.items = this.items.map((item, i) =>
      i === index ? { ...item, doc } : item,
    );
    this.#saveSoon(index);
  }

  async saveAll() {
    for (const overlay of this.items) await this.#write(overlay);
  }

  #saveSoon(index: number) {
    let save = this.#pendingSaves.get(index);
    if (!save) {
      save = debounce(() => {
        const overlay = this.items[index];
        if (overlay) void this.#write(overlay);
      }, 400);
      this.#pendingSaves.set(index, save);
    }
    save();
  }

  async #write(overlay: Overlay) {
    try {
      await browserFileStore.writeFile(
        overlay.filePath,
        serializeProject(overlay.doc),
      );
    } catch (error) {
      console.error(`Failed to save overlay ${overlay.filePath}:`, error);
    }
  }
}
