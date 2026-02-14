<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import * as browserFileStore from "../../utils/browserFileStore";
  import { activePaths } from "../../stores";

  export let isOpen = false;

  let files: browserFileStore.FileInfo[] = [];
  let selectedPaths: string[] = [];
  let loading = false;
  let errorMessage = "";

  const MAX_PATHS = 4;
  const PERFORMANCE_WARNING_THRESHOLD = 2;

  // Load files when dialog opens
  $: if (isOpen) {
    loadFiles();
    selectedPaths = $activePaths;
  }

  async function loadFiles() {
    loading = true;
    errorMessage = "";
    try {
      const allFiles = await browserFileStore.listFiles();
      files = allFiles.filter((f) => f.name.endsWith(".pp"));
    } catch (error) {
      console.error("Error loading files:", error);
      errorMessage = "Failed to load files";
    } finally {
      loading = false;
    }
  }

  function togglePath(filePath: string) {
    const index = selectedPaths.indexOf(filePath);
    if (index > -1) {
      selectedPaths = selectedPaths.filter((p) => p !== filePath);
    } else {
      if (selectedPaths.length >= MAX_PATHS) {
        alert(`Maximum of ${MAX_PATHS} paths can be selected at once.`);
        return;
      }
      selectedPaths = [...selectedPaths, filePath];
    }
  }

  function handleApply() {
    activePaths.set(selectedPaths);
    isOpen = false;
  }

  function handleClose() {
    isOpen = false;
  }

  function clearAll() {
    selectedPaths = [];
  }

  $: showPerformanceWarning = selectedPaths.length > PERFORMANCE_WARNING_THRESHOLD;
</script>

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    transition:fade={{ duration: 200, easing: cubicInOut }}
    class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[2000]"
    on:click={handleClose}
    role="dialog"
    aria-modal="true"
    aria-labelledby="multipaths-title"
  >
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      transition:fly={{ duration: 300, easing: cubicInOut, y: -20 }}
      class="bg-white dark:bg-neutral-800 rounded-lg shadow-2xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
      on:click|stopPropagation
      role="document"
    >
      <h2
        id="multipaths-title"
        class="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2"
      >
        Multiple Paths Visualization
      </h2>

      <p class="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        Select up to {MAX_PATHS} paths to visualize simultaneously.
      </p>

      <!-- Performance Warning -->
      {#if showPerformanceWarning}
        <div
          class="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg flex items-start gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div class="text-sm">
            <div class="font-semibold text-amber-800 dark:text-amber-300">
              Performance Warning
            </div>
            <div class="text-amber-700 dark:text-amber-400">
              Visualizing {selectedPaths.length} paths may impact performance. Consider
              reducing the number of paths if you experience lag.
            </div>
          </div>
        </div>
      {/if}

      <!-- Selected Count -->
      <div
        class="flex items-center justify-between mb-4 p-3 bg-neutral-100 dark:bg-neutral-700/50 rounded-lg"
      >
        <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Selected: <span class="text-lg font-bold text-purple-600 dark:text-purple-400"
            >{selectedPaths.length}</span
          >
          / {MAX_PATHS}
        </div>
        {#if selectedPaths.length > 0}
          <button
            on:click={clearAll}
            class="text-sm text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors underline"
          >
            Clear All
          </button>
        {/if}
      </div>

      <!-- Files List -->
      <div class="flex-1 overflow-y-auto mb-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
        {#if loading}
          <div class="p-8 text-center text-neutral-500 dark:text-neutral-400">
            Loading files...
          </div>
        {:else if errorMessage}
          <div class="p-8 text-center text-red-500">
            {errorMessage}
          </div>
        {:else if files.length === 0}
          <div class="p-8 text-center text-neutral-500 dark:text-neutral-400">
            No .pp files found. Create some paths first!
          </div>
        {:else}
          <div class="divide-y divide-neutral-200 dark:divide-neutral-700">
            {#each files as file (file.path)}
              {@const isSelected = selectedPaths.includes(file.path)}
              {@const selectionIndex = selectedPaths.indexOf(file.path)}
              <button
                on:click={() => togglePath(file.path)}
                class="w-full px-4 py-3 flex items-center gap-3 transition-all hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                class:bg-purple-50={isSelected}
                class:dark-selected={isSelected}
              >
                <!-- Checkbox -->
                <div class="flex-shrink-0">
                  {#if isSelected}
                    <div
                      class="size-6 rounded bg-purple-600 flex items-center justify-center text-white font-bold text-sm"
                    >
                      {selectionIndex + 1}
                    </div>
                  {:else}
                    <div
                      class="size-6 rounded border-2 border-neutral-300 dark:border-neutral-600"
                    />
                  {/if}
                </div>

                <!-- File Info -->
                <div class="flex-1 text-left">
                  <div
                    class="font-medium text-neutral-900 dark:text-neutral-100"
                    class:text-purple-700={isSelected}
                    class:dark:text-purple-300={isSelected}
                  >
                    {file.name}
                  </div>
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>

                <!-- Selection Badge -->
                {#if isSelected}
                  <div
                    class="flex-shrink-0 px-2 py-1 bg-purple-600 text-white text-xs font-semibold rounded"
                  >
                    Path {selectionIndex + 1}
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-3">
        <button
          on:click={handleClose}
          class="px-4 py-2 rounded-lg text-neutral-700 dark:text-neutral-300 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          on:click={handleApply}
          class="px-4 py-2 rounded-lg text-white bg-purple-600 hover:bg-purple-700 transition-colors font-medium"
        >
          Apply ({selectedPaths.length} path{selectedPaths.length !== 1 ? "s" : ""})
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.dark) .dark-selected {
    background-color: rgb(88 28 135 / 0.2); /* purple-900/20 */
  }
</style>
