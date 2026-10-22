import { fromStore, get } from "svelte/store";
import { debounce } from "lodash";
import {
  createDefaultProject,
  parseProject,
  serializeProject,
  type ProjectDoc,
} from "../io";
import {
  canPickExistingFile,
  canPickSaveFile,
  isPickerCancel,
  overwritePickedFile,
  saveToPickedFile,
} from "../lib/files/localFiles";
import {
  loadSessionSnapshot,
  saveSessionSnapshot,
} from "../lib/session/sessionSnapshot";
import { showToast } from "../lib/toast";
import { activePaths, currentFilePath } from "../stores";
import * as browserFileStore from "../utils/browserFileStore";
import { basename, pathStem } from "../utils/filename";
import type { Overlays } from "./overlays.svelte";
import type { Prefs } from "./prefs.svelte";
import type { ProjectStore } from "./project.svelte";

const FILE_NAME_PATTERN = /^[a-zA-Z0-9_\-. ]+\.pp$/;

const withExtension = (name: string) =>
  name.endsWith(".pp") ? name : `${name}.pp`;

/** Opening, saving and renaming the project, and recovering the last session. */
export class ProjectFiles {
  showSaveDialog = $state(false);
  isSaving = $state(false);

  #filePath = fromStore(currentFilePath);
  #activePaths = fromStore(activePaths);
  /** False until startup has had the chance to restore the last session. */
  #started = $state(false);
  #project: ProjectStore;
  #prefs: Prefs;
  #overlays: Overlays;

  constructor(project: ProjectStore, prefs: Prefs, overlays: Overlays) {
    this.#project = project;
    this.#prefs = prefs;
    this.#overlays = overlays;
  }

  /** The open project as it would be saved, including which overlays are shown. */
  current(): ProjectDoc {
    return { ...this.#project.doc, activePaths: this.#activePaths.current };
  }

  /** Open a document, starting a fresh undo history. */
  open(doc: ProjectDoc, options: { saved?: boolean } = {}) {
    this.#project.load(doc, options);
    activePaths.set(doc.activePaths);
  }

  /** Start a default project with the current robot, once confirmed. */
  newProject() {
    if (
      this.#project.dirty &&
      !confirm("Start a new project? Your unsaved changes will be lost.")
    ) {
      return;
    }
    this.open(createDefaultProject(this.#project.doc.robot));
    currentFilePath.set(null);
  }

  /** Parse a project file, reporting a failure or any warnings. */
  read(text: string): ProjectDoc | null {
    const result = parseProject(text, this.#project.doc.robot);
    if (!result.ok) {
      showToast(result.error, "error");
      return null;
    }
    result.warnings.forEach((warning) => showToast(warning, "warning"));
    return result.doc;
  }

  /** Save into app storage under the current name, or a new one. */
  async save() {
    try {
      await this.#overlays.saveAll();
      const name = get(currentFilePath) ?? `path_${Date.now()}.pp`;
      await browserFileStore.writeFile(name, serializeProject(this.current()));
      currentFilePath.set(name);
      this.#project.markSaved();
      showToast(`Saved ${name}`, "success");
    } catch (error) {
      console.error("Failed to save project to storage:", error);
      showToast("Couldn't save the project in the app.", "error");
    }
  }

  /** Save into app storage under `name`, from the save dialog. */
  async saveNamed(name: string) {
    this.isSaving = true;
    try {
      await this.#overlays.saveAll();
      const fileName = withExtension(name);
      await browserFileStore.writeFile(
        fileName,
        serializeProject(this.current()),
      );
      currentFilePath.set(fileName);
      this.#project.markSaved();
      this.showSaveDialog = false;
    } catch (error) {
      console.error("Save failed:", error);
      showToast(
        `Failed to save file: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      this.isSaving = false;
    }
  }

  /** Save to a file on disk through the browser's file picker. */
  async saveAs() {
    await this.#overlays.saveAll();
    const content = serializeProject(this.current(), { pretty: true });

    if (!canPickSaveFile() && !canPickExistingFile()) {
      // Browsers without file pickers (e.g. Firefox) save into app storage.
      await this.save();
      showToast(
        "This browser can't save to your computer directly, so the project was saved in the app. Download it from the file manager.",
        "info",
      );
      return;
    }

    try {
      const name = canPickSaveFile()
        ? await saveToPickedFile(
            content,
            basename(get(currentFilePath)) || "path.pp",
          )
        : await overwritePickedFile(content);
      currentFilePath.set(name);
      this.#project.markSaved();
      showToast(`Saved to ${name}`, "success");
    } catch (error) {
      if (isPickerCancel(error)) return;
      console.error("Save As failed:", error);
      showToast("Couldn't save to that file.", "error");
    }
  }

  async rename() {
    const currentPath = get(currentFilePath);
    if (!currentPath) return;

    const requested = window.prompt("Rename path file", pathStem(currentPath));
    if (!requested?.trim()) return;
    const newName = withExtension(requested.trim());
    if (!FILE_NAME_PATTERN.test(newName)) {
      showToast(
        "Invalid file name. Use only letters, numbers, underscores, dashes, and spaces.",
        "error",
      );
      return;
    }
    if (newName === currentPath) return;

    try {
      if (await browserFileStore.fileExists(newName)) {
        showToast(`A file named "${newName}" already exists.`, "error");
        return;
      }
      await browserFileStore.writeFile(
        newName,
        serializeProject(this.current()),
      );
      await browserFileStore.deleteFile(currentPath);
      currentFilePath.set(newName);
      this.#project.markSaved();
      window.dispatchEvent(
        new CustomEvent("fileRenamed", {
          detail: { oldPath: currentPath, newPath: newName },
        }),
      );
      showToast(`Renamed to: ${newName}`, "success");
    } catch (error) {
      console.error("Failed to rename path file:", error);
      showToast("Failed to rename the path file.", "error");
    }
  }

  /** Ask for a project file on disk and open it. */
  openFromDisk() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pp,.json";
    input.onchange = () => void this.upload(input);
    input.click();
  }

  /** Open a file chosen from disk and keep a copy in app storage. */
  async upload(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".pp") && !lowerName.endsWith(".json")) {
      showToast("Please select a .pp or .json file", "error");
      return;
    }

    const doc = this.read(await file.text());
    if (!doc) return;
    this.open(doc);
    try {
      await browserFileStore.writeFile(file.name, serializeProject(doc));
      currentFilePath.set(file.name);
    } catch (error) {
      console.warn("Failed to cache uploaded file to store:", error);
    }
  }

  /**
   * Reopen the last session if one was left unsaved; otherwise start the fresh
   * document from the robot the user last configured. Autosave starts after.
   */
  start() {
    const snapshot = loadSessionSnapshot();
    if (snapshot) {
      this.#prefs.value = snapshot.settings;
      this.open(snapshot.project, { saved: false });
      currentFilePath.set(snapshot.currentFilePath);
    } else {
      this.#project.load({
        ...this.#project.doc,
        robot: this.#prefs.fallbackRobot,
      });
    }
    this.#started = true;
  }

  /** Keep the session snapshot current. Call during component setup. */
  autosaveSession() {
    const save = debounce(saveSessionSnapshot, 750);
    $effect(() => {
      if (!this.#started) return;
      save({
        project: this.current(),
        settings: this.#prefs.settings,
        currentFilePath: this.#filePath.current,
      });
    });
    $effect(() => () => save.flush());
  }
}
