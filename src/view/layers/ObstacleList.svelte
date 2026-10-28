<script lang="ts">
  import { useEditor } from "../../state/editor.svelte";
  import { useProject } from "../../state/project.svelte";

  const project = useProject();
  const editor = useEditor();
</script>

<div class="flex flex-col gap-px">
  {#each project.doc.shapes as shape, index (shape.id)}
    {@const selected = editor.selectedShape?.id === shape.id}
    <button
      type="button"
      aria-pressed={selected}
      class={[
        "flex h-7 items-center gap-2 rounded-md px-2 text-left text-sm transition",
        selected
          ? "bg-primary/12 text-heading ring-1 ring-primary/50 ring-inset"
          : "text-body hover:bg-body/8",
      ]}
      onclick={() => editor.selectShape(shape.id)}
    >
      <span
        class="size-2.5 shrink-0 rounded-sm"
        style={`background: ${shape.color}`}
      ></span>
      <span class="truncate">{shape.name || `Obstacle ${index + 1}`}</span>
    </button>
  {/each}
  {#if project.doc.shapes.length === 0}
    <p class="px-2 py-1 text-xs text-body">No obstacles.</p>
  {/if}
</div>
