<script lang="ts">
  import type { Point, Line, Shape, Settings, SequenceItem } from "../types";
  import { onMount, onDestroy } from "svelte";
  import {
    showRuler,
    showProtractor,
    showGrid,
    protractorLockToRobot,
    gridSize,
    currentFilePath,
    isUnsaved,
    snapToGrid,
    coordinateSystem,
    dualPathMode,
    activePaths,
  } from "../stores";
  import { getRandomColor } from "../utils";
  import {
    getDefaultStartPoint,
    getDefaultLines,
    getDefaultShapes,
  } from "../config";
  import FileManager from "./FileManager.svelte";
  import SettingsDialog from "./components/SettingsDialog.svelte";
  import ExportCodeDialog from "./components/ExportCodeDialog.svelte";
  import MultiplePathsDialog from "./components/MultiplePathsDialog.svelte";
  import { calculatePathTime, formatTime } from "../utils";
  import html2canvas from "html2canvas";

  export let loadFile: (evt: any) => any;

  export let startPoint: Point;
  export let lines: Line[];
  export let shapes: Shape[];
  export let sequence: SequenceItem[];
  export let secondStartPoint: Point | null = null;
  export let secondLines: Line[] = [];
  export let secondShapes: Shape[] = [];
  export let secondSequence: SequenceItem[] = [];
  export let percent: number = 0;
  export let robotWidth: number;
  export let robotHeight: number;
  export let settings: Settings;

  export let saveProject: () => any;
  export let saveFileAs: () => any;
  export let undoAction: () => any;
  export let redoAction: () => any;
  export let recordChange: () => any;
  export let canUndo: boolean;
  export let canRedo: boolean;
  export let optimizeAllLines: () => Promise<void>;
  export let optimizingAll: boolean = false;
  export let twoElement: HTMLDivElement | null = null;
  export let playing: boolean = false;
  export let play: () => void;
  export let pause: () => void;

  let fileManagerOpen = false;
  let settingsOpen = false;
  let exportMenuOpen = false;
  let exportDialogOpen = false;
  let exportDialog: ExportCodeDialog;
  let multiplePathsDialogOpen = false;
  // Hide sequential export UI by default; backend generator remains available
  const showSequentialExport = false;

  let saveDropdownOpen = false;
  let saveDropdownRef: HTMLElement;
  let saveButtonRef: HTMLElement;

  let selectedGridSize = 12;
  const gridSizeOptions = [0, 1, 3, 6, 12, 24];

  // Ensure File Manager and Export dialog are mutually exclusive
  $: if (fileManagerOpen && exportDialogOpen) {
    exportDialogOpen = false;
  }

  // Ensure save dropdown and export menu are mutually exclusive
  $: if (saveDropdownOpen && exportMenuOpen) {
    exportMenuOpen = false;
  }

  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);
  $: elapsedSeconds = (percent / 100) * (timePrediction?.totalTime || 0);

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

  function handleExport(format: "java" | "points" | "sequential") {
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

    try {
      // Use html2canvas to capture the entire field including background, paths, and robots
      const canvas = await html2canvas(twoElement, {
        backgroundColor: null,
        scale: 2, // 2x resolution for better quality
        logging: false,
        useCORS: true, // Allow cross-origin images
        allowTaint: true,
      });

      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        if (blob) {
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          const fileName = $currentFilePath
            ? $currentFilePath.split(/[\/\\]/).pop()?.replace(/\.pp$/, "")
            : "field";
          link.download = `${fileName}_field.png`;
          link.href = downloadUrl;
          link.click();
          URL.revokeObjectURL(downloadUrl);
        } else {
          alert("Failed to create image blob.");
        }
      });
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export field as image: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  function resetPath() {
    startPoint = getDefaultStartPoint();
    lines = getDefaultLines();
    sequence = lines.map((ln) => ({
      kind: "path",
      lineId: ln.id || `line-${Math.random().toString(36).slice(2)}`,
    }));
    shapes = getDefaultShapes();
  }

  function handleResetPathWithConfirmation() {
    // Check if there's unsaved work
    const hasChanges = $isUnsaved || lines.length > 1 || shapes.length > 0;

    let message = "Are you sure you want to reset the path?\n\n";

    if (hasChanges) {
      if ($currentFilePath) {
        message += `This will reset "${$currentFilePath.split(/[\\/]/).pop()}" to the default path.`;
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

  $: if (settings) {
    settings.rHeight = robotHeight;
    settings.rWidth = robotWidth;
  }

  function handleClickOutside(event: MouseEvent) {
    if (
      saveDropdownOpen &&
      saveDropdownRef &&
      !saveDropdownRef.contains(event.target as Node) &&
      saveButtonRef &&
      !saveButtonRef.contains(event.target as Node)
    ) {
      saveDropdownOpen = false;
    }
  }

  // Handle Escape key to close dropdown
  function handleKeyDown(event: KeyboardEvent) {
    if (saveDropdownOpen && event.key === "Escape") {
      saveDropdownOpen = false;
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });

  type GlowButtonEl = HTMLElement & { dataset: DOMStringMap & { prevOverflow?: string } };

  function handleOptimizeEnter(event: MouseEvent) {
    const el = event.currentTarget as GlowButtonEl;
    el.style.background =
      "linear-gradient(120deg, #ff5f6d, #ffc371, #47e1a8, #5f8bff, #c471ed, #f64f59)";
    el.style.backgroundSize = "400% 400%";
    el.style.animation = "rainbow-glow 1.2s ease infinite";
    el.style.boxShadow =
      "0 0 18px rgba(255,255,255,0.9), 0 0 40px rgba(255,255,255,0.45)";
    el.dataset.prevOverflow = el.style.overflow;
    el.style.overflow = "hidden";
  }

  function handleOptimizeMove(event: MouseEvent) {
    const el = event.currentTarget as GlowButtonEl;
    const rect = el.getBoundingClientRect();
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    el.style.backgroundPosition = `${xPct}% ${yPct}%`;
  }

  function handleOptimizeLeave(event: MouseEvent) {
    const el = event.currentTarget as GlowButtonEl;
    el.style.background = "";
    el.style.backgroundPosition = "";
    el.style.animation = "";
    el.style.boxShadow = "0 0 8px rgba(255,255,255,0.2)";
    el.style.overflow = el.dataset.prevOverflow || "hidden";
  }
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
  />
{/if}

<ExportCodeDialog
  bind:this={exportDialog}
  bind:isOpen={exportDialogOpen}
  bind:startPoint
  bind:lines
  bind:sequence
/>

<SettingsDialog bind:isOpen={settingsOpen} bind:settings />

<div
  class="absolute top-0 left-0 w-full bg-neutral-50 dark:bg-neutral-900 shadow-md flex flex-row justify-between items-center px-6 py-4 border-b-[0.75px] border-[#b300e6]"
>
  <!-- Title -->
  <div class="font-semibold flex flex-col justify-start items-start">
    <div class="flex flex-row items-center gap-2">
      <!-- File manager button -->
      <button
        title="File Manager"
        on:click={() => {
          exportDialogOpen = false;
          fileManagerOpen = true;
        }}
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
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 30 30"
          class="size-6 dark:fill-white"
        >
          <path
            d="M15,3C8.373,3,3,8.373,3,15c0,5.623,3.872,10.328,9.092,11.63C12.036,26.468,12,26.28,12,26.047v-2.051 c-0.487,0-1.303,0-1.508,0c-0.821,0-1.551-0.353-1.905-1.009c-0.393-0.729-0.461-1.844-1.435-2.526 c-0.289-0.227-0.069-0.486,0.264-0.451c0.615,0.174,1.125,0.596,1.605,1.222c0.478,0.627,0.703,0.769,1.596,0.769 c0.433,0,1.081-0.025,1.691-0.121c0.328-0.833,0.895-1.6,1.588-1.962c-3.996-0.411-5.903-2.399-5.903-5.098 c0-1.162,0.495-2.286,1.336-3.233C9.053,10.647,8.706,8.73,9.435,8c1.798,0,2.885,1.166,3.146,1.481C13.477,9.174,14.461,9,15.495,9 c1.036,0,2.024,0.174,2.922,0.483C18.675,9.17,19.763,8,21.565,8c0.732,0.731,0.381,2.656,0.102,3.594 c0.836,0.945,1.328,2.066,1.328,3.226c0,2.697-1.904,4.684-5.894,5.097C18.199,20.49,19,22.1,19,23.313v2.734 c0,0.104-0.023,0.179-0.035,0.268C23.641,24.676,27,20.236,27,15C27,8.373,21.627,3,15,3z"
          ></path>
        </svg>
      </a>
      {#if $currentFilePath}
        <span class="text-neutral-400 font-light text-sm mx-2">/</span>
        <span
          class="text-sm font-normal text-neutral-600 dark:text-neutral-300"
        >
          {$currentFilePath.split(/[\\/]/).pop()}
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
              {formatTime(elapsedSeconds)} / {formatTime(timePrediction.totalTime)}
            {:else}
              {formatTime(0)} / {formatTime(0)}
            {/if}
        </div>
        <div class="text-neutral-500 dark:text-neutral-400">
            ({(timePrediction?.totalDistance ?? 0).toFixed(0)} in)
        </div>
      </div>

      <button
        class="relative px-3 py-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200 bg-neutral-200/80 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 rounded-full shadow-sm hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Optimize all paths"
        on:click={optimizeAllLines}
        disabled={optimizingAll}
        style="box-shadow: 0 0 8px rgba(255,255,255,0.2)"
        on:mouseenter={handleOptimizeEnter}
        on:mousemove={handleOptimizeMove}
        on:mouseleave={handleOptimizeLeave}
      >
        {optimizingAll ? "Optimizing All…" : "Optimize All"}
      </button>

      <!-- Undo / Redo -->
      <div class="flex items-center gap-2">
        <button
          title="Undo"
          on:click={undoAction}
          disabled={!canUndo}
          class:opacity-50={!canUndo}
          class="disabled:cursor-not-allowed transition-all duration-250 hover:scale-105 active:scale-98"
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
          on:click={redoAction}
          disabled={!canRedo}
          class:opacity-50={!canRedo}
          class="disabled:cursor-not-allowed transition-all duration-250 hover:scale-105 active:scale-98"
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

    <!-- Divider -->
    <div
      class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-4"
      aria-hidden="true"
    ></div>

    <!-- Snap to grid toggle -->
    {#if $showGrid}
      <button
        title={$snapToGrid ? "Disable Snap to Grid" : "Enable Snap to Grid"}
        on:click={() => snapToGrid.update((v) => !v)}
        class:text-green-500={$snapToGrid && $showGrid}
        class:text-gray-400={!$showGrid}
        class:opacity-50={!$showGrid}
        disabled={!$showGrid}
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
          <!-- When snapped, show magnet icon -->
          <path
            d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"
          ></path>
          <path d="m5 8 4 4"></path>
          <path d="m12 15 4 4"></path>

          <!-- If the snap is disabled, turn the icon grey, not white -->
          {#if !$snapToGrid}
            <line x1="23" y1="23" x2="1" y2="1"></line>
            class="opacity-50"
          {/if}
        </svg>
      </button>
    {/if}

    <!-- Grid toggle -->
    <button
      title={$showGrid ? `Grid: ${selectedGridSize}" (click to cycle)` : "Toggle Grid"}
      on:click={cycleGridSize}
      class:text-blue-500={$showGrid}
      class="relative"
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
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="3" y1="15" x2="21" y2="15"></line>
        <line x1="9" y1="3" x2="9" y2="21"></line>
        <line x1="15" y1="3" x2="15" y2="21"></line>
      </svg>
      {#if $showGrid}
        <span class="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs font-semibold whitespace-nowrap">
          {selectedGridSize}"
        </span>
      {/if}
    </button>

    <!-- Ruler toggle -->
    <button
      title="Toggle Ruler"
      on:click={() => showRuler.update((v) => !v)}
      class:text-blue-500={$showRuler}
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
        <path
          d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0z"
        ></path>
        <path d="m14.5 12.5 2-2"></path>
        <path d="m11.5 9.5 2-2"></path>
        <path d="m8.5 6.5 2-2"></path>
        <path d="m17.5 15.5 2-2"></path>
      </svg>
    </button>

    <!-- Protractor lock to robot toggle -->
    {#if $showProtractor}
      <button
        title={$protractorLockToRobot
          ? "Unlock Protractor from Robot"
          : "Lock Protractor to Robot"}
        on:click={() => protractorLockToRobot.update((v) => !v)}
        class:text-amber-500={$protractorLockToRobot}
      >
        {#if $protractorLockToRobot}
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
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        {:else}
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
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
          </svg>
        {/if}
      </button>
    {/if}

    <!-- Protractor toggle -->

    <button
      title="Toggle Protractor"
      on:click={() => showProtractor.update((v) => !v)}
      class:text-blue-500={$showProtractor}
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
        <path d="M12 21a9 9 0 1 1 0-18c2.52 0 4.93 1 6.74 2.74L21 8"></path>
        <path d="M12 3v6l3.7 2.7"></path>
      </svg>
    </button>

    <!-- Divider -->
    <div
      class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-4"
      aria-hidden="true"
    ></div>

    <!-- Coordinate System Selector -->
    <div class="flex items-center gap-2">
      <span class="text-[10px] font-bold text-neutral-500 uppercase tracking-tighter">System</span>
      <select
        bind:value={$coordinateSystem}
        class="bg-neutral-100 dark:bg-neutral-800 text-xs font-bold px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
      >
        <option value="ftc">FTC (-72 to 72)</option>
        <option value="pedro">Pedro (0 to 144)</option>
      </select>
    </div>

    <!-- Divider -->
    <div
      class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-4"
      aria-hidden="true"
    ></div>

    <!-- Multiple Paths Toggle -->
    <button
      title="Manage Multiple Paths Visualization"
      on:click={() => (multiplePathsDialogOpen = true)}
      class="relative px-3 py-1.5 rounded-lg font-medium text-sm transition-all duration-200 shadow-sm hover:shadow-md"
      class:bg-purple-500={$activePaths.length > 0}
      class:text-white={$activePaths.length > 0}
      class:hover:bg-purple-600={$activePaths.length > 0}
      class:bg-neutral-200={$activePaths.length === 0}
      class:dark:bg-neutral-700={$activePaths.length === 0}
      class:text-neutral-700={$activePaths.length === 0}
      class:dark:text-neutral-200={$activePaths.length === 0}
      class:hover:bg-neutral-300={$activePaths.length === 0}
      class:dark:hover:bg-neutral-600={$activePaths.length === 0}
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
          <span class="ml-1 px-1.5 py-0.5 bg-white/20 text-xs font-bold rounded">{$activePaths.length}</span>
        {/if}
      </div>
    </button>

    <!-- Divider -->
    <div
      class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-4"
      aria-hidden="true"
    ></div>

    <div class="flex items-center gap-3">
      <!-- Load trajectory from file -->
      <input
        id="file-input"
        type="file"
        accept=".pp"
        on:change={loadFile}
        class="hidden"
      />
      <label
        for="file-input"
        title="Load trajectory from a .pp file"
        class="cursor-pointer"
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
          on:click={() => (saveDropdownOpen = !saveDropdownOpen)}
          class="flex items-center gap-1 px-2 py-1 rounded transition-colors duration-250"
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-4 transition-transform duration-200"
            class:rotate-180={saveDropdownOpen}
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        <!-- Dropdown menu -->
        {#if saveDropdownOpen}
          <div
            bind:this={saveDropdownRef}
            class="absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-md shadow-lg py-1 z-50 border border-neutral-200 dark:border-neutral-700 animate-in fade-in slide-in-from-top-2 duration-300"
            role="menu"
          >
            <!-- Save option -->
            <button
              on:click={() => {
                saveProject();
                saveDropdownOpen = false;
              }}
              class="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-250"
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
                <span class="font-medium">Save</span>
                <span class="text-xs text-neutral-500 dark:text-neutral-400">
                  {#if $currentFilePath}
                    Overwrite the current project file in app storage ({$currentFilePath.split(/[\/]/).pop()})
                  {:else}
                    No project file selected — this will download the path as a new file to your computer
                  {/if}
                </span>
              </div>
            </button>

            <!-- Save As option -->
            <button
              on:click={() => {
                saveFileAs();
                saveDropdownOpen = false;
              }}
              class="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-250"
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
                <span class="font-medium">Save As</span>
                <span class="text-xs text-neutral-500 dark:text-neutral-400">
                  Create a new project file (choose a filename) or download a new .pp to your computer
                </span>
              </div>
            </button>
          </div>
        {/if}
      </div>

      <div class="relative">
        <button
          title="Export path"
          on:click={() => (exportMenuOpen = !exportMenuOpen)}
          class="flex items-center gap-1"
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
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        {#if exportMenuOpen}
          <div
            class="absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-md shadow-lg py-1 z-50 border border-neutral-200 dark:border-neutral-700"
          >
            <button
              on:click={() => handleExport("java")}
              class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-250"
            >
              Java Code
            </button>
            <button
              on:click={() => handleExport("points")}
              class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-250"
            >
              Points Array
            </button>
            {#if showSequentialExport}
              <button
                on:click={() => handleExport("sequential")}
                class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-250"
              >
                Sequential Command
              </button>
            {/if}
            <button
              on:click={exportFieldAsImage}
              class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-250"
            >
              Field as Image
            </button>
          </div>
        {/if}
      </div>
    </div>

    <div
      class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-4"
      aria-hidden="true"
    ></div>

    <div class="flex items-center gap-3">
      <!-- Delete/Reset path -->
      <button
        title="Delete/Reset path"
        on:click={handleResetPathWithConfirmation}
        class="relative group"
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
          class="absolute hidden group-hover:block bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-neutral-900 text-white text-xs rounded text-center whitespace-normal max-w-[12rem] shadow-md"
        >
          Reset path to default (with confirmation)
        </div>
      </button>

      <!-- Settings button -->
      <button title="Open Settings" on:click={() => (settingsOpen = true)}>
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
