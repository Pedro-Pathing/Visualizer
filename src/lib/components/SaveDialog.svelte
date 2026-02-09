<script lang="ts">
  import { onMount } from "svelte";
  import { fade, scale } from "svelte/transition";

  export let isOpen = false;
  export let fileName: string = "";
  export let isSaving: boolean = false;

  let inputValue = fileName;
  let inputElement: HTMLInputElement;

  $: if (isOpen && inputElement) {
    setTimeout(() => inputElement?.focus(), 0);
  }

  function handleSave() {
    if (inputValue.trim()) {
      const event = new CustomEvent("save", {
        detail: { fileName: inputValue.trim() },
      });
      window.dispatchEvent(event);
      close();
    }
  }

  function close() {
    isOpen = false;
    inputValue = "";
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      close();
    }
  }

  onMount(() => {
    if (isOpen) {
      inputValue = fileName;
    }
  });

  $: if (isOpen) {
    inputValue = fileName;
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-[1200] flex items-center justify-center"
    transition:fade={{ duration: 250 }}
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/40 backdrop-blur-sm"
      on:click={close}
      role="button"
      tabindex="0"
      on:keydown={() => {}}
      aria-label="Close save dialog"
      transition:fade={{ duration: 250 }}
    />

    <!-- Dialog -->
    <div
      class="relative bg-white dark:bg-neutral-900 rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden border border-neutral-200 dark:border-neutral-800"
      transition:scale={{ duration: 250, start: 0.95 }}
    >
      <!-- Header -->
      <div class="px-6 py-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-b border-neutral-200 dark:border-neutral-700">
        <h2 class="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 text-blue-600 dark:text-blue-400"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33A3 3 0 0116.5 19.5H6.75z"
            />
          </svg>
          Save Your Path
        </h2>
        <p class="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          Your path will be saved to the project storage
        </p>
      </div>

      <!-- Content -->
      <div class="px-6 py-5 space-y-4">
        <div>
          <label
            for="save-input"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            File name
          </label>
          <input
            bind:this={inputElement}
            bind:value={inputValue}
            id="save-input"
            type="text"
            placeholder="my_path"
            on:keydown={handleKeyDown}
            class="w-full px-4 py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-transparent transition-all duration-300"
          />
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5">
            .pp extension will be added automatically
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="px-6 py-4 bg-neutral-50 dark:bg-neutral-950 border-t border-neutral-200 dark:border-neutral-700 flex gap-3 justify-end">
        <button
          on:click={close}
          class="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-200 dark:bg-neutral-800 rounded-lg transition-all duration-250"
        >
          Cancel
        </button>
        <button
          on:click={handleSave}
          disabled={isSaving || !inputValue.trim()}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-600/90 disabled:bg-blue-400 disabled:cursor-not-allowed rounded-lg transition-all duration-300 flex items-center gap-2 active:scale-98"
        >
          {#if isSaving}
            <svg
              class="animate-spin size-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Saving...
          {:else}
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
            Save
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
