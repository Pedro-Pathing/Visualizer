<script lang="ts">
  import type { PathListItem } from "../../types";

  interface Props {
    hidden?: boolean;
    fileName: string;
    version: string;
    lineCount: number;
    pathPreviewItems: PathListItem[];
    selectedPathIds: string[];
    primarySelectedId: string | null;
    /** Why the current selection cannot be grouped, or null when it can. */
    groupingBlockedReason: string | null;
    canUngroup: boolean;
    /** How many collisions each segment has, by id. */
    collisionCounts?: Record<string, number>;
    onToggleVisibility: () => void;
    onSelectPath: (
      id: string,
      modifiers: { additive?: boolean; range?: boolean },
    ) => void;
    onGroup: () => void;
    onUngroup: () => void;
    /** Move `draggedId` to sit before or after `targetId`. */
    onReorderPath: (
      draggedId: string,
      targetId: string,
      position: "before" | "after",
    ) => void;
  }

  let {
    hidden = false,
    fileName,
    version,
    lineCount,
    pathPreviewItems,
    selectedPathIds,
    primarySelectedId,
    groupingBlockedReason,
    canUngroup,
    collisionCounts = {},
    onToggleVisibility,
    onSelectPath,
    onGroup,
    onUngroup,
    onReorderPath,
  }: Props = $props();

  /** Groups the user has folded away, keyed by id. */
  let collapsed: Record<string, boolean> = $state({});

  /** The row currently being dragged, and where it would land. */
  let draggingId: string | null = $state(null);
  let dropTargetId: string | null = $state(null);
  let dropPosition: "before" | "after" = $state("before");

  function toggleGroup(id: string) {
    collapsed[id] = !collapsed[id];
  }

  function modifiersOf(event: MouseEvent) {
    return {
      additive: event.metaKey || event.ctrlKey,
      range: event.shiftKey,
    };
  }

  function handleDragStart(event: DragEvent, id: string) {
    draggingId = id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      // Firefox requires data to be set for a drag to start at all.
      event.dataTransfer.setData("text/plain", id);
    }
  }

  function handleDragOver(event: DragEvent, id: string) {
    if (!draggingId || draggingId === id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";

    // Drop above or below the hovered row depending on which half is over.
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dropTargetId = id;
    dropPosition =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  }

  function handleDrop(event: DragEvent, id: string) {
    event.preventDefault();
    event.stopPropagation();
    const source = draggingId;
    const position = dropPosition;
    resetDrag();
    if (source && source !== id) onReorderPath(source, id, position);
  }

  function resetDrag() {
    draggingId = null;
    dropTargetId = null;
  }
</script>

{#snippet row(item: PathListItem)}
  {@const isSelected = selectedPathIds.includes(item.id)}
  {@const isPrimary = primarySelectedId === item.id}
  {@const isDropBefore = dropTargetId === item.id && dropPosition === "before"}
  {@const isDropAfter = dropTargetId === item.id && dropPosition === "after"}
  {#if item.kind === "compound"}
    <div
      class="path-group"
      class:path-group--selected={isSelected}
      class:path-group--primary={isPrimary}
      class:path-row--dragging={draggingId === item.id}
      class:path-row--drop-before={isDropBefore}
      class:path-row--drop-after={isDropAfter}
      draggable="true"
      role="listitem"
      ondragstart={(event) => handleDragStart(event, item.id)}
      ondragover={(event) => handleDragOver(event, item.id)}
      ondrop={(event) => handleDrop(event, item.id)}
      ondragend={resetDrag}
    >
      <div class="path-group-header">
        <button
          class="path-group-caret-btn"
          type="button"
          onclick={() => toggleGroup(item.id)}
          aria-expanded={!collapsed[item.id]}
          aria-label={collapsed[item.id] ? "Expand group" : "Collapse group"}
          title={collapsed[item.id] ? "Expand group" : "Collapse group"}
        >
          <span class="path-group-caret" class:is-collapsed={collapsed[item.id]}
            >▾</span
          >
        </button>
        <button
          class="path-group-label"
          type="button"
          onclick={(event) => onSelectPath(item.id, modifiersOf(event))}
        >
          <span class="list-item-name">{item.name}</span>
          <span class="path-group-count">{item.children.length}</span>
        </button>
      </div>
      {#if !collapsed[item.id]}
        <div class="path-group-children">
          {#each item.children as child (child.id)}
            {@render row(child)}
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <button
      class="list-item-box compact text-left"
      class:list-item-box--selected={isSelected}
      class:list-item-box--primary={isPrimary}
      class:path-row--dragging={draggingId === item.id}
      class:path-row--drop-before={isDropBefore}
      class:path-row--drop-after={isDropAfter}
      draggable="true"
      ondragstart={(event) => handleDragStart(event, item.id)}
      ondragover={(event) => handleDragOver(event, item.id)}
      ondrop={(event) => handleDrop(event, item.id)}
      ondragend={resetDrag}
      onclick={(event) => onSelectPath(item.id, modifiersOf(event))}
    >
      <div class="list-item-top">
        <span class="list-item-name">{item.name}</span>
        {#if collisionCounts[item.id]}
          <span
            class="ml-auto rounded-full bg-danger px-1.5 text-[10px] leading-4 font-semibold text-accent-foreground"
            title={`${collisionCounts[item.id]} collision${collisionCounts[item.id] === 1 ? "" : "s"}`}
          >
            {collisionCounts[item.id]}
          </span>
        {/if}
      </div>
      <div class="list-item-sub">{item.x}, {item.y}</div>
    </button>
  {/if}
{/snippet}

<aside
  class="panel-box side-rail side-rail-left"
  class:side-rail--collapsed={hidden}
>
  <section class="module-box">
    <div class="module-header-row">
      <h3 class="module-title">File</h3>
      <div class="flex items-center gap-2">
        <span class="module-chip">{version}</span>
        <button
          class="panel-toggle-btn"
          type="button"
          onclick={onToggleVisibility}
          aria-label={hidden ? "Show left panel" : "Hide left panel"}
          title={hidden ? "Show left panel" : "Hide left panel"}
        >
          {hidden ? "›" : "‹"}
        </button>
      </div>
    </div>
    <p class="module-caption">Export name</p>
    <div class="module-mono">{fileName}</div>
  </section>

  <section class="module-box module-fill">
    <div class="module-header-row">
      <h3 class="module-title">Path List</h3>
      <div class="flex items-center gap-1">
        <button
          class="path-list-action"
          type="button"
          onclick={onGroup}
          disabled={groupingBlockedReason !== null}
          title={groupingBlockedReason ??
            "Group the selected paths (Cmd/Ctrl-click and Shift-click to select several)"}
        >
          Group
        </button>
        <button
          class="path-list-action"
          type="button"
          onclick={onUngroup}
          disabled={!canUngroup}
          title={canUngroup
            ? "Dissolve the selected group"
            : "Select a group to dissolve it"}
        >
          Ungroup
        </button>
        <span class="module-caption ml-1">
          {lineCount} path{lineCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
    <div class="module-list" role="list" ondragend={resetDrag}>
      {#each pathPreviewItems as item (item.id)}
        {@render row(item)}
      {/each}
      {#if pathPreviewItems.length === 0}
        <div class="list-empty">No paths yet.</div>
      {/if}
    </div>
  </section>
</aside>
