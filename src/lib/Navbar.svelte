<script lang="ts">
  import { run } from "svelte/legacy";

  import type {
    FieldPoint,
    Path,
    Shape,
    Settings,
    SequenceItem,
    StartPose,
  } from "../types";
  import { onMount, onDestroy } from "svelte";
  import {
    showGrid,
    gridSize,
    currentFilePath,
    isUnsaved,
    dualPathMode,
    activePaths,
  } from "../stores";
  import {
    getDefaultStartPoint,
    getDefaultPaths,
    getDefaultShapes,
  } from "../config";
  import FileManager from "./FileManager.svelte";
  import SettingsDialog from "./components/SettingsDialog.svelte";
  import ExportCodeDialog from "./components/ExportCodeDialog.svelte";
  import MultiplePathsDialog from "./components/MultiplePathsDialog.svelte";
  import { atomicSegments, calculatePathTime, formatTime } from "../utils";
  import { basename, pathStem } from "../utils/filename";
  import { downloadBlob } from "../utils/download";
  import NavDivider from "./components/ui/NavDivider.svelte";
  import ViewToggles from "./components/ViewToggles.svelte";
  import { showToast } from "./toast";
  import { exportElementAsPng } from "../utils/exportImage";

  interface Props {
    loadFile: (evt: any) => any;
    startPoint: StartPose;
    lines: Path[];
    shapes: Shape[];
    sequence: SequenceItem[];
    fieldPoints?: FieldPoint[];
    secondStartPoint?: StartPose | null;
    secondLines?: Path[];
    secondShapes?: Shape[];
    secondSequence?: SequenceItem[];
    percent?: number;
    settings: Settings;
    saveProject: () => any;
    saveFileAs: () => any;
    renameCurrentFile: () => any;
    undoAction: () => any;
    redoAction: () => any;
    recordChange: () => any;
    canUndo: boolean;
    canRedo: boolean;
    optimizeAllLines: () => Promise<void>;
    optimizingAll?: boolean;
    twoElement?: HTMLDivElement | null;
    exportPathAsGif: () => Promise<void>;
    leftPanelHidden?: boolean;
    rightPanelHidden?: boolean;
    onToggleLeftPanel?: () => void;
    onToggleRightPanel?: () => void;
  }

  let {
    loadFile,
    startPoint = $bindable(),
    lines = $bindable(),
    shapes = $bindable(),
    sequence = $bindable(),
    fieldPoints = $bindable([]),
    secondStartPoint = $bindable(null),
    secondLines = $bindable([]),
    secondShapes = $bindable([]),
    secondSequence = $bindable([]),
    percent = 0,
    settings = $bindable(),
    saveProject,
    saveFileAs,
    renameCurrentFile,
    undoAction,
    redoAction,
    recordChange,
    canUndo,
    canRedo,
    optimizeAllLines,
    optimizingAll = false,
    twoElement = null,
    exportPathAsGif,
    leftPanelHidden = false,
    rightPanelHidden = false,
    onToggleLeftPanel = () => {},
    onToggleRightPanel = () => {},
  }: Props = $props();

  let fileManagerOpen = $state(false);
  let settingsOpen = $state(false);
  let exportMenuOpen = $state(false);
  let exportingFieldImage = $state(false);
  let exportDialogOpen = $state(false);
  let exportDialog = $state<ExportCodeDialog>()!;
  let multiplePathsDialogOpen = $state(false);
  // Hide sequential export UI by default; backend generator remains available
  const showSequentialExport = false;

  let saveDropdownOpen = $state(false);
  let saveDropdownRef = $state<HTMLElement>();
  let saveButtonRef = $state<HTMLElement>();
  let exportMenuRef = $state<HTMLElement>();
  let exportButtonRef = $state<HTMLElement>();

  let selectedGridSize = $state(12);
  const gridSizeOptions = [0, 1, 3, 6, 12];

  // Ensure File Manager and Export dialog are mutually exclusive
  run(() => {
    if (fileManagerOpen && exportDialogOpen) {
      exportDialogOpen = false;
    }
  });

  // Ensure save dropdown and export menu are mutually exclusive
  run(() => {
    if (saveDropdownOpen && exportMenuOpen) {
      exportMenuOpen = false;
    }
  });

  let timePrediction = $derived(
    calculatePathTime(startPoint, lines, settings, sequence),
  );
  let elapsedSeconds = $derived(
    (percent / 100) * (timePrediction?.totalTime || 0),
  );

  onMount(() => {
    const unsubscribeGridSize = gridSize.subscribe((value) => {
      selectedGridSize = value;
    });

    return () => {
      unsubscribeGridSize();
    };
  });

  function cycleGridSize() {
    if (!$showGrid) {
      // Grid is off, turn it on with first non-zero size
      showGrid.set(true);
      selectedGridSize = gridSizeOptions[1]; // Start at 1, not 0
      gridSize.set(selectedGridSize);
    } else {
      // Grid is on, cycle to next size or turn off
      const currentIndex = gridSizeOptions.indexOf(selectedGridSize);
      const nextIndex = currentIndex + 1;
      if (nextIndex >= gridSizeOptions.length) {
        // We're at the last size, turn off
        showGrid.set(false);
      } else {
        // Move to next size
        selectedGridSize = gridSizeOptions[nextIndex];
        gridSize.set(selectedGridSize);
        // If grid size is 0, hide the grid
        if (selectedGridSize === 0) {
          showGrid.set(false);
        }
      }
    }
  }

  function handleExport(format: "java" | "kotlin" | "points" | "sequential") {
    exportMenuOpen = false;
    fileManagerOpen = false; // ensure file manager is closed before opening export dialog
    exportDialog.openWithFormat(format);
  }

  async function exportFieldAsImage() {
    exportMenuOpen = false;
    if (!twoElement) {
      alert("Canvas not ready. Please try again.");
      return;
    }
    if (exportingFieldImage) return;

    exportingFieldImage = true;
    try {
      // Capture the entire field including background, paths, and robots
      const blob = await exportElementAsPng(twoElement, {
        scale: 2, // 2x resolution for better quality
      });

      const fileName = $currentFilePath ? pathStem($currentFilePath) : "field";
      downloadBlob(blob, `${fileName}_field.png`);
      showToast("Exported field as image", "success");
    } catch (error) {
      console.error("Export error:", error);
      alert(
        "Failed to export field as image: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      exportingFieldImage = false;
    }
  }

  function resetPath() {
    startPoint = getDefaultStartPoint();
    lines = getDefaultPaths();
    sequence = atomicSegments(lines).map((ln) => ({
      kind: "path",
      lineId: ln.id,
    }));
    shapes = getDefaultShapes();
    activePaths.set([]);
    dualPathMode.set(false);
  }

  function handleResetPathWithConfirmation() {
    // Check if there's unsaved work
    const hasChanges = $isUnsaved || lines.length > 1 || shapes.length > 0;

    let message = "Are you sure you want to reset the path?\n\n";

    if (hasChanges) {
      if ($currentFilePath) {
        message += `This will reset "${basename($currentFilePath)}" to the default path.`;
      } else {
        message += "This will reset your current work to the default path.";
      }

      if ($isUnsaved) {
        message += "\n\n⚠ WARNING: You have unsaved changes that will be lost!";
      }
    } else {
      message += "This will reset to the default starting path.";
    }

    message += "\n\nClick OK to reset, or Cancel to keep your current path.";

    if (confirm(message)) {
      resetPath();
      if (recordChange) recordChange();
    }
  }

  function isOutside(event: MouseEvent, ...refs: (HTMLElement | undefined)[]) {
    return refs.every((ref) => ref && !ref.contains(event.target as Node));
  }

  function handleClickOutside(event: MouseEvent) {
    if (saveDropdownOpen && isOutside(event, saveDropdownRef, saveButtonRef)) {
      saveDropdownOpen = false;
    }
    if (exportMenuOpen && isOutside(event, exportMenuRef, exportButtonRef)) {
      exportMenuOpen = false;
    }
  }

  // Handle Escape key to close dropdown
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    saveDropdownOpen = false;
    exportMenuOpen = false;
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });
</script>

