<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";
  import type { PathListItem } from "../../types";
  import { useEditor } from "../../state/editor.svelte";
  import { usePlayback } from "../../state/playback.svelte";
  import { useProject } from "../../state/project.svelte";
  import { findPathById } from "../../utils/pathTraversal";

  const project = useProject();
  const editor = useEditor();
  const playback = usePlayback();

  /** Groups the user has folded away, keyed by id. */
  let collapsed: Record<string, boolean> = $state({});

  /** The row being dragged, and where it would land. */
  let draggingId: string | null = $state(null);
  let dropTargetId: string | null = $state(null);
  let dropPosition: "before" | "after" = $state("before");

  let collisionCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const { lineId } of playback.collisions) {
      if (lineId) counts[lineId] = (counts[lineId] ?? 0) + 1;
    }
    return counts;
  });

  function colorOf(id: string) {
    const path = findPathById(project.doc.lines, id);
    return path?.kind === "atomic" ? path.color : undefined;
  }

  function select(event: MouseEvent, id: string) {
    editor.selectFromList(id, {
      additive: event.metaKey || event.ctrlKey,
      range: event.shiftKey,
    });
  }

  function onDragStart(event: DragEvent, id: string) {
    draggingId = id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      // Firefox requires data to be set for a drag to start at all.
      event.dataTransfer.setData("text/plain", id);
    }
  }

  function onDragOver(event: DragEvent, id: string) {
    if (!draggingId || draggingId === id) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    // Drop above or below the hovered row depending on which half is over.
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dropTargetId = id;
    dropPosition =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  }

  function onDrop(event: DragEvent, id: string) {
    event.preventDefault();
    event.stopPropagation();
    const source = draggingId;
    const position = dropPosition;
    resetDrag();
    if (source && source !== id) editor.reorderPath(source, id, position);
  }

  function resetDrag() {
    draggingId = null;
    dropTargetId = null;
  }
</script>

{#snippet row(item: PathListItem, depth: number)}
  {@const selected = editor.selectedPathIds.includes(item.id)}
  {@const primary = editor.primarySelectedId === item.id}
  {@const count = collisionCounts[item.id]}
  <div
    class={[
      "group flex h-7 items-center gap-1.5 rounded-md pr-2 text-sm transition",
      selected ? "bg-primary/12 text-heading" : "text-body hover:bg-body/8",
      primary && "ring-1 ring-primary/50 ring-inset",
      draggingId === item.id && "opacity-40",
      dropTargetId === item.id &&
        (dropPosition === "before"
          ? "shadow-[inset_0_2px_0_0_var(--color-primary)]"
          : "shadow-[inset_0_-2px_0_0_var(--color-primary)]"),
    ]}
    style={`padding-left: ${0.5 + depth * 0.9}rem;`}
    draggable="true"
    role="treeitem"
    aria-selected={selected}
    tabindex="-1"
    ondragstart={(event) => onDragStart(event, item.id)}
    ondragover={(event) => onDragOver(event, item.id)}
    ondrop={(event) => onDrop(event, item.id)}
    ondragend={resetDrag}
  >
    {#if item.kind === "compound"}
      <button
        type="button"
        class="-ml-1 rounded p-0.5 text-body hover:text-heading"
        aria-label={collapsed[item.id] ? "Expand group" : "Collapse group"}
        aria-expanded={!collapsed[item.id]}
        onclick={() => (collapsed[item.id] = !collapsed[item.id])}
      >
        <ChevronDown
          class={[
            "size-3.5 transition-transform",
            collapsed[item.id] && "-rotate-90",
          ]}
        />
      </button>
    {:else}
      <span
        class="size-2 shrink-0 rounded-full"
        style={`background: ${colorOf(item.id) ?? "var(--body)"}`}
      ></span>
    {/if}
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-2 text-left"
      onclick={(event) => select(event, item.id)}
    >
      <span class={["truncate", selected && "text-heading"]}>{item.name}</span>
      {#if item.kind === "compound"}
        <span class="font-mono text-[11px] opacity-60"
          >{item.children.length}</span
        >
      {/if}
    </button>
    {#if count}
      <span
        class="rounded-full bg-danger px-1.5 text-[10px] leading-4 font-semibold text-accent-foreground"
        title={`${count} collision${count === 1 ? "" : "s"}`}
      >
        {count}
      </span>
    {/if}
  </div>
  {#if item.kind === "compound" && !collapsed[item.id]}
    {#each item.children as child (child.id)}
      {@render row(child, depth + 1)}
    {/each}
  {/if}
{/snippet}

<div
  class="flex flex-col gap-px"
  role="tree"
  tabindex="-1"
  aria-label="Paths"
  ondragend={resetDrag}
>
  {#each editor.pathListItems as item (item.id)}
    {@render row(item, 0)}
  {/each}
  {#if editor.pathListItems.length === 0}
    <p class="px-2 py-1 text-xs text-body">No paths yet.</p>
  {/if}
</div>
