<script lang="ts">
  import Modal from "./ui/Modal.svelte";
  import SpinnerIcon from "./icons/SpinnerIcon.svelte";
  import PlusIcon from "./icons/PlusIcon.svelte";

  interface Props {
    isOpen?: boolean;
    fileName?: string;
    isSaving?: boolean;
    onSave: (fileName: string) => void;
  }

  let {
    isOpen = $bindable(false),
    fileName = "",
    isSaving = false,
    onSave,
  }: Props = $props();

  // Seeded from `fileName` each time the dialog opens (see below).
  let inputValue = $state("");
  let inputElement = $state<HTMLInputElement>();

  $effect.pre(() => {
    if (isOpen && inputElement) {
      setTimeout(() => inputElement?.focus(), 0);
    }
  });

  $effect.pre(() => {
    if (isOpen) {
      inputValue = fileName;
    }
  });

  function handleSave() {
    if (inputValue.trim()) {
      onSave(inputValue.trim());
      close();
    }
  }

  function close() {
    isOpen = false;
    inputValue = "";
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") handleSave();
  }
</script>

<Modal
  {isOpen}
  titleId="save-dialog-title"
  onClose={close}
  panelClass="console-panel max-w-md w-full mx-4 overflow-hidden"
>
  <!-- Header -->
  <div class="px-6 py-4 border-b border-[#333333]">
    <h2
      id="save-dialog-title"
      class="text-lg font-semibold text-[#e8e8e8] flex items-center gap-2"
    >
      Save Your Path
    </h2>
    <p class="text-sm text-[#888888] mt-1">
      Your path will be saved to the project storage
    </p>
  </div>

  <!-- Content -->
  <div class="px-6 py-5 space-y-4">
    <div>
      <label
        for="save-input"
        class="block text-sm font-medium text-[#d0d0d0] mb-2"
      >
        File name
      </label>
      <input
        bind:this={inputElement}
        bind:value={inputValue}
        id="save-input"
        type="text"
        placeholder="my_path"
        onkeydown={handleKeyDown}
        class="console-input px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <p class="text-xs text-[#888888] mt-1.5">
        .pp extension will be added automatically
      </p>
    </div>
  </div>

  <!-- Actions -->
  <div class="px-6 py-4 border-t border-[#333333] flex gap-3 justify-end">
    <button onclick={close} class="console-action">Cancel</button>
    <button
      onclick={handleSave}
      disabled={isSaving || !inputValue.trim()}
      class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-600/90 disabled:bg-blue-400 disabled:cursor-not-allowed rounded-lg transition-all duration-300 flex items-center gap-2 active:scale-98"
    >
      {#if isSaving}
        <SpinnerIcon className="animate-spin size-4" />
        Saving...
      {:else}
        <PlusIcon className="size-4" strokeWidth={2} />
        Save
      {/if}
    </button>
  </div>
</Modal>

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
