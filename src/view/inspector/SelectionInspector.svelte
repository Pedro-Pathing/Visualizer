<script lang="ts">
  import { useEditor } from "../../state/editor.svelte";
  import Button from "../../lib/components/ui/Button.svelte";

  const editor = useEditor();
</script>

<div class="flex flex-col gap-3">
  <p class="text-sm text-body">
    {editor.selectedPathIds.length} paths selected. Cmd/Ctrl-click to add or remove
    one, Shift-click to select a run.
  </p>
  <div class="flex gap-2">
    <Button
      size="sm"
      variant="primary"
      disabled={editor.groupingBlockedReason !== null}
      title={editor.groupingBlockedReason ?? undefined}
      onclick={() => editor.groupSelected()}
    >
      Group
    </Button>
    <Button size="sm" variant="ghost" onclick={() => editor.clearSelection()}>
      Deselect
    </Button>
  </div>
  {#if editor.groupingBlockedReason}
    <p class="text-xs text-body">{editor.groupingBlockedReason}</p>
  {/if}
</div>
