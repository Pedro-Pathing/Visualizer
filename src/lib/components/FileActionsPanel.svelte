<script lang="ts">
  import {
    Copy,
    Download,
    FilePlus,
    HardDriveDownload,
    Pencil,
    Save,
    Trash2,
  } from "@lucide/svelte";
  import type { FileInfo } from "../../types";
  import { PROJECT_EXTENSION } from "../../utils/filename";
  import Button from "./ui/Button.svelte";
  import IconButton from "./ui/IconButton.svelte";
  import { labelClass } from "./ui/styles";

  interface Props {
    selectedFile: FileInfo | null;
    onRename: (file: FileInfo) => void;
    onDelete: (file: FileInfo) => void;
    onDuplicate: () => void;
    onOverwrite: () => void;
    onNew: () => void;
    onDownload: () => void;
    onSaveToLocalFile: () => void;
  }

  let {
    selectedFile,
    onRename,
    onDelete,
    onDuplicate,
    onOverwrite,
    onNew,
    onDownload,
    onSaveToLocalFile,
  }: Props = $props();
</script>

<div class="flex shrink-0 flex-col gap-3 border-t border-border p-3">
  {#if selectedFile}
    {@const file = selectedFile}
    <div class="flex items-center gap-1">
      <span
        class="min-w-0 flex-1 truncate font-mono text-xs text-heading"
        title={file.name}
      >
        {file.name}
      </span>
      <IconButton
        label="Rename this file"
        size="sm"
        onclick={() => onRename(file)}
      >
        <Pencil />
      </IconButton>
      <IconButton label="Duplicate this file" size="sm" onclick={onDuplicate}>
        <Copy />
      </IconButton>
      <IconButton
        label="Delete this file"
        size="sm"
        class="hover:text-danger!"
        onclick={() => onDelete(file)}
      >
        <Trash2 />
      </IconButton>
    </div>

    <div class="flex flex-col gap-1.5">
      <span class={labelClass}>Save</span>
      <div class="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          title="Save into the selected file"
          onclick={onOverwrite}
        >
          <Save class="size-3.5" />
          Overwrite
        </Button>
        <Button size="sm" title="Create a new file" onclick={onNew}>
          <FilePlus class="size-3.5" />
          New
        </Button>
        <Button
          size="sm"
          title={`Download as a ${PROJECT_EXTENSION} file`}
          onclick={onDownload}
        >
          <Download class="size-3.5" />
          Download
        </Button>
        <Button
          size="sm"
          title="Overwrite a file on this computer"
          onclick={onSaveToLocalFile}
        >
          <HardDriveDownload class="size-3.5" />
          Local file
        </Button>
      </div>
    </div>
  {:else}
    <p class="text-center text-xs text-body">Select a file to manage it.</p>
  {/if}
</div>
