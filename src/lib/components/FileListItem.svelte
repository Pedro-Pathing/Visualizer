<script lang="ts">
  import { stopPropagation } from "svelte/legacy";

  import type { FileInfo } from "../../types";
  import PencilIcon from "./icons/PencilIcon.svelte";
  import TrashIcon from "./icons/TrashIcon.svelte";

  interface Props {
    file: FileInfo;
    isPrimary?: boolean;
    renaming?: boolean;
    renameValue?: string;
    formatFileSize: (bytes: number) => string;
    formatDate: (date: Date) => string;
    onActivate: (file: FileInfo) => void;
    onStartRename: (file: FileInfo) => void;
    onConfirmRename: () => void;
    onCancelRename: () => void;
    onDelete: (file: FileInfo) => void;
  }

  let {
    file,
    isPrimary = false,
    renaming = false,
    renameValue = $bindable(""),
    formatFileSize,
    formatDate,
    onActivate,
    onStartRename,
    onConfirmRename,
    onCancelRename,
    onDelete,
  }: Props = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") onActivate(file);
  }

  function handleRenameKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") onConfirmRename();
    if (event.key === "Escape") onCancelRename();
  }
</script>

<div
  class="file-row group cursor-pointer px-3 py-2"
  onclick={() => onActivate(file)}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
  aria-label={`Open ${file.name}`}
  class:file-row--primary={isPrimary}
>
  {#if renaming}
    <!-- Rename Input -->
    <div class="space-y-2">
      <input
        bind:value={renameValue}
        class="console-input px-2 py-1 text-sm"
        onkeydown={handleRenameKeydown}
      />
      <div class="flex gap-2">
        <button
          onclick={stopPropagation(onConfirmRename)}
          class="console-action console-action--accent console-action--compact flex-1"
        >
          Save
        </button>
        <button
          onclick={stopPropagation(onCancelRename)}
          class="console-action console-action--compact flex-1"
        >
          Cancel
        </button>
      </div>
    </div>
  {:else}
    <!-- Normal File Display -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="file-row-name truncate" title={file.name}>
          {file.name}
          {#if file.error}
            <span class="ml-2 text-xs text-[#f4c6c6]">({file.error})</span>
          {/if}
        </div>
        <div
          class="file-row-meta group-hover:block hidden"
          title="{formatFileSize(file.size)} • {formatDate(file.modified)}"
        >
          {formatFileSize(file.size)} • {formatDate(file.modified)}
        </div>
      </div>

      <div
        class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button
          onclick={stopPropagation(() => onStartRename(file))}
          class="file-icon-btn shrink-0"
          title="Rename file"
        >
          <PencilIcon />
        </button>

        <button
          onclick={stopPropagation(() => onDelete(file))}
          class="file-icon-btn file-icon-btn--danger shrink-0"
          title="Delete file"
        >
          <TrashIcon className="size-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  {/if}
</div>
