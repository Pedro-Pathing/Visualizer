<script lang="ts">
  import { Pencil, Trash2 } from "@lucide/svelte";
  import type { FileInfo } from "../../types";
  import IconButton from "./ui/IconButton.svelte";

  interface Props {
    file: FileInfo;
    isPrimary?: boolean;
    onActivate: (file: FileInfo) => void;
    onRename: (file: FileInfo) => void;
    onDelete: (file: FileInfo) => void;
  }

  let {
    file,
    isPrimary = false,
    onActivate,
    onRename,
    onDelete,
  }: Props = $props();

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(date: Date): string {
    return date.toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
</script>

<div
  class={[
    "group flex items-center gap-1 rounded-lg pr-1 transition",
    isPrimary ? "bg-primary/12 text-heading" : "text-body hover:bg-body/10",
  ]}
>
  <button
    type="button"
    class="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    aria-current={isPrimary || undefined}
    title={`Open ${file.name}`}
    onclick={() => onActivate(file)}
  >
    <span
      class={[
        "truncate text-sm",
        isPrimary ? "font-medium text-primary" : "text-heading",
      ]}
    >
      {file.name}
    </span>
    <span class="font-mono text-[11px] tabular-nums opacity-70">
      {formatSize(file.size)} · {formatDate(file.modified)}
    </span>
  </button>

  <div
    class="flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
  >
    <IconButton label="Rename file" size="sm" onclick={() => onRename(file)}>
      <Pencil />
    </IconButton>
    <IconButton
      label="Delete file"
      size="sm"
      class="hover:text-danger!"
      onclick={() => onDelete(file)}
    >
      <Trash2 />
    </IconButton>
  </div>
</div>
