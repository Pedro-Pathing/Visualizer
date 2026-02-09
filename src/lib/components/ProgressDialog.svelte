<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";

  export let isOpen = false;
  export let progress = 0;
  export let statusMessage = "Processing...";
  export let onCancel: () => void = () => {};

  $: progressPercentage = Math.round(progress * 100);
</script>

{#if isOpen}
  <div
    transition:fade={{ duration: 200, easing: cubicInOut }}
    class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[2000]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="progress-title"
  >
    <div
      transition:fly={{ duration: 300, easing: cubicInOut, y: -20 }}
      class="bg-white dark:bg-neutral-800 rounded-lg shadow-2xl p-6 w-full max-w-md mx-4"
      role="document"
    >
      <h2
        id="progress-title"
        class="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4"
      >
        Exporting GIF
      </h2>

      <div class="mb-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-sm text-neutral-700 dark:text-neutral-300">
            {statusMessage}
          </span>
          <span class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {progressPercentage}%
          </span>
        </div>

        <!-- Progress bar -->
        <div class="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-3 overflow-hidden">
          <div
            class="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full transition-all duration-300 ease-out"
            style="width: {progressPercentage}%"
          />
        </div>
      </div>

      <div class="flex justify-end">
        <button
          on:click={onCancel}
          class="px-4 py-2 rounded-lg text-neutral-700 dark:text-neutral-300 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
