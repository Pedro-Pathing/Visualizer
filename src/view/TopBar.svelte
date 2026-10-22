<script lang="ts">
  import { Download, Redo2, Settings, Undo2 } from "@lucide/svelte";
  import { PROJECT_VERSION } from "../io";
  import { currentFilePath } from "../stores";
  import { basename } from "../utils/filename";
  import { useProject } from "../state/project.svelte";
  import IconButton from "../lib/components/ui/IconButton.svelte";
  import Menu from "../lib/components/ui/Menu.svelte";
  import type { MenuEntry } from "../lib/components/ui/menu";
  import { actionById, menuItem, type Action } from "./actions";

  interface Props {
    actions: Action[];
  }

  let { actions }: Props = $props();

  const project = useProject();
  const action = (id: string) => actionById(actions, id);
  const items = (...ids: (string | "separator")[]): MenuEntry[] =>
    ids.map((id) => (id === "separator" ? id : menuItem(action(id))));

  let fileEntries = $derived(
    items(
      "file.new",
      "file.open",
      "file.import",
      "separator",
      "file.save",
      "file.saveAs",
      "file.rename",
      "separator",
      "app.palette",
    ),
  );
  let exportEntries = $derived(
    items(
      "export.java",
      "export.kotlin",
      "export.points",
      "separator",
      "export.image",
      "export.gif",
    ),
  );
  let undo = $derived(menuItem(action("edit.undo")));
  let redo = $derived(menuItem(action("edit.redo")));
</script>

<header
  class="fixed inset-x-0 top-0 z-100 flex h-14 items-center justify-between gap-4 border-b border-border bg-surface/80 px-4 backdrop-blur"
>
  <div class="flex min-w-0 items-center gap-3">
    <div class="flex items-baseline gap-2 pr-2">
      <span class="text-sm font-semibold whitespace-nowrap text-heading">
        Pedro Pathing Visualizer
      </span>
      <span class="font-mono text-[11px] text-body">v{PROJECT_VERSION}</span>
    </div>
    <Menu label="File" entries={fileEntries} />
    <span
      class="truncate text-sm text-body"
      title={$currentFilePath ?? "Not saved yet"}
    >
      {basename($currentFilePath) || "Untitled"}
      {#if project.dirty}
        <span class="text-primary" title="Unsaved changes">•</span>
      {/if}
    </span>
  </div>

  <div class="flex items-center gap-1">
    <IconButton
      label={`Undo${undo.hint ? ` (${undo.hint})` : ""}`}
      disabled={undo.disabled}
      onclick={undo.run}
    >
      <Undo2 />
    </IconButton>
    <IconButton
      label={`Redo${redo.hint ? ` (${redo.hint})` : ""}`}
      disabled={redo.disabled}
      onclick={redo.run}
    >
      <Redo2 />
    </IconButton>
    <div class="mx-1.5 h-5 w-px bg-border"></div>
    <Menu label="Export" entries={exportEntries} align="end">
      {#snippet icon()}<Download />{/snippet}
    </Menu>
    <IconButton label="Settings" onclick={action("app.settings").run}>
      <Settings />
    </IconButton>
  </div>
</header>
