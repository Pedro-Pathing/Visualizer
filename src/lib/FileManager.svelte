<script lang="ts" context="module">

</script>

<script lang="ts">
  import { onMount, afterUpdate, onDestroy } from "svelte";

  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import type { FileInfo, Point, Line, Shape, SequenceItem } from "../types";
  import * as browserFileStore from "../utils/browserFileStore";
  import { currentFilePath, isUnsaved } from "../stores";
  import { getRandomColor } from "../utils";
  import {
    saveAutoPathsDirectory,
    getSavedAutoPathsDirectory,
  } from "../utils/directorySettings";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let shapes: Shape[];
  export let sequence: SequenceItem[];

  let currentDirectory = "";
  let files: FileInfo[] = [];
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
      await browserFileStore.deleteFile(file.path);

      if (selectedFile?.path === file.path) {
        selectedFile = null;
        currentFilePath.set(null);
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

      // Select the new file
      const newFile = files.find((f) => f.name === newFileName);
      if (newFile) {
        selectedFile = newFile;
        currentFilePath.set(newFile.path);
        isUnsaved.set(false);
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
      let newFileName = `${baseName}_mirrored.pp`;
      let counter = 1;

      // Find a unique name
      while (
        await browserFileStore.fileExists(newFileName)
      ) {
        newFileName = `${baseName}_mirrored${counter}.pp`;
        counter++;
      }

      const newFilePath = newFileName;
      await browserFileStore.writeFile(
        newFilePath,
        JSON.stringify(mirroredData, null, 2),
      );
      await refreshDirectory();

      // Select the new file
      const newFile = files.find((f) => f.name === newFileName);
      if (newFile) {
        selectedFile = newFile;
        currentFilePath.set(newFile.path);
        isUnsaved.set(false);
      }

      showToast(`Created mirrored: ${newFileName}`, "success");
    } catch (error) {
      console.error("Error duplicating and mirroring file:", error);
      errorMessage = `Failed to create mirrored file: ${getErrorMessage(error)}`;
      showToast("Failed to create mirrored file", "error");
    }
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
    class="w-96 h-full bg-white dark:bg-neutral-900 shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col"
    class:translate-x-0={isOpen}
    class:-translate-x-full={!isOpen}
  >
    <!-- Header -->
    <div
      class="flex-shrink-0 p-4 border-b border-neutral-200 dark:border-neutral-700"
    >
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold text-neutral-900 dark:text-white">
          File Manager
        </h2>
        <button
          on:click={() => (isOpen = false)}
          class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
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

      <!-- Directory Info with Stats -->
      <div class="mb-4">
        <div class="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
          <div class="font-medium mb-1">Current Directory:</div>
          <div
            class="font-mono text-xs bg-neutral-100 dark:bg-neutral-800 p-2 rounded overflow-x-auto whitespace-nowrap"
            title={currentDirectory}
          >
            {currentDirectory.includes("/GitHub/")
              ? "..." + currentDirectory.split("/GitHub/")[1]
              : currentDirectory}
          </div>
        </div>
      </div>

      <!-- Error Message -->
      {#if errorMessage}
        <div
          class="mb-3 p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-300"
        >
          ⚠ {errorMessage}
        </div>
      {/if}

      <button
        on:click={changeDirectory}
        class="w-full px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
      >
        <svg
          xmlns="http://www.w3.org2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-4"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"
          />
        </svg>
        Change Directory
      </button>
    </div>

    <!-- New File Section -->
    <div
      class="flex-shrink-0 p-4 border-b border-neutral-200 dark:border-neutral-700"
    >
      {#if creatingNewFile}
        <div class="space-y-2">
          <input
            bind:value={newFileName}
            placeholder="Enter file name (e.g., my_path.pp)..."
            class="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            on:keydown={(e) => e.key === "Enter" && createNewFile()}
          />
          <div class="flex gap-2">
            <button
              on:click={createNewFile}
              class="flex-1 px-3 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors"
            >
              Create
            </button>
            <button
              on:click={() => {
                creatingNewFile = false;
                newFileName = "";
              }}
              class="flex-1 px-3 py-2 text-sm bg-neutral-500 hover:bg-neutral-600 text-white rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <button
          on:click={() => (creatingNewFile = true)}
          class="w-full px-3 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
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
        <div class="flex flex-col items-center justify-center h-32 p-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={1}
            stroke="currentColor"
            class="size-12 mx-auto mb-2 text-red-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <div class="text-center text-neutral-600 dark:text-neutral-400">
            {errorMessage}
          </div>
          <button
            on:click={changeDirectory}
            class="mt-3 px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
          >
            Select Directory
          </button>
        </div>
      {:else if files.length === 0}
        <div class="flex flex-col items-center justify-center h-32 p-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={1}
            stroke="currentColor"
            class="size-12 mx-auto mb-2 opacity-50"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <div class="text-center text-neutral-500 dark:text-neutral-400">
            No path files (.pp) found
          </div>
          <button
            on:click={() => (creatingNewFile = true)}
            class="mt-3 px-3 py-1 text-sm bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors"
          >
            Create First File
          </button>
        </div>
      {:else}
        <div class="h-full overflow-y-auto">
          <div
            class="sticky top-0 bg-white dark:bg-neutral-900 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 dark:text-neutral-400"
          >
            Showing {files.length} file{files.length !== 1 ? "s" : ""}
          </div>

          {#each files as file (file.path)}
            <div
              class="p-3 border-b border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer file-item"
              on:click={() => loadFile(file)}
              role="button"
              tabindex="0"
              on:keydown={(e) => {
                if (e.key === "Enter" || e.key === " ") loadFile(file);
              }}
              aria-label={`Open ${file.name}`}
              class:bg-blue-50={selectedFile?.path === file.path}
              class:dark:bg-blue-900={selectedFile?.path === file.path}
            >
              <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
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
                    <div class="flex items-center gap-2 mb-1">
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
                    </div>
                    <div
                      class="text-xs text-neutral-500 dark:text-neutral-400 space-y-1"
                    >
                      <div class="flex items-center gap-2">
                        <span>{formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span>Modified: {formatDate(file.modified)}</span>
                      </div>
                    </div>
                  {/if}
                </div>

                {#if renamingFile?.path !== file.path}
                  <div class="flex items-center gap-1">
                    <!-- Rename Button -->
                    <button
                      on:click|stopPropagation={() => startRename(file)}
                      class="p-1 rounded hover:bg-blue-500 hover:text-white transition-colors flex-shrink-0 opacity-60 hover:opacity-100"
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
                      class="p-1 rounded hover:bg-red-500 hover:text-white transition-colors ml-2 flex-shrink-0 opacity-60 hover:opacity-100"
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
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Current File Actions -->
    {#if selectedFile}
      <div
        class="flex-shrink-0 p-4 border-t border-neutral-200 dark:border-neutral-700 space-y-3"
      >
        <div class="space-y-2">
          <div
            class="text-sm font-medium text-neutral-900 dark:text-white truncate"
            title={selectedFile.name}
          >
            {selectedFile.name}
          </div>
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            {formatFileSize(selectedFile.size)} • {formatDate(
              selectedFile.modified,
            )}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button
            on:click={() => selectedFile && startRename(selectedFile)}
            class="px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
            title="Rename this file"
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
                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
              />
            </svg>
            Rename
          </button>

          <button
            on:click={() => selectedFile && deleteFile(selectedFile)}
            class="px-3 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
            title="Delete this file"
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
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
            Delete
          </button>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button
            on:click={duplicateAndMirrorFile}
            class="px-3 py-2 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
            title="Create a mirrored copy of this file (flipped horizontally)"
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
                d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
              />
            </svg>
            Mirror
          </button>

          <button
            on:click={duplicateFile}
            class="px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
            title="Create a copy of this file"
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
                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
              />
            </svg>
            Duplicate
          </button>
        </div>

        <button
          on:click={saveCurrentToFile}
          class="w-full px-3 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
          disabled={!selectedFile}
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
              d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75h1.5m9 0h-9"
            />
          </svg>
          Save to {selectedFile.name}
        </button>
      </div>
    {:else}
      <div
        class="flex-shrink-0 p-4 border-t border-neutral-200 dark:border-neutral-700 text-center text-sm text-neutral-500 dark:text-neutral-400"
      >
        Select a file to manage or create a new one
      </div>
    {/if}
  </div>
</div>

<style>
  /* Add smooth transitions */
  .file-item {
    transition: all 0.2s ease;
  }

  .file-item:hover {
    transform: translateX(2px);
  }
</style>
