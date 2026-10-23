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
import { confirmDialog } from "../lib/dialog";
import { askFileName } from "../lib/files/fileNames";
import { mirrorProject } from "../model/mirror";
import { showToast } from "../lib/toast";
import { activePaths, currentFilePath } from "../stores";
import * as browserFileStore from "../utils/browserFileStore";
import {
  OPENABLE_EXTENSIONS,
  PROJECT_EXTENSION,
  basename,
  pathStem,
} from "../utils/filename";
import type { Overlays } from "./overlays.svelte";
import type { Prefs } from "./prefs.svelte";
import type { ProjectStore } from "./project.svelte";

/** Opening, saving and renaming the project, and recovering the last session. */
export class ProjectFiles {
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
  async newProject() {
    if (
      this.#project.dirty &&
      !(await confirmDialog({
        title: "Start a new project?",
        message: "Your unsaved changes will be lost.",
        confirmLabel: "Discard changes",
        danger: true,
      }))
    ) {
      return;
    }
    this.open(
      createDefaultProject(
        this.#project.doc.robot,
        this.#prefs.settings.fieldMap,
      ),
    );
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

  /** Save into app storage under the open file's name, asking for one if it has none. */
  async save() {
    const name =
      get(currentFilePath) ??
      (await askFileName({
        title: "Save project",
        value: "my_path",
        confirmLabel: "Save",
      }));
    if (!name) return;
    try {
      await this.#overlays.saveAll();
      await browserFileStore.writeFile(name, serializeProject(this.current()));
      currentFilePath.set(name);
      this.#project.markSaved();
      showToast(`Saved ${name}`, "success");
    } catch (error) {
      console.error("Failed to save project to storage:", error);
      showToast("Couldn't save the project in the app.", "error");
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
            basename(get(currentFilePath)) || `path${PROJECT_EXTENSION}`,
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

    const newName = await askFileName({
      title: "Rename project",
      value: pathStem(currentPath),
      confirmLabel: "Rename",
    });
    if (!newName || newName === currentPath) return;

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
      showToast(`Renamed to: ${newName}`, "success");
    } catch (error) {
      console.error("Failed to rename path file:", error);
      showToast("Failed to rename the path file.", "error");
    }
  }

  /** Save a copy mirrored across the field's center line as a new file, and open it. */
  async duplicateMirrored() {
    const name = await askFileName({
      title: "Duplicate mirrored",
      value: `${pathStem(get(currentFilePath)) || "path"}_mirrored`,
      confirmLabel: "Create",
    });
    if (!name) return;
    try {
      if (
        (await browserFileStore.fileExists(name)) &&
        !(await confirmDialog({
          title: `Overwrite ${name}?`,
          message: "A file with this name already exists.",
          confirmLabel: "Overwrite",
          danger: true,
        }))
      ) {
        return;
      }
      const mirrored = mirrorProject(this.current());
      await browserFileStore.writeFile(name, serializeProject(mirrored));
      this.open(mirrored);
      currentFilePath.set(name);
      showToast(`Created ${name}`, "success");
    } catch (error) {
      console.error("Failed to save the mirrored project:", error);
      showToast("Couldn't save the mirrored project.", "error");
    }
  }

  /** Ask for a project file on disk and open it. */
  openFromDisk() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = OPENABLE_EXTENSIONS.join(",");
    input.onchange = () => void this.upload(input);
    input.click();
  }

  /** Open a file chosen from disk and keep a copy in app storage. */
  async upload(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!OPENABLE_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      showToast(`Please select a ${PROJECT_EXTENSION} file`, "error");
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
