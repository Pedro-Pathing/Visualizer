<script lang="ts" context="module">

</script>

<script lang="ts">
  import { onMount, afterUpdate, onDestroy } from "svelte";

  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import type { FileInfo, Point, Line, Shape, SequenceItem } from "../types";
  import * as browserFileStore from "../utils/browserFileStore";
  import { currentFilePath, isUnsaved, dualPathMode, secondFilePath } from "../stores";
  import { getRandomColor } from "../utils";
  import {
    saveAutoPathsDirectory,
    getSavedAutoPathsDirectory,
  } from "../utils/directorySettings";
  import NameDialog from "./components/NameDialog.svelte";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let shapes: Shape[];
  export let sequence: SequenceItem[];
  export let secondStartPoint: Point | null = null;
  export let secondLines: Line[] = [];
  export let secondShapes: Shape[] = [];
  export let secondSequence: SequenceItem[] = [];

  let files: FileInfo[] = [];
  let selectedFile2: FileInfo | null = null;
  let loading = false;
  let newFileName = "";
  let creatingNewFile = false;
  let selectedFile: FileInfo | null = null;
  let errorMessage = "";
  let directoryStats = {
    totalFiles: 0,
    totalSize: 0,
    lastModified: new Date(),
  };

  // Add renaming state
  let renamingFile: FileInfo | null = null;
  let renameInputValue = "";

  // Add file type filtering
  const supportedFileTypes = [".pp"];

  // Name dialog state
  let nameDialogOpen = false;
  let nameDialogTitle = "";
  let nameDialogDefault = "";
  let pendingMirrorData: any = null;



  // Helper to get error message from unknown error type
  function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  // Normalize lines to ensure ids and wait fields exist
  function normalizeLines(input: Line[] = []): Line[] {
    return (input || []).map((line) => ({
      ...line,
      id: line.id || `line-${Math.random().toString(36).slice(2)}`,
      waitBeforeMs: Math.max(
        0,
        Number(line.waitBeforeMs ?? (line as any).waitBefore?.durationMs ?? 0),
      ),
      waitAfterMs: Math.max(
        0,
        Number(line.waitAfterMs ?? (line as any).waitAfter?.durationMs ?? 0),
      ),
      waitBeforeName:
        line.waitBeforeName ?? (line as any).waitBefore?.name ?? "",
      waitAfterName: line.waitAfterName ?? (line as any).waitAfter?.name ?? "",
    }));
  }

  // Normalize sequence data, falling back to path-only sequence if waits are missing
  function deriveSequence(data: any, normalizedLines: Line[]): SequenceItem[] {
    if (Array.isArray(data?.sequence) && data.sequence.length) {
      return data.sequence as SequenceItem[];
    }

    return normalizedLines.map((ln) => ({
      kind: "path",
      lineId: ln.id!,
    }));
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

  async function refreshDirectory() {
    try {
      // Get directory stats
      const stats = await browserFileStore.getDirectoryStats();
      if (stats) {
        directoryStats = {
          totalFiles: stats.totalFiles,
          totalSize: stats.totalSize,
          lastModified: new Date(stats.lastModified),
        };
      }

      // List files
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
            error: isSupported ? undefined : `Unsupported file type: ${fileExt}`,
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

  // Directory logic is not needed in browser mode
  function changeDirectory() {
    showToast("Directory selection is not available in browser mode.", "info");
  }

  // NEW: Start renaming a file
  function startRename(file: FileInfo) {
    renamingFile = file;
    renameInputValue = file.name.replace(/\.pp$/, "");
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
        }

        showToast(`Renamed to: ${newFileName}`, "success");
        await refreshDirectory();
        cancelRename();
      }
    } catch (error) {
      showToast(`Failed to rename: ${getErrorMessage(error)}`, "error");
    }
  }

  async function loadFile(file: FileInfo) {
    if (file.error) {
      showToast(`Cannot load file: ${file.error}`, "error");
      return;
    }

    try {
      const content = await browserFileStore.readFile(file.path);
      const data = JSON.parse(content);

      // Validate the loaded data
      if (!data.startPoint || !data.lines) {
        throw new Error("Invalid file format: missing required fields");
      }

      // Update the application state
      startPoint = data.startPoint;
      const normalizedLines = normalizeLines(data.lines || []);
      lines = normalizedLines;
      shapes = data.shapes || [];
      sequence = deriveSequence(data, normalizedLines);

      // Update Global Store State
      currentFilePath.set(file.path);
      isUnsaved.set(false);

      selectedFile = file;

      showToast(`Loaded: ${file.name}`, "success");
    } catch (error) {
      const errMsg = getErrorMessage(error);
      const message = errMsg.includes("Invalid file format")
        ? "Invalid file format. This may not be a valid path file."
        : `Error loading file: ${errMsg}`;

      showToast(message, "error");
      errorMessage = message;
    }
  }

  async function loadSecondFile(file: FileInfo) {
    if (file.error) {
      showToast(`Cannot load file: ${file.error}`, "error");
      return;
    }

    try {
      const content = await browserFileStore.readFile(file.path);
      const data = JSON.parse(content);

      // Validate the loaded data
      if (!data.startPoint || !data.lines) {
        throw new Error("Invalid file format: missing required fields");
      }

      // Update the second path state
      secondStartPoint = data.startPoint;
      const normalizedLines = normalizeLines(data.lines || []);
      secondLines = normalizedLines;
      secondShapes = data.shapes || [];
      secondSequence = deriveSequence(data, normalizedLines);

      // Update Global Store State
      secondFilePath.set(file.path);

      selectedFile2 = file;

      showToast(`Loaded second path: ${file.name}`, "success");
    } catch (error) {
      const errMsg = getErrorMessage(error);
      const message = errMsg.includes("Invalid file format")
        ? "Invalid file format. This may not be a valid path file."
        : `Error loading file: ${errMsg}`;

      showToast(message, "error");
      errorMessage = message;
    }
  }

  async function saveCurrentToFile() {
    if (!selectedFile) {
      showToast("No file selected", "error");
      return;
    }

    try {
      const content = JSON.stringify({
        startPoint,
        lines,
        shapes,
        sequence,
        version: "1.2.1", // Add version for compatibility
        timestamp: new Date().toISOString(),
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
      const content = JSON.stringify({
        startPoint,
        lines,
        shapes,
        sequence,
        version: "1.2.1",
        timestamp: new Date().toISOString(),
      }, null, 2);

      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const defaultName = selectedFile?.name || "path.pp";
      a.href = url;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Downloaded: ${a.download}`, "success");
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

      const content = JSON.stringify({
        startPoint,
        lines,
        shapes,
        sequence,
        version: "1.2.1",
        timestamp: new Date().toISOString(),
      }, null, 2);

      await writable.write(content);
      await writable.close();

      showToast(`Saved to local file: ${handle.name}`, "success");
    } catch (error) {
      console.error("File System API error:", error);
      showToast(`Failed to write local file: ${getErrorMessage(error)}`, "error");
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

      const normalizedLines = normalizeLines(lines);
      const content = JSON.stringify({
        startPoint,
        lines: normalizedLines,
        shapes,
        sequence,
        version: "1.2.1",
        timestamp: new Date().toISOString(),
      });

      await browserFileStore.writeFile(filePath, content);

      creatingNewFile = false;
      newFileName = "";
      await refreshDirectory();

      // Automatically "load" the new file into state
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
            if (selectedFile && (selectedFile.path === candidate || selectedFile.name === candidate || selectedFile.name === file.name)) {
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

  // Debug helper: print raw storage entries to console and show toast
  function debugPrintStorage() {
    try {
      const raw = localStorage.getItem("pp_files");
      const parsed = raw ? JSON.parse(raw) : null;
      console.info("pp_files:", parsed);
      const count = parsed ? Object.keys(parsed).length : 0;
      showToast(`Storage contains ${count} file(s). See console for details.`, "info");
    } catch (err) {
      console.error("Failed to read pp_files", err);
      showToast("Failed to read storage (see console)", "error");
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

      const baseName = selectedFile.name.replace(/\.pp$/, "");
      let newFileName = `${baseName}_copy.pp`;
      let counter = 1;

      // Find a unique name
      while (
        await browserFileStore.fileExists(newFileName)
      ) {
        newFileName = `${baseName}_copy${counter}.pp`;
        counter++;
      }

      const newFilePath = newFileName;

      const normalizedLines = normalizeLines(data.lines || []);
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

      // Mirror the path data
      const mirroredData = mirrorPathData(data);
      mirroredData.lines = normalizeLines(mirroredData.lines || []);
      mirroredData.sequence = deriveSequence(mirroredData, mirroredData.lines);

      const baseName = selectedFile.name.replace(/\.pp$/, "");
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
      userInput = userInput.replace(/\.pp$/, "");
      
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
    }
  }

  function handleMirrorNameCancel() {
    pendingMirrorData = null;
  }

  function mirrorPointHeading(point: Point): Point {
    // For linear heading, mirror both start and end degrees
    if (point.heading === "linear") {
      return {
        ...point,
        startDeg: 180 - point.startDeg,
        endDeg: 180 - point.endDeg,
      };
    }

    // For constant heading, mirror the constant degree
    if (point.heading === "constant") {
      return {
        ...point,
        degrees: 180 - point.degrees,
      };
    }

    // For tangential heading, toggle the reverse flag to maintain the same visual direction
    if (point.heading === "tangential") {
      return {
        ...point,
        reverse: !point.reverse,
      };
    }

    return point;
  }

  function mirrorPathData(data: any) {
    const mirrored = JSON.parse(JSON.stringify(data)); // Deep clone

    // Mirror start point
    if (mirrored.startPoint) {
      mirrored.startPoint.x = 144 - mirrored.startPoint.x;
      mirrored.startPoint = mirrorPointHeading(mirrored.startPoint);
    }

    // Mirror lines
    if (mirrored.lines && Array.isArray(mirrored.lines)) {
      mirrored.lines.forEach((line: Line) => {
        // Mirror end point
        if (line.endPoint) {
          line.endPoint.x = 144 - line.endPoint.x;
          line.endPoint = mirrorPointHeading(line.endPoint);
        }

        // Mirror control points
        if (line.controlPoints && Array.isArray(line.controlPoints)) {
          line.controlPoints.forEach((controlPoint: any) => {
            controlPoint.x = 144 - controlPoint.x;
          });
        }
      });
    }

    // Mirror shapes
    if (mirrored.shapes && Array.isArray(mirrored.shapes)) {
      mirrored.shapes.forEach((shape: Shape) => {
        if (shape.vertices && Array.isArray(shape.vertices)) {
          shape.vertices.forEach((vertex: any) => {
            vertex.x = 144 - vertex.x;
          });
        }
      });
    }

    return mirrored;
  }

  // Toast notification system
  function showToast(
    message: string,
    type: "success" | "error" | "warning" | "info" = "info",
  ) {
    // Create toast element
    const toast = document.createElement("div");
    toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg z-[1100] ${
      type === "success"
        ? "bg-green-500 text-white"
        : type === "error"
          ? "bg-red-500 text-white"
          : type === "warning"
            ? "bg-amber-500 text-white"
            : "bg-blue-500 text-white"
    }`;
    toast.textContent = message;

    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        setTimeout(() => toast.remove(), 300);
      }
    }, 3000);
  }

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
    loadDirectory();
    window.addEventListener("keydown", handleKeyDown);
  });

  // Clean up event listener
  onDestroy(() => {
    window.removeEventListener("keydown", handleKeyDown);
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

<div class="fixed inset-0 z-[1010] flex" class:pointer-events-none={!isOpen}>
  <!-- Backdrop -->
  {#if isOpen}
    <div
      transition:fade={{ duration: 300 }}
      class="fixed inset-0 bg-black bg-opacity-50"
      on:click={() => (isOpen = false)}
      role="button"
      tabindex="0"
      aria-label="Close file manager backdrop"
      on:keydown={(e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
          isOpen = false;
        }
      }}
    />
  {/if}

  <!-- Sidebar -->
  <div
    class="w-80 md:w-96 h-full bg-white dark:bg-neutral-900 shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col"
    class:translate-x-0={isOpen}
    class:-translate-x-full={!isOpen}
  >
    <!-- Header -->
    <div
      class="flex-shrink-0 p-3 border-b border-neutral-200 dark:border-neutral-700"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-neutral-900 dark:text-white">
          Files
        </h2>
        <button
          on:click={() => (isOpen = false)}
          class="p-1 rounded transition-colors duration-250"
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
        <div
          class="mb-3 p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-300"
        >
          ⚠ {errorMessage}
        </div>
      {/if}
      
    </div>

    <!-- New File Section -->
    <div
      class="flex-shrink-0 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700"
    >
      {#if creatingNewFile}
        <div class="space-y-2">
          <input
            bind:value={newFileName}
            placeholder="Enter file name (e.g., my_path.pp)..."
            class="w-full px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            on:keydown={(e) => e.key === "Enter" && createNewFile()}
          />
          <div class="flex gap-2">
            <button
              on:click={createNewFile}
              class="flex-1 px-3 py-1.5 text-sm bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors"
            >
              Create
            </button>
            <button
              on:click={() => {
                creatingNewFile = false;
                newFileName = "";
              }}
              class="flex-1 px-3 py-1.5 text-sm bg-neutral-500 hover:bg-neutral-600 text-white rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <button
          on:click={() => (creatingNewFile = true)}
          class="w-full px-3 py-1.5 text-sm bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
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
            class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"
          ></div>
          <div class="text-neutral-500 dark:text-neutral-400">
            Loading files...
          </div>
        </div>
      {:else if errorMessage && files.length === 0}
        <div class="flex flex-col items-center justify-center h-32 p-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={1}
            stroke="currentColor"
            class="size-10 mx-auto mb-2 text-red-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <div class="text-center text-xs text-neutral-600 dark:text-neutral-400">
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
          <div class="text-center text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            No files yet
          </div>
          <button
            on:click={() => (creatingNewFile = true)}
            class="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
          >
            Create First
          </button>
        </div>
      {:else}
        <div class="h-full overflow-y-auto">
          <div
            class="sticky top-0 bg-white dark:bg-neutral-900 px-3 py-1 border-b border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 dark:text-neutral-400"
          >
            Showing {files.length} file{files.length !== 1 ? "s" : ""}
          </div>

          {#each files as file (file.path)}
            <div
              class="px-3 py-1.5 border-b border-neutral-200 dark:border-neutral-700 transition-colors duration-250 cursor-pointer file-item group"
              on:click={() => {
                if ($dualPathMode && selectedFile2?.path !== file.path && selectedFile?.path !== file.path) {
                  loadSecondFile(file);
                } else {
                  loadFile(file);
                }
              }}
              role="button"
              tabindex="0"
              on:keydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  if ($dualPathMode && selectedFile2?.path !== file.path && selectedFile?.path !== file.path) {
                    loadSecondFile(file);
                  } else {
                    loadFile(file);
                  }
                }
              }}
              aria-label={`Open ${file.name}`}
              class:bg-blue-50={selectedFile?.path === file.path}
              class:dark:bg-blue-900={selectedFile?.path === file.path}
              class:bg-purple-50={selectedFile2?.path === file.path}
              class:dark:bg-purple-900={selectedFile2?.path === file.path}
            >
              {#if renamingFile?.path === file.path}
                <!-- Rename Input -->
                <div class="space-y-2">
                  <input
                    bind:value={renameInputValue}
                    class="w-full px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    on:keydown={(e) => {
                      if (e.key === "Enter") renameFile();
                      if (e.key === "Escape") cancelRename();
                    }}
                  />
                  <div class="flex gap-2">
                    <button
                      on:click|stopPropagation={renameFile}
                      class="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                    >
                      Save
                    </button>
                    <button
                      on:click|stopPropagation={cancelRename}
                      class="px-2 py-1 text-xs bg-neutral-500 hover:bg-neutral-600 text-white rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              {:else}
                <!-- Normal File Display -->
                <div class="flex items-center justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div
                      class="font-medium text-sm truncate text-neutral-900 dark:text-white"
                      title={file.name}
                    >
                      {file.name}
                      {#if file.error}
                        <span class="ml-2 text-xs text-red-500"
                          >({file.error})</span
                        >
                      {/if}
                    </div>
                    <div
                      class="text-xs text-neutral-500 dark:text-neutral-400 group-hover:block hidden"
                      title="{formatFileSize(file.size)} • {formatDate(file.modified)}"
                    >
                      {formatFileSize(file.size)} • {formatDate(file.modified)}
                    </div>
                  </div>

                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <!-- Rename Button -->
                    <button
                      on:click|stopPropagation={() => startRename(file)}
                      class="p-1.5 rounded hover:bg-blue-500 hover:text-white transition-colors flex-shrink-0"
                      title="Rename file"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width={1.5}
                        stroke="currentColor"
                        class="size-4"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                        />
                      </svg>
                    </button>

                    <!-- Delete Button -->
                    <button
                      on:click|stopPropagation={() => deleteFile(file)}
                      class="p-1.5 rounded hover:bg-red-500 hover:text-white transition-colors flex-shrink-0"
                      title="Delete file"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width={1.5}
                        stroke="currentColor"
                        class="size-4"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Current File Actions -->
    {#if selectedFile}
      <div
        class="flex-shrink-0 p-3 border-t border-neutral-200 dark:border-neutral-700 space-y-2 bg-neutral-50 dark:bg-neutral-950"
      >
        <div class="text-xs font-medium text-neutral-700 dark:text-neutral-300 px-1">
          {selectedFile.name}
        </div>

        <!-- File Operations (Rename, Delete, Duplicate, Mirror) -->
        <div class="grid grid-cols-4 gap-1">
          <button
            on:click={() => selectedFile && startRename(selectedFile)}
            class="px-2 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors flex items-center justify-center gap-1"
            title="Rename this file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-3.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
              />
            </svg>
          </button>

          <button
            on:click={() => selectedFile && deleteFile(selectedFile)}
            class="px-2 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors flex items-center justify-center gap-1"
            title="Delete this file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-3.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
          </button>

          <button
            on:click={duplicateFile}
            class="px-2 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors flex items-center justify-center gap-1"
            title="Duplicate this file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-3.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
              />
            </svg>
          </button>

          <button
            on:click={duplicateAndMirrorFile}
            class="px-2 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors flex items-center justify-center gap-1"
            title="Duplicate mirrored (flipped)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-3.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
              />
            </svg>
          </button>
        </div>

        <!-- Saving Operations -->
        <div class="space-y-1">
          <div class="text-xs font-medium text-neutral-600 dark:text-neutral-400 px-1">
            Save Options
          </div>
          <div class="grid grid-cols-2 gap-1">
            <button
              on:click={saveCurrentToFile}
              class="px-2 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors flex items-center justify-center gap-1"
              disabled={!selectedFile}
              title="Save into selected file (overwrite)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5A2.25 2.25 0 0 1 5.25 5.25h13.5A2.25 2.25 0 0 1 21 7.5v9a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 16.5v-9zM7.5 11.25h9M7.5 14.25h6" />
              </svg>
              Overwrite
            </button>
            <button
              on:click={() => (creatingNewFile = true)}
              class="px-2 py-1.5 text-xs bg-green-500 hover:bg-green-600 text-white rounded transition-colors flex items-center justify-center gap-1"
              title="Create new file and save"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New
            </button>
            <button
              on:click={downloadCurrentToDisk}
              class="px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center justify-center gap-1"
              title="Download .pp to computer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0 3-3m-3 3-3-3M21 21H3" />
              </svg>
              Download
            </button>
            <button
              on:click={pickAndOverwriteLocalFile}
              class="px-2 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors flex items-center justify-center gap-1"
              title="Save to local file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 12v6m0-6V6m0 6l3-3m-3 3-3-3" />
              </svg>
              Local
            </button>
          </div>
        </div>

        <!-- Dual Path Mode Section -->
        <div class="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <div class="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              id="dualPathToggle"
              bind:checked={$dualPathMode}
              class="w-4 h-4 rounded cursor-pointer"
            />
            <label for="dualPathToggle" class="text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer flex-1">
              Alliance Coordination
            </label>
          </div>

          {#if $dualPathMode}
            <div class="space-y-2 px-1">
              <div class="text-xs text-neutral-600 dark:text-neutral-400">
                Second Path:
              </div>
              {#if selectedFile2}
                <div class="text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-purple-50 dark:bg-purple-900 px-2 py-1 rounded">
                  {selectedFile2.name}
                </div>
                <button
                  on:click={() => {
                    selectedFile2 = null;
                    secondFilePath.set(null);
                    secondStartPoint = null;
                    secondLines = [];
                    secondShapes = [];
                    secondSequence = [];
                  }}
                  class="w-full px-2 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors"
                >
                  Remove Second Path
                </button>
              {:else}
                <div class="text-xs text-neutral-500 dark:text-neutral-400 italic">
                  Click a file to load as second path
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div
        class="flex-shrink-0 p-3 border-t border-neutral-200 dark:border-neutral-700 text-center text-xs text-neutral-500 dark:text-neutral-400"
      >
        Select a file to manage
      </div>
    {/if}
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

<style>
  /* Add smooth transitions */
  .file-item {
    transition: all 0.2s ease;
  }

  .file-item:hover {
    transform: translateX(2px);
  }
</style>
