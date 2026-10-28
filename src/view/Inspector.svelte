<script lang="ts">
  import { PanelRight } from "@lucide/svelte";
  import { useEditor } from "../state/editor.svelte";
  import type { Prefs } from "../state/prefs.svelte";
  import IconButton from "../lib/components/ui/IconButton.svelte";
  import { surfaceClass } from "../lib/components/ui/styles";
  import DocumentInspector from "./inspector/DocumentInspector.svelte";
  import GroupInspector from "./inspector/GroupInspector.svelte";
  import ObstacleInspector from "./inspector/ObstacleInspector.svelte";
  import PathInspector from "./inspector/PathInspector.svelte";
  import SelectionInspector from "./inspector/SelectionInspector.svelte";

  interface Props {
    prefs: Prefs;
    hidden?: boolean;
    onHide: () => void;
  }

  let { prefs, hidden = false, onHide }: Props = $props();

  const editor = useEditor();

  let selectedGroup = $derived(
    editor.selectedPath?.kind === "compound" ? editor.selectedPath : null,
  );
  let several = $derived(editor.selectedPathIds.length > 1);
  let title = $derived(
    editor.selectedShape
      ? "Obstacle"
      : several
        ? "Selection"
        : selectedGroup
          ? "Group"
          : editor.selectedLine
            ? "Path"
            : "Project",
  );
</script>

<aside
  class={[
    surfaceClass,
    "flex min-h-0 flex-col overflow-hidden p-2",
    hidden && "pointer-events-none invisible",
  ]}
  aria-label="Inspector"
>
  <div class="flex items-center justify-between px-1 pb-2">
    <h2 class="text-sm font-semibold text-heading">{title}</h2>
    <IconButton label="Hide inspector" size="sm" onclick={onHide}>
      <PanelRight />
    </IconButton>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
    {#if editor.selectedShape}
      <ObstacleInspector shape={editor.selectedShape} />
    {:else if several}
      <SelectionInspector />
    {:else if selectedGroup}
      <GroupInspector group={selectedGroup} />
    {:else if editor.selectedLine}
      <PathInspector line={editor.selectedLine} />
    {:else}
      <DocumentInspector {prefs} />
    {/if}
  </div>
</aside>
