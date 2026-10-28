import { get } from "svelte/store";
import { downloadBlob } from "../utils/download";
import {
  formatGifProgressStatus,
  renderPathGif,
  resolveGifFileName,
  type GifPath,
} from "../lib/export/gifExport";
import { showToast } from "../lib/toast";
import { currentFilePath } from "../stores";
import type { Overlays } from "./overlays.svelte";
import type { Prefs } from "./prefs.svelte";
import type { ProjectStore } from "./project.svelte";

/** Progress of a GIF export, shown in a dialog while it runs. */
export class GifExport {
  running = $state(false);
  progress = $state(0);
  status = $state("Preparing...");
  #cancelled = false;

  #project: ProjectStore;
  #prefs: Prefs;
  #overlays: Overlays;

  constructor(project: ProjectStore, prefs: Prefs, overlays: Overlays) {
    this.#project = project;
    this.#prefs = prefs;
    this.#overlays = overlays;
  }

  /** What the field shows: the overlays when there are any, else the project. */
  #paths(): GifPath[] {
    if (this.#overlays.active) {
      return this.#overlays.items.map((overlay, index) => ({
        ...overlay.doc,
        settings: this.#overlays.settingsFor(overlay),
        color: overlay.color,
        opacity: Math.max(0.2, 1 - index * 0.15),
        honorLocked: false,
      }));
    }
    return [{ ...this.#project.doc, settings: this.#prefs.settings }];
  }

  async run(fieldImageSrc: string, fieldPixels: number) {
    if (this.running) return;
    this.running = true;
    this.#cancelled = false;
    this.progress = 0;
    this.status = "Capturing frames...";
    try {
      const blob = await renderPathGif({
        paths: this.#paths(),
        fieldImageSrc,
        robotImageSrc: this.#prefs.settings.robotImage || "/robot.png",
        fieldPixels,
        shouldCancel: () => this.#cancelled,
        onProgress: (progress) => {
          this.progress = progress;
          this.status = formatGifProgressStatus(progress);
        },
      });
      const name = resolveGifFileName(
        get(currentFilePath),
        this.#overlays.active,
      );
      downloadBlob(blob, `${name}.gif`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("cancelled")) {
        console.error("GIF export error:", message);
        showToast(`Failed to export GIF: ${message}`, "error");
      }
    } finally {
      this.running = false;
      this.progress = 0;
    }
  }

  cancel() {
    this.#cancelled = true;
    this.status = "Cancelling...";
  }
}
