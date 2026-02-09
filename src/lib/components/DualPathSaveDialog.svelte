<script lang="ts">
  import { fade, scale } from "svelte/transition";

  export let isOpen = false;

  function handleSaveFirst() {
    const event = new CustomEvent("saveDualPath", {
      detail: { target: "first" },
    });
    window.dispatchEvent(event);
    isOpen = false;
  }

  function handleSaveSecond() {
    const event = new CustomEvent("saveDualPath", {
      detail: { target: "second" },
    });
    window.dispatchEvent(event);
    isOpen = false;
  }

  function handleSaveBoth() {
    const event = new CustomEvent("saveDualPath", {
      detail: { target: "both" },
    });
    window.dispatchEvent(event);
    isOpen = false;
  }

  function close() {
    isOpen = false;
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    transition:fade={{ duration: 150 }}
    on:click={close}
    role="presentation"
  >
    <div
      class="bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
      transition:scale={{ duration: 200, start: 0.95 }}
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="dialog"
      aria-modal="true"
    >
      <h2 class="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
        Save Path Changes
      </h2>

      <p class="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
        Which path would you like to save?
      </p>

      <div class="space-y-3">
        <button
          on:click={handleSaveFirst}
          class="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium"
        >
          Save First Path Only
        </button>

        <button
          on:click={handleSaveSecond}
          class="w-full px-4 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium"
        >
          Save Second Path Only
        </button>

        <button
          on:click={handleSaveBoth}
          class="w-full px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium"
        >
          Save Both Paths
        </button>

        <button
          on:click={close}
          class="w-full px-4 py-3 bg-neutral-300 dark:bg-neutral-600 hover:bg-neutral-400 dark:hover:bg-neutral-500 text-neutral-900 dark:text-white rounded-lg transition-colors text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
</style>
