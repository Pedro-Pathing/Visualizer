import { preserveTileCoordinates } from "../model/tileCalibration";
import { calibrateFieldShapes } from "../config/defaults";
import {
  DEFAULT_TILE_SIZE,
  inchesPerTile,
  type CoordinateSettings,
} from "../utils/coordinates";
import { getContext, setContext } from "svelte";
import type { ProjectDoc } from "../io";
import type { Command } from "../model/commands";

const HISTORY_LIMIT = 200;
/** Edits sharing a coalesce key this close together form one undo step. */
const COALESCE_MS = 1000;

/**
 * The open project. The document is never mutated: every edit replaces it,
 * so undo history is a list of earlier documents and "unsaved" is a
 * reference comparison against the last saved one.
 */
export class ProjectStore {
  doc = $state.raw<ProjectDoc>()!;
  #undo = $state.raw<ProjectDoc[]>([]);
  #redo = $state.raw<ProjectDoc[]>([]);
  #saved = $state.raw<ProjectDoc>()!;
  #transactionBase: ProjectDoc | null = null;
  #tileSize = DEFAULT_TILE_SIZE;
  #lastCoalesced: { key: string; at: number } | null = null;

  canUndo = $derived(this.#undo.length > 0);
  canRedo = $derived(this.#redo.length > 0);
  dirty = $derived(this.doc !== this.#saved);

  constructor(doc: ProjectDoc) {
    this.#tileSize = inchesPerTile(doc.coordinates ?? {});
    this.doc = this.#calibrated(doc);
    this.#saved = this.doc;
  }

  /**
   * Apply an edit as one undo step. Edits passing the same `coalesce` key in
   * quick succession merge, so typing a value is a single step.
   */
  apply(command: Command, options: { coalesce?: string } = {}) {
    if (this.#transactionBase) {
      this.preview(command);
      return;
    }
    const next = this.#calibrated(command(this.doc));
    if (next === this.doc) return;

    const now = Date.now();
    const merges =
      options.coalesce !== undefined &&
      this.#lastCoalesced?.key === options.coalesce &&
      now - this.#lastCoalesced.at < COALESCE_MS;
    if (!merges) this.#record(this.doc);
    this.#lastCoalesced =
      options.coalesce === undefined
        ? null
        : { key: options.coalesce, at: now };
    this.doc = next;
  }

  /** Show an edit without recording it; `commit` records everything since as one step. */
  preview(command: Command) {
    this.#transactionBase ??= this.doc;
    this.doc = this.#calibrated(command(this.doc));
  }

  commit() {
    const base = this.#transactionBase;
    this.#transactionBase = null;
    this.#lastCoalesced = null;
    if (base && base !== this.doc) this.#record(base);
  }

  cancel() {
    if (this.#transactionBase)
      this.doc = this.#calibrated(this.#transactionBase);
    this.#transactionBase = null;
  }

  undo() {
    this.commit();
    const previous = this.#undo.at(-1);
    if (!previous) return;
    this.#undo = this.#undo.slice(0, -1);
    this.#redo = [...this.#redo, this.doc];
    this.doc = this.#calibrated(previous);
  }

  redo() {
    this.commit();
    const next = this.#redo.at(-1);
    if (!next) return;
    this.#redo = this.#redo.slice(0, -1);
    this.#undo = [...this.#undo, this.doc];
    this.doc = this.#calibrated(next);
  }

  /** Open a different document. History starts over. */
  load(doc: ProjectDoc, options: { saved?: boolean } = {}) {
    this.#transactionBase = null;
    this.#lastCoalesced = null;
    this.#undo = [];
    this.#redo = [];
    if (doc.coordinates) this.#tileSize = inchesPerTile(doc.coordinates);
    this.doc = this.#calibrated(doc);
    if (options.saved ?? true) this.#saved = this.doc;
  }

  /** A display calibration follows built-ins, without moving paths or custom obstacles. */
  calibrateField(settings: CoordinateSettings) {
    this.#tileSize = inchesPerTile(settings);
    this.doc = this.#calibrated(this.doc);
  }

  /** Settings calibration is not a path edit; keep undo/redo in the new units too. */
  changeTileSize(before: CoordinateSettings, tileSize: number) {
    const after = { ...before, tileSize };
    if (inchesPerTile(before) === inchesPerTile(after)) return;
    this.commit();
    this.#tileSize = inchesPerTile(after);
    if (before.distanceUnit === "tiles") {
      const transform = (doc: ProjectDoc) =>
        this.#calibrated(preserveTileCoordinates(doc, before, after));
      this.#undo = this.#undo.map(transform);
      this.#redo = this.#redo.map(transform);
      this.doc = transform(this.doc);
    } else {
      this.doc = this.#calibrated(this.doc);
    }
    this.#lastCoalesced = null;
  }

  #calibrated(doc: ProjectDoc): ProjectDoc {
    const shapes = calibrateFieldShapes(doc.shapes, {
      tileSize: this.#tileSize,
    });
    return shapes === doc.shapes ? doc : { ...doc, shapes };
  }

  markSaved() {
    this.#saved = this.doc;
  }

  #record(doc: ProjectDoc) {
    this.#undo = [...this.#undo, doc].slice(-HISTORY_LIMIT);
    this.#redo = [];
  }
}

const CONTEXT_KEY = Symbol("project");

export function provideProject(project: ProjectStore) {
  setContext(CONTEXT_KEY, project);
}

export function useProject(): ProjectStore {
  return getContext<ProjectStore>(CONTEXT_KEY);
}