{#if fileManagerOpen}
  <FileManager
    bind:isOpen={fileManagerOpen}
    bind:startPoint
    bind:lines
    bind:shapes
    bind:sequence
    bind:secondStartPoint
    bind:secondLines
    bind:secondShapes
    bind:secondSequence
    bind:fieldPoints
  />
{/if}

<ExportCodeDialog
  bind:this={exportDialog}
  bind:isOpen={exportDialogOpen}
  {startPoint}
  {lines}
  {sequence}
/>

<SettingsDialog bind:isOpen={settingsOpen} bind:settings />

<div
  class="absolute top-0 left-0 w-full bg-[#1a1a1a]/95 backdrop-blur-sm text-[#d8d8d8] flex flex-row justify-between items-center px-6 py-3 border-b border-[#333333] shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.02)]"
>
  <!-- Title -->
  <div class="font-semibold flex flex-col justify-start items-start">
    <div class="flex flex-row items-center gap-2">
      <!-- File manager button -->
      <button
        title="File Manager"
        onclick={() => {
          exportDialogOpen = false;
          fileManagerOpen = true;
        }}
        class="console-icon-button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
      </button>

      <span>Pedro Pathing Visualizer</span>
      <!-- GitHub Repo Link (moved next to title) -->
      <a
        target="_blank"
        rel="noreferrer"
        title="GitHub Repo"
        href="https://github.com/Pedro-Pathing/Visualizer"
        class="inline-flex size-8 items-center justify-center rounded-lg p-1 text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-white"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 30 30"
          class="size-6 fill-current"
        >
          <path
            d="M15,3C8.373,3,3,8.373,3,15c0,5.623,3.872,10.328,9.092,11.63C12.036,26.468,12,26.28,12,26.047v-2.051 c-0.487,0-1.303,0-1.508,0c-0.821,0-1.551-0.353-1.905-1.009c-0.393-0.729-0.461-1.844-1.435-2.526 c-0.289-0.227-0.069-0.486,0.264-0.451c0.615,0.174,1.125,0.596,1.605,1.222c0.478,0.627,0.703,0.769,1.596,0.769 c0.433,0,1.081-0.025,1.691-0.121c0.328-0.833,0.895-1.6,1.588-1.962c-3.996-0.411-5.903-2.399-5.903-5.098 c0-1.162,0.495-2.286,1.336-3.233C9.053,10.647,8.706,8.73,9.435,8c1.798,0,2.885,1.166,3.146,1.481C13.477,9.174,14.461,9,15.495,9 c1.036,0,2.024,0.174,2.922,0.483C18.675,9.17,19.763,8,21.565,8c0.732,0.731,0.381,2.656,0.102,3.594 c0.836,0.945,1.328,2.066,1.328,3.226c0,2.697-1.904,4.684-5.894,5.097C18.199,20.49,19,22.1,19,23.313v2.734 c0,0.104-0.023,0.179-0.035,0.268C23.641,24.676,27,20.236,27,15C27,8.373,21.627,3,15,3z"
          ></path>
        </svg>
      </a>
      {#if $currentFilePath}
        <span class="text-neutral-400 font-light text-sm mx-2">/</span>
        <span
          class="text-sm font-normal text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white cursor-pointer"
          role="button"
          tabindex="0"
          title="Rename this path file"
          onclick={renameCurrentFile}
          onkeydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              renameCurrentFile();
            }
          }}
        >
          {basename($currentFilePath)}
          {#if $isUnsaved}
            <span class="text-amber-500 font-bold ml-1" title="Unsaved changes"
              >*</span
            >
          {/if}
        </span>
      {/if}
    </div>
  </div>

  <!-- Actions -->
  <div class="flex flex-row justify-end items-center gap-4">
    <div class="flex items-center gap-3">
      <!-- time estimate -->
      <div class="flex items-center gap-2 text-sm">
        <div class="text-neutral-600 dark:text-neutral-300">
          {#if timePrediction && timePrediction.totalTime > 0}
            {formatTime(elapsedSeconds)} / {formatTime(
              timePrediction.totalTime,
            )}
          {:else}
            {formatTime(0)} / {formatTime(0)}
          {/if}
        </div>
        <div class="text-neutral-500 dark:text-neutral-400">
          ({(timePrediction?.totalDistance ?? 0).toFixed(0)} in)
        </div>
      </div>

      {#if settings.experimentalFeatures?.optimize}
        <button
          class="console-trigger console-trigger--accent relative text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title="Optimize all paths"
          onclick={optimizeAllLines}
          disabled={optimizingAll}
        >
          {optimizingAll ? "Optimizing All…" : "Optimize All"}
        </button>
      {/if}

      <!-- Undo / Redo -->
      <div class="flex items-center gap-2">
        <button
          title="Undo"
          onclick={undoAction}
          disabled={!canUndo}
          class:opacity-50={!canUndo}
          class="console-icon-button disabled:cursor-not-allowed transition-all duration-250 hover:scale-105 active:scale-98"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 1 1 0 12h-3"
            />
          </svg>
        </button>
        <button
          title="Redo"
          onclick={redoAction}
          disabled={!canRedo}
          class:opacity-50={!canRedo}
          class="console-icon-button disabled:cursor-not-allowed transition-all duration-250 hover:scale-105 active:scale-98"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 9l6 6m0 0-6 6m6-6H9a6 6 0 1 1 0-12h3"
            />
          </svg>
        </button>
      </div>
    </div>

    <NavDivider />

    <ViewToggles {selectedGridSize} onCycleGridSize={cycleGridSize} />
    <NavDivider />

    <!-- Sidebar visibility toggles -->
    <div class="flex items-center gap-1">
      <button
        title={leftPanelHidden ? "Show left sidebar" : "Hide left sidebar"}
        aria-label={leftPanelHidden ? "Show left sidebar" : "Hide left sidebar"}
        aria-pressed={!leftPanelHidden}
        onclick={onToggleLeftPanel}
        class="console-icon-button"
        class:text-blue-500={!leftPanelHidden}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="4" width="18" height="16" rx="2"></rect>
          <line x1="9" y1="4" x2="9" y2="20"></line>
          {#if !leftPanelHidden}
            <line x1="5" y1="8" x2="7" y2="8"></line>
            <line x1="5" y1="12" x2="7" y2="12"></line>
          {/if}
        </svg>
      </button>
      <button
        title={rightPanelHidden ? "Show right sidebar" : "Hide right sidebar"}
        aria-label={rightPanelHidden
          ? "Show right sidebar"
          : "Hide right sidebar"}
        aria-pressed={!rightPanelHidden}
        onclick={onToggleRightPanel}
        class="console-icon-button"
        class:text-blue-500={!rightPanelHidden}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="4" width="18" height="16" rx="2"></rect>
          <line x1="15" y1="4" x2="15" y2="20"></line>
          {#if !rightPanelHidden}
            <line x1="17" y1="8" x2="19" y2="8"></line>
            <line x1="17" y1="12" x2="19" y2="12"></line>
          {/if}
        </svg>
      </button>
    </div>
    <NavDivider />

    <!-- Multiple Paths Toggle -->
    <button
      title="Manage Multiple Paths Visualization"
      onclick={() => (multiplePathsDialogOpen = true)}
      class="console-trigger relative text-sm"
      class:console-trigger--active={$activePaths.length > 0}
      class:console-trigger--muted={$activePaths.length === 0}
    >
      <div class="flex items-center gap-1.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z"
          />
        </svg>
        <span>Multiple Paths</span>
        {#if $activePaths.length > 0}
          <span class="console-badge ml-1 px-1.5 py-0.5 text-xs font-bold"
            >{$activePaths.length}</span
          >
        {/if}
      </div>
    </button>

    <NavDivider />

    <div class="flex items-center gap-3">
      <!-- Load trajectory from file -->
      <input
        id="file-input"
        type="file"
        accept=".pp"
        onchange={loadFile}
        class="hidden"
      />
      <label
        for="file-input"
        title="Load trajectory from a .pp file"
        class="console-icon-button cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>
      </label>

      <!-- Save dropdown -->
      <div class="relative">
        <button
          bind:this={saveButtonRef}
          title="Save options"
          onclick={() => (saveDropdownOpen = !saveDropdownOpen)}
          class="console-icon-button"
          aria-expanded={saveDropdownOpen}
          aria-label="Save options"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75h1.5m9 0h-9"
            />
          </svg>
        </button>

        <!-- Dropdown menu -->
        {#if saveDropdownOpen}
          <div
            bind:this={saveDropdownRef}
            class="console-panel console-menu absolute right-0 mt-2 w-48 z-50 animate-in fade-in slide-in-from-top-2 duration-300"
            role="menu"
          >
            <!-- Save option -->
            <button
              onclick={() => {
                saveProject();
                saveDropdownOpen = false;
              }}
              class="console-menu-item"
              role="menuitem"
              title="Save to current file"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75h1.5m9 0h-9"
                />
              </svg>
              <div class="flex flex-col">
                <span class="console-menu-item-title">Save</span>
                <span class="console-menu-item-subtitle">
                  {#if $currentFilePath}
                    Overwrite the current project file in app storage ({basename(
                      $currentFilePath,
                    )})
                  {:else}
                    No project file selected — this will download the path as a
                    new file to your computer
                  {/if}
                </span>
              </div>
            </button>

            <!-- Save As option -->
            <button
              onclick={() => {
                saveFileAs();
                saveDropdownOpen = false;
              }}
              class="console-menu-item"
              role="menuitem"
              title="Save as new file"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M17 16v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2m3-4H9a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1m-1 4l-3 3m0 0l-3-3m3 3V3"
                />
              </svg>
              <div class="flex flex-col">
                <span class="console-menu-item-title">Save As</span>
                <span class="console-menu-item-subtitle">
                  Create a new project file (choose a filename) or download a
                  new .pp to your computer
                </span>
              </div>
            </button>
          </div>
        {/if}
      </div>

      <div class="relative">
        <button
          bind:this={exportButtonRef}
          title="Export path"
          onclick={() => (exportMenuOpen = !exportMenuOpen)}
          class="console-icon-button"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
            />
          </svg>
        </button>

        {#if exportMenuOpen}
          <div
            bind:this={exportMenuRef}
            class="console-panel console-menu absolute right-0 mt-2 w-48 z-50"
          >
            <button
              onclick={() => handleExport("java")}
              class="console-menu-item"
            >
              Java Code
            </button>
            <button
              onclick={() => handleExport("kotlin")}
              class="console-menu-item"
            >
              Kotlin Code
            </button>
            <button
              onclick={() => handleExport("points")}
              class="console-menu-item"
            >
              Points Array
            </button>
            {#if showSequentialExport}
              <button
                onclick={() => handleExport("sequential")}
                class="console-menu-item"
              >
                Sequential Command
              </button>
            {/if}
            <button
              onclick={exportFieldAsImage}
              disabled={exportingFieldImage}
              class="console-menu-item"
            >
              {exportingFieldImage ? "Exporting…" : "Field as Image"}
            </button>
            <button
              onclick={async () => {
                exportMenuOpen = false;
                await exportPathAsGif();
              }}
              class="console-menu-item"
            >
              Path Animation as GIF
            </button>
          </div>
        {/if}
      </div>
    </div>

    <NavDivider />

    <div class="flex items-center gap-3">
      <!-- Delete/Reset path -->
      <button
        title="Delete/Reset path"
        onclick={handleResetPathWithConfirmation}
        class="console-icon-button relative group"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="red"
          class="size-6 stroke-red-500 hover:stroke-red-600 transition-colors"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>

        <!-- Tooltip for better UX -->
        <div
          class="absolute hidden group-hover:block bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-neutral-900 text-white text-xs text-center whitespace-normal max-w-48 shadow-md"
        >
          Reset path to default (with confirmation)
        </div>
      </button>

      <!-- Settings button -->
      <button
        title="Open Settings"
        onclick={() => (settingsOpen = true)}
        class="console-icon-button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><circle cx="12" cy="12" r="3"></circle><path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
          ></path></svg
        >
      </button>
    </div>
  </div>
</div>

<MultiplePathsDialog bind:isOpen={multiplePathsDialogOpen} />

<style>
  @keyframes rainbow-glow {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }
</style>
