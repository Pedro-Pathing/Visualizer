<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import type {
    FileInfo,
    FieldPoint,
    Heading,
    Path,
    Shape,
    SequenceItem,
    StartPose,
  } from "../types";
  import * as browserFileStore from "../utils/browserFileStore";
  import {
    currentFilePath,
    isUnsaved,
    dualPathMode,
    secondFilePath,
  } from "../stores";
  import { normalizeFieldPoints } from "../utils/fieldPoints";
  import {
    normalizePaths,
    normalizeStartPose,
    deriveSequence,
  } from "../utils/normalize";
  import { newerVersionWarning, serializeProject } from "../utils/project";
  import { downloadJson } from "../utils/download";
  import { stripPpExtension } from "../utils/filename";
  import {
    FIELD_SIZE,
    getDefaultPaths,
    getDefaultShapes,
    getDefaultStartPoint,
  } from "../config";
  import { showToast } from "./toast";
  import NameDialog from "./components/NameDialog.svelte";
  import FileListItem from "./components/FileListItem.svelte";
  import FileActionsPanel from "./components/FileActionsPanel.svelte";

  interface Props {
    isOpen?: boolean;
    startPoint: StartPose;
    lines: Path[];
    shapes: Shape[];
    sequence: SequenceItem[];
    secondStartPoint?: StartPose | null;
    secondLines?: Path[];
    secondShapes?: Shape[];
    secondSequence?: SequenceItem[];
    fieldPoints?: FieldPoint[];
  }

  let {
    isOpen = $bindable(false),
    startPoint = $bindable(),
    lines = $bindable(),
    shapes = $bindable(),
    sequence = $bindable(),
    secondStartPoint = $bindable(null),
    secondLines = $bindable([]),
    secondShapes = $bindable([]),
    secondSequence = $bindable([]),
    fieldPoints = $bindable([]),
  }: Props = $props();

  let files: FileInfo[] = $state([]);
  let selectedFile2: FileInfo | null = $state(null);
  let loading = $state(false);
  let newFileName = $state("");
  let creatingNewFile = $state(false);
  let selectedFile: FileInfo | null = $state(null);
  let errorMessage = $state("");

  // Add renaming state
  let renamingFile: FileInfo | null = $state(null);
  let renameInputValue = $state("");

  // Add file type filtering
  const supportedFileTypes = [".pp", ".json"];

  // Name dialog state
  let nameDialogOpen = $state(false);
  let nameDialogTitle = $state("");
  let nameDialogDefault = $state("");
  let pendingMirrorData: any = null;

  // Helper to get error message from unknown error type
  function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  // Normalize lines to ensure ids and wait fields exist

  // Normalize sequence data, falling back to path-only sequence if waits are missing

  function hydrateFieldPoints(data: any): FieldPoint[] {
    return normalizeFieldPoints(data);
  }

  // Debug logging
  console.log("[FileManager] Component initialized");

  async function loadDirectory() {
    loading = true;
    errorMessage = "";
    try {
      await refreshDirectory();
    } catch (error) {
      errorMessage = `Failed to load files: ${getErrorMessage(error)}`;
    } finally {
      loading = false;
    }
  }

  async function syncActiveProjectToStorage() {
    if (!$currentFilePath) return;

    const content = serializeProject({
      startPoint,
      lines,
      shapes,
      sequence,
      fieldPoints,
    });
    await browserFileStore.writeFile($currentFilePath, content);
    isUnsaved.set(false);
  }

  function handleExternalFileRename(event: Event) {
    const { oldPath, newPath } = (
      event as CustomEvent<{ oldPath: string; newPath: string }>
    ).detail;
    if (selectedFile?.path === oldPath) {
      selectedFile = { ...selectedFile, path: newPath, name: newPath };
    }
    refreshDirectory();
  }

  async function refreshDirectory() {
    try {
      const allFiles = await browserFileStore.listFiles();

      // Filter for supported file types and add error handling
      files = allFiles
        .map((file) => {
          const fileExt = path.extname(file.name).toLowerCase();
          const isSupported = supportedFileTypes.includes(fileExt);

          return {
            name: file.name,
            path: file.path,
            size: file.size,
            modified: new Date((file as any).modified),
            error: isSupported
              ? undefined
              : `Unsupported file type: ${fileExt}`,
          } as FileInfo;
        })
        .filter((file) =>
          supportedFileTypes.includes(path.extname(file.name).toLowerCase()),
        );

      errorMessage = "";
    } catch (error) {
      errorMessage = `Error accessing files: ${getErrorMessage(error)}`;
      files = [];
    }
  }

  // NEW: Start renaming a file
  function startRename(file: FileInfo) {
    renamingFile = file;
    renameInputValue = stripPpExtension(file.name);
  }

  // NEW: Cancel renaming
  function cancelRename() {
    renamingFile = null;
    renameInputValue = "";
  }

  // NEW: Rename file
  async function renameFile() {
    if (!renamingFile) return;

    // Validate the new name
    const newName = renameInputValue.trim();
    if (!newName) {
      showToast("Please enter a file name", "warning");
      return;
    }

    const newFileName = newName.endsWith(".pp") ? newName : newName + ".pp";
    const newFilePath = newFileName;

    // Don't rename if same name
    if (newFilePath === renamingFile.path) {
      cancelRename();
      return;
    }

    // Validate file name format
    if (!/^[a-zA-Z0-9_\-. ]+\.pp$/.test(newFileName)) {
      showToast(
        "Invalid file name. Use only letters, numbers, underscores, dashes, and spaces.",
        "error",
      );
      return;
    }

    try {
      // Check if new file already exists
      const exists = await browserFileStore.fileExists(newFilePath);
      if (exists) {
        showToast(`File "${newFileName}" already exists`, "error");
        return;
      }

      // Rename the current in-memory document only after writing its latest
      // state, so switching to the renamed path cannot discard unsaved edits.
      const renamingPrimary =
        (selectedFile?.path ?? $currentFilePath) === renamingFile.path;
      const renamingSecondary = selectedFile2?.path === renamingFile.path;
      let currentContent: string | null = null;
      if (renamingPrimary || renamingSecondary) {
        currentContent = serializeProject({
          startPoint: renamingPrimary ? startPoint : secondStartPoint!,
          lines: renamingPrimary ? lines : secondLines,
          shapes: renamingPrimary ? shapes : secondShapes,
          sequence: renamingPrimary ? sequence : secondSequence,
          fieldPoints,
        });
        await browserFileStore.writeFile(renamingFile.path, currentContent);
      }

      // Perform the rename
      const result = await browserFileStore.renameFile(
        renamingFile.path,
        newFilePath,
      );

      if (result.success) {
        // Update selected file if it was the renamed one
        if (selectedFile && selectedFile.path === renamingFile.path) {
          selectedFile = {
            ...selectedFile,
            name: newFileName,
            path: newFilePath,
          };
          currentFilePath.set(newFilePath);
          isUnsaved.set(false);
        }

        if (renamingPrimary && currentContent) {
          // Ensure the destination contains the exact in-memory state even if
          // the storage provider implements rename as a copy operation.
          await browserFileStore.writeFile(newFilePath, currentContent);
          selectedFile = {
            ...(selectedFile ?? renamingFile),
            name: newFileName,
            path: newFilePath,
          };
          currentFilePath.set(newFilePath);
          isUnsaved.set(false);
        }

        if (selectedFile2 && selectedFile2.path === renamingFile.path) {
          selectedFile2 = {
            ...selectedFile2,
            name: newFileName,
            path: newFilePath,
          };
          secondFilePath.set(newFilePath);
        }

        showToast(`Renamed to: ${newFileName}`, "success");
        await refreshDirectory();
        cancelRename();
      } else {
        showToast(`Failed to rename "${renamingFile.name}"`, "error");
      }
    } catch (error) {
      showToast(`Failed to rename: ${getErrorMessage(error)}`, "error");
    }
  }

  /** Read, validate and normalize a path file. Reports errors and returns null. */
  async function readPathFile(file: FileInfo) {
    if (file.error) {
      showToast(`Cannot load file: ${file.error}`, "error");
      return null;
    }

    try {
      const content = await browserFileStore.readFile(file.path);
      const data = JSON.parse(content);

      if (!data.startPoint || !data.lines) {
        throw new Error("Invalid file format: missing required fields");
      }

      const versionWarning = newerVersionWarning(data.version);
      if (versionWarning) showToast(versionWarning, "warning");

      const normalizedLines = normalizePaths(data.lines || []);
      return {
        startPoint: normalizeStartPose(data.startPoint),
        lines: normalizedLines,
        shapes: data.shapes || [],
        sequence: deriveSequence(data, normalizedLines),
        fieldPoints: hydrateFieldPoints(data),
      };
    } catch (error) {
      const errMsg = getErrorMessage(error);
      const message = errMsg.includes("Invalid file format")
        ? "Invalid file format. This may not be a valid path file."
        : `Error loading file: ${errMsg}`;

      showToast(message, "error");
      errorMessage = message;
      return null;
    }
  }

  async function loadFile(file: FileInfo) {
    const doc = await readPathFile(file);
    if (!doc) return;

    startPoint = doc.startPoint;
    lines = doc.lines;
    shapes = doc.shapes;
    sequence = doc.sequence;
    fieldPoints = doc.fieldPoints;

    currentFilePath.set(file.path);
    isUnsaved.set(false);
    selectedFile = file;

    showToast(`Loaded: ${file.name}`, "success");
  }

  /** In dual-path mode a file that is not already open loads into the second slot. */
  function activateFile(file: FileInfo) {
    if (
      $dualPathMode &&
      selectedFile2?.path !== file.path &&
      selectedFile?.path !== file.path
    ) {
      loadSecondFile(file);
    } else {
      loadFile(file);
    }
  }

  async function loadSecondFile(file: FileInfo) {
    const doc = await readPathFile(file);
    if (!doc) return;

    secondStartPoint = doc.startPoint;
    secondLines = doc.lines;
    secondShapes = doc.shapes;
    secondSequence = doc.sequence;
    fieldPoints = doc.fieldPoints;

    secondFilePath.set(file.path);
    selectedFile2 = file;

    showToast(`Loaded second path: ${file.name}`, "success");
  }

  async function saveCurrentToFile() {
    if (!selectedFile) {
      showToast("No file selected", "error");
      return;
    }

    try {
      const content = serializeProject({
        startPoint,
        lines,
        shapes,
        sequence,
        fieldPoints,
      });

      await browserFileStore.writeFile(selectedFile.path, content);
      await refreshDirectory();

      isUnsaved.set(false);
      showToast(`Saved: ${selectedFile.name}`, "success");
    } catch (error) {
      errorMessage = `Failed to save file: ${getErrorMessage(error)}`;
      showToast("Failed to save file", "error");
    }
  }

  // Download current project as a .pp file to the user's computer (Save As...)
  function downloadCurrentToDisk() {
    try {
      const content = serializeProject(
        { startPoint, lines, shapes, sequence, fieldPoints },
        { pretty: true },
      );

      const defaultName = selectedFile?.name || "path.pp";
      downloadJson(content, defaultName);
      showToast(`Downloaded: ${defaultName}`, "success");
    } catch (error) {
      showToast(`Failed to download file: ${getErrorMessage(error)}`, "error");
    }
  }

  // If the browser supports the File System Access API, allow picking an existing local file and overwrite it.
  async function pickAndOverwriteLocalFile() {
    const win: any = window as any;
    if (!win.showOpenFilePicker) {
      showToast(
        "This browser does not support direct file overwrite. Use 'Download .pp' instead.",
        "warning",
      );
      return;
    }

    try {
      const [handle] = await win.showOpenFilePicker({
        types: [
          {
            description: "Path files",
            accept: { "application/json": [".pp", ".json"] },
          },
        ],
        excludeAcceptAllOption: false,
        multiple: false,
      });

      if (!handle) return;

      const writable = await handle.createWritable();

      const content = serializeProject(
        { startPoint, lines, shapes, sequence, fieldPoints },
        { pretty: true },
      );

      await writable.write(content);
      await writable.close();

      showToast(`Saved to local file: ${handle.name}`, "success");
    } catch (error) {
      console.error("File System API error:", error);
      showToast(
        `Failed to write local file: ${getErrorMessage(error)}`,
        "error",
      );
    }
  }
  async function createNewFile() {
    if (!newFileName.trim()) {
      showToast("Please enter a file name", "warning");
      return;
    }

    const fileName = newFileName.endsWith(".pp")
      ? newFileName
      : newFileName + ".pp";
    const filePath = fileName;

    // Validate file name
    if (!/^[a-zA-Z0-9_\-. ]+\.pp$/.test(fileName)) {
      showToast(
        "Invalid file name. Use only letters, numbers, underscores, dashes, and spaces.",
        "error",
      );
      return;
    }

    try {
      // Check if file exists
      const exists = await browserFileStore.fileExists(filePath);
      if (exists) {
        if (!confirm(`File "${fileName}" already exists. Overwrite?`)) {
          return;
        }
      }

      // Always start from the default path template instead of copying
      // whatever path is currently loaded/selected.
      const defaultStartPoint = getDefaultStartPoint();
      const defaultLines = normalizePaths(getDefaultPaths());
      const defaultShapes = getDefaultShapes();
      const defaultSequence = deriveSequence({}, defaultLines);
      const defaultFieldPoints: FieldPoint[] = [];

      const content = serializeProject({
        startPoint: defaultStartPoint,
        lines: defaultLines,
        shapes: defaultShapes,
        sequence: defaultSequence,
        fieldPoints: defaultFieldPoints,
      });

      await browserFileStore.writeFile(filePath, content);

      creatingNewFile = false;
      newFileName = "";
      await refreshDirectory();

      // Load the fresh default path into editor state
      startPoint = defaultStartPoint;
      lines = defaultLines;
      shapes = defaultShapes;
      sequence = defaultSequence;
      fieldPoints = defaultFieldPoints;

      selectedFile = files.find((f) => f.name === fileName) || null;
      if (selectedFile) {
        currentFilePath.set(selectedFile.path);
        isUnsaved.set(false);
        showToast(`Created: ${fileName}`, "success");
      }
    } catch (error) {
      console.error("Error creating file:", error);
      errorMessage = `Failed to create file: ${getErrorMessage(error)}`;
      showToast("Failed to create file", "error");
    }
  }

  async function deleteFile(file: FileInfo) {
    if (
      !confirm(
        `Are you sure you want to delete "${file.name}"?\nThis action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      const pathToDelete = String(file.path || file.name).trim();

      // Try multiple variants in case keys differ (basename vs full path vs name)
      const candidates = [pathToDelete, file.name, path.basename(pathToDelete)];
      let deleted = false;
      for (const candidate of candidates) {
        try {
          if (!candidate) continue;
          const res = await browserFileStore.deleteFile(candidate);
          console.debug("Attempted delete of", candidate, "=>", res);
          if (res) {
            deleted = true;
            // Normalize selectedFile/path if it matched any candidate
            if (
              selectedFile &&
              (selectedFile.path === candidate ||
                selectedFile.name === candidate ||
                selectedFile.name === file.name)
            ) {
              selectedFile = null;
              currentFilePath.set(null);
            }
            break;
          }
        } catch (err) {
          console.warn("deleteFile attempt error for", candidate, err);
        }
      }

      if (!deleted) {
        const msg = `Could not delete file: ${file.name} (not found in cache)`;
        console.warn(msg, { tried: candidates });
        showToast(msg, "error");
        // Dump storage to console for debugging
        try {
          const raw = localStorage.getItem("pp_files");
          console.debug("pp_files content:", raw ? JSON.parse(raw) : raw);
        } catch (err) {
          console.warn("Failed to read pp_files localStorage", err);
        }
        await refreshDirectory();
        return;
      }

      await refreshDirectory();
      showToast(`Deleted: ${file.name}`, "success");
    } catch (error) {
      console.error("Error deleting file:", error);
      errorMessage = `Failed to delete file: ${getErrorMessage(error)}`;
      showToast("Failed to delete file", "error");
    }
  }

  async function duplicateFile() {
    if (!selectedFile) {
      showToast("No file selected to duplicate", "warning");
      return;
    }

    try {
      const content = await browserFileStore.readFile(selectedFile.path);
      const data = JSON.parse(content);

      // Add "Copy" suffix to the name in the data
      if (data.name) {
        data.name += " Copy";
      }

      const baseName = stripPpExtension(selectedFile.name);
      let newFileName = `${baseName}_copy.pp`;
      let counter = 1;

      // Find a unique name
      while (await browserFileStore.fileExists(newFileName)) {
        newFileName = `${baseName}_copy${counter}.pp`;
        counter++;
      }

      const newFilePath = newFileName;

      const normalizedLines = normalizePaths(data.lines || []);
      const sequenceData = deriveSequence(data, normalizedLines);
      await browserFileStore.writeFile(
        newFilePath,
        JSON.stringify(
          {
            ...data,
            lines: normalizedLines,
            sequence: sequenceData,
          },
          null,
          2,
        ),
      );
      await refreshDirectory();

      // Select and load the new file
      const newFile = files.find((f) => f.name === newFileName);
      if (newFile) {
        await loadFile(newFile);
      }

      showToast(`Duplicated: ${newFileName}`, "success");
    } catch (error) {
      console.error("Error duplicating file:", error);
      errorMessage = `Failed to duplicate file: ${getErrorMessage(error)}`;
      showToast("Failed to duplicate file", "error");
    }
  }

  async function duplicateAndMirrorFile() {
    if (!selectedFile) {
      showToast("No file selected to mirror", "warning");
      return;
    }

    try {
      const content = await browserFileStore.readFile(selectedFile.path);
      const data = JSON.parse(content);

      // normalize before mirroring
      data.lines = normalizePaths(data.lines || []);
      data.startPoint = normalizeStartPose(data.startPoint ?? {});

      const mirroredData = mirrorPathData(data);
      mirroredData.sequence = deriveSequence(mirroredData, mirroredData.lines);

      const baseName = stripPpExtension(selectedFile.name);
      const defaultName = `${baseName}_mirrored`;

      // Store the mirrored data and open custom dialog
      pendingMirrorData = mirroredData;
      nameDialogTitle = "Name Mirrored Path";
      nameDialogDefault = defaultName;
      nameDialogOpen = true;
    } catch (error) {
      console.error("Error duplicating and mirroring file:", error);
      errorMessage = `Failed to create mirrored file: ${getErrorMessage(error)}`;
      showToast("Failed to create mirrored file", "error");
    }
  }

  async function handleMirrorNameConfirm(userInput: string) {
    if (!pendingMirrorData) return;

    try {
      // Remove .pp extension if user added it
      userInput = stripPpExtension(userInput);

      let newFileName = `${userInput}.pp`;
      let counter = 1;

      // Find a unique name if the chosen name already exists
      while (await browserFileStore.fileExists(newFileName)) {
        newFileName = `${userInput}${counter}.pp`;
        counter++;
      }

      await browserFileStore.writeFile(
        newFileName,
        JSON.stringify(pendingMirrorData, null, 2),
      );
      await refreshDirectory();

      // Select and load the new file
      const newFile = files.find((f) => f.name === newFileName);
      if (newFile) {
        await loadFile(newFile);
      }

      showToast(`Created mirrored: ${newFileName}`, "success");
    } catch (error) {
      console.error("Error saving mirrored file:", error);
      errorMessage = `Failed to save mirrored file: ${getErrorMessage(error)}`;
      showToast("Failed to save mirrored file", "error");
    } finally {
      pendingMirrorData = null;
      nameDialogOpen = false;
    }
  }

  function handleMirrorNameCancel() {
    pendingMirrorData = null;
    nameDialogOpen = false;
  }

  function mirrorHeading(heading: Heading): Heading {
    switch (heading.type) {
      // For linear heading, mirror both start and end degrees
      case "linear":
        return {
          type: "linear",
          startDeg: 180 - heading.startDeg,
          endDeg: 180 - heading.endDeg,
        };

      // For constant heading, mirror the constant degree
      case "constant":
        return { type: "constant", degrees: 180 - heading.degrees };

      // For tangential heading, keep the reverse flag unchanged so mirrored
      // tangents stay mirrored
      case "tangential":
        return heading;

      // Each piecewise segment carries its own angles, so mirror them all
      case "piecewise":
        return {
          type: "piecewise",
          piecewiseHeading: {
            ...heading.piecewiseHeading,
            segments: (heading.piecewiseHeading?.segments ?? []).map(
              (segment) => {
                const parameters = segment.parameters;
                if (!parameters) return segment;
                return {
                  ...segment,
                  parameters: {
                    ...parameters,
                    startDeg:
                      parameters.startDeg === undefined
                        ? undefined
                        : 180 - parameters.startDeg,
                    endDeg:
                      parameters.endDeg === undefined
                        ? undefined
                        : 180 - parameters.endDeg,
                    degrees:
                      parameters.degrees === undefined
                        ? undefined
                        : 180 - parameters.degrees,
                    point: parameters.point
                      ? {
                          ...parameters.point,
                          x: FIELD_SIZE - parameters.point.x,
                        }
                      : undefined,
                  },
                };
              },
            ),
          },
        };
    }
  }

  function mirrorPathData(data: any) {
    const mirrored = JSON.parse(JSON.stringify(data)); // Deep clone

    // Mirror start point
    if (mirrored.startPoint) {
      mirrored.startPoint.x = FIELD_SIZE - mirrored.startPoint.x;
      mirrored.startPoint.headingDeg = 180 - mirrored.startPoint.headingDeg;
    }

    // Mirror lines, descending into groups so nested segments are mirrored too
    const mirrorPaths = (paths: Path[]) => {
      paths.forEach((path) => {
        if (path.heading) {
          path.heading = mirrorHeading(path.heading);
        }

        if (path.kind === "compound") {
          mirrorPaths(path.segments);
          return;
        }

        // Mirror end point
        if (path.endPoint) {
          path.endPoint.x = FIELD_SIZE - path.endPoint.x;
        }

        // Mirror control points
        if (path.controlPoints && Array.isArray(path.controlPoints)) {
          path.controlPoints.forEach((controlPoint) => {
            controlPoint.x = FIELD_SIZE - controlPoint.x;
          });
        }
      });
    };
    if (mirrored.lines && Array.isArray(mirrored.lines)) {
      mirrorPaths(mirrored.lines);
    }

    // Don't mirror shapes/obstacles - they should remain in their original positions
    // (removed mirroring logic for shapes)

    return mirrored;
  }

  // Toast notification system
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatDate(date: Date): string {
    return (
      new Date(date).toLocaleDateString() +
      " " +
      new Date(date).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }

  // Handle keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent) {
    if (!renamingFile) return;

    switch (event.key) {
      case "Enter":
        event.preventDefault();
        renameFile();
        break;
      case "Escape":
        event.preventDefault();
        cancelRename();
        break;
    }
  }

  onMount(() => {
    syncActiveProjectToStorage()
      .catch((error) => {
        console.error("Failed to sync active project before opening files:", error);
      })
      .finally(() => loadDirectory());
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("fileRenamed", handleExternalFileRename);
  });

  // Clean up event listener
  onDestroy(() => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("fileRenamed", handleExternalFileRename);
  });

  // Mock path.join for browser context
  const path = {
    join: (...parts: string[]) => parts.join("/"),
    basename: (filePath: string) => {
      const parts = filePath.split(/[\\/]/);
      return parts[parts.length - 1];
    },
    extname: (fileName: string) => {
      const match = fileName.match(/\.[^/.]+$/);
      return match ? match[0] : "";
    },
  };
</script>

<div class="fixed inset-0 z-1010 flex" class:pointer-events-none={!isOpen}>
  <!-- Backdrop -->
  {#if isOpen}
    <div
      transition:fade={{ duration: 300 }}
      class="console-backdrop fixed inset-0"
      onclick={() => (isOpen = false)}
      role="button"
      tabindex="0"
      aria-label="Close file manager backdrop"
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
          isOpen = false;
        }
      }}
    ></div>
  {/if}

  <!-- Sidebar -->
  <div
    class="file-drawer w-80 md:w-96 h-full transform transition-transform duration-300 ease-in-out flex flex-col"
    class:translate-x-0={isOpen}
    class:-translate-x-full={!isOpen}
  >
    <!-- Header -->
    <div class="file-drawer-band shrink-0 p-3">
      <div class="flex items-center justify-between">
        <h2 class="module-title">Files</h2>
        <button
          onclick={() => (isOpen = false)}
          class="console-icon-button"
          title="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Error Message -->
      {#if errorMessage}
        <div class="console-section mt-3 p-2 text-xs text-[#f4c6c6]">
          ⚠ {errorMessage}
        </div>
      {/if}
    </div>

    <!-- New File Section -->
    <div class="file-drawer-band shrink-0 px-3 py-2">
      {#if creatingNewFile}
        <div class="space-y-2">
          <input
            bind:value={newFileName}
            placeholder="Enter file name (e.g., my_path.pp)..."
            class="console-input px-2 py-1.5 text-sm"
            onkeydown={(e) => e.key === "Enter" && createNewFile()}
          />
          <div class="flex gap-2">
            <button
              onclick={createNewFile}
              class="console-action console-action--accent console-action--compact flex-1"
            >
              Create
            </button>
            <button
              onclick={() => {
                creatingNewFile = false;
                newFileName = "";
              }}
              class="console-action console-action--compact flex-1"
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <button
          onclick={() => (creatingNewFile = true)}
          class="console-action console-action--compact w-full"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New Path File
        </button>
      {/if}
    </div>

    <!-- File List -->
    <div class="flex-1 overflow-hidden">
      {#if loading}
        <div class="flex flex-col items-center justify-center h-32 gap-2">
          <div
            class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8d68bd]"
          ></div>
          <div class="module-caption">Loading files...</div>
        </div>
      {:else if errorMessage && files.length === 0}
        <div class="flex flex-col items-center justify-center h-32 p-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={1}
            stroke="currentColor"
            class="size-10 mx-auto mb-2 text-[#a34e4e]"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <div class="module-caption text-center">
            {errorMessage}
          </div>
        </div>
      {:else if files.length === 0}
        <div class="flex flex-col items-center justify-center h-32 p-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={1}
            stroke="currentColor"
            class="size-10 mx-auto mb-2 opacity-50"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <div class="module-caption mb-2">No files yet</div>
          <button
            onclick={() => (creatingNewFile = true)}
            class="console-action console-action--accent console-action--compact"
          >
            Create First
          </button>
        </div>
      {:else}
        <div class="h-full overflow-y-auto">
          <div
            class="file-drawer-band file-drawer-caption sticky top-0 bg-[#151515] px-3 py-1.5"
          >
            Showing {files.length} file{files.length !== 1 ? "s" : ""}
          </div>

          {#each files as file (file.path)}
            <FileListItem
              {file}
              isPrimary={selectedFile?.path === file.path}
              isSecondary={selectedFile2?.path === file.path}
              renaming={renamingFile?.path === file.path}
              bind:renameValue={renameInputValue}
              {formatFileSize}
              {formatDate}
              onActivate={activateFile}
              onStartRename={startRename}
              onConfirmRename={renameFile}
              onCancelRename={cancelRename}
              onDelete={deleteFile}
            />
          {/each}
        </div>
      {/if}
    </div>

    <FileActionsPanel
      {selectedFile}
      onRename={startRename}
      onDelete={deleteFile}
      onDuplicate={duplicateFile}
      onDuplicateAndMirror={duplicateAndMirrorFile}
      onOverwrite={saveCurrentToFile}
      onNew={() => (creatingNewFile = true)}
      onDownload={downloadCurrentToDisk}
      onSaveToLocalFile={pickAndOverwriteLocalFile}
    />
  </div>
</div>

<NameDialog
  bind:isOpen={nameDialogOpen}
  title={nameDialogTitle}
  defaultValue={nameDialogDefault}
  placeholder="Enter name..."
  onConfirm={handleMirrorNameConfirm}
  onCancel={handleMirrorNameCancel}
/>
