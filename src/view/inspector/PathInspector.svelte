<script lang="ts">
  import { Lock, LockOpen, Plus, Trash2 } from "@lucide/svelte";
  import type { AtomicPath, BasePoint, Path } from "../../types";
  import { FIELD_SIZE } from "../../config";
  import { gridSize, showGrid, snapToGrid } from "../../stores";
  import { updatePathById, updatePoint } from "../../model/commands";
  import { atomicSegments } from "../../utils/pathTraversal";
  import { useEditor } from "../../state/editor.svelte";
  import { useProject } from "../../state/project.svelte";
  import Button from "../../lib/components/ui/Button.svelte";
  import IconButton from "../../lib/components/ui/IconButton.svelte";
  import { fieldClass, labelClass, sectionClass } from "../../lib/components/ui/styles";
  import HeadingControls from "../../lib/components/HeadingControls.svelte";

  interface Props {
    line: AtomicPath;
  }

  let { line }: Props = $props();

  const project = useProject();
  const editor = useEditor();

  let number = $derived(
    atomicSegments(project.doc.lines).findIndex((path) => path.id === line.id) + 1,
  );
  let index = $derived(editor.selectedPointIndex);
  let point = $derived(editor.selectedPoint);
  let pointLocked = $derived(Boolean(line.locked || point?.locked));
  let step = $derived($snapToGrid && $showGrid ? $gridSize : 0.1);
  let isOnlyPath = $derived(atomicSegments(project.doc.lines).length <= 1);

  /** Typing into one field merges into one undo step. */
  function edit(field: string, update: (path: Path) => Path) {
    project.apply(updatePathById(line.id, update), {
      coalesce: `${line.id}.${field}`,
    });
  }

  function movePoint(patch: Partial<BasePoint>) {
    const address = editor.selectedAddress;
    if (!address) return;
    project.apply(updatePoint(address, patch), {
      coalesce: `${address.lineId}.${address.index}.${Object.keys(patch).join()}`,
    });
  }

  function toggleLock() {
    const address = editor.selectedAddress;
    if (address && point) {
      project.apply(updatePoint(address, { locked: !point.locked }));
    }
  }

  const numberFrom = (input: HTMLInputElement) => {
    const value = parseFloat(input.value);
    return Number.isNaN(value) ? null : value;
  };
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-end gap-2">
    <label class="flex min-w-0 flex-1 flex-col gap-1">
      <span class={labelClass}>Name</span>
      <input
        class={fieldClass}
        value={line.name || ""}
        placeholder={`Path ${number}`}
        disabled={line.locked}
        oninput={(event) =>
          edit("name", (path) => ({ ...path, name: event.currentTarget.value }))}
      />
    </label>
    <IconButton
      label={isOnlyPath ? "At least one path must remain" : "Delete path"}
      disabled={isOnlyPath || line.locked}
      class="hover:text-danger!"
      onclick={() => {
        editor.selectedPointIndex = 0;
        editor.deleteSelectedPoint();
      }}
    >
      <Trash2 />
    </IconButton>
  </div>

  <label class="flex flex-col gap-1">
    <span class={labelClass}>Wait after the path (ms)</span>
    <input
      class={fieldClass}
      type="number"
      min="0"
      step="100"
      value={line.waitAfterMs ?? 0}
      disabled={line.locked}
      oninput={(event) =>
        edit("wait", (path) => ({
          ...path,
          waitAfterMs: Math.max(0, Number(event.currentTarget.value) || 0),
        }))}
    />
  </label>

  <div class={[sectionClass, "flex flex-col gap-3"]}>
    <div class="flex flex-wrap items-center gap-1">
      <button
        type="button"
        class={[
          "rounded-md px-2 py-1 text-xs font-medium transition",
          index === 0
            ? "bg-primary/15 text-primary"
            : "text-body hover:bg-body/10",
        ]}
        onclick={() => (editor.selectedPointIndex = 0)}
      >
        Endpoint
      </button>
      {#each line.controlPoints as _, pointIndex (pointIndex)}
        <button
          type="button"
          class={[
            "rounded-md px-2 py-1 font-mono text-xs transition",
            index === pointIndex + 1
              ? "bg-primary/15 text-primary"
              : "text-body hover:bg-body/10",
          ]}
          onclick={() => (editor.selectedPointIndex = pointIndex + 1)}
        >
          CP{pointIndex + 1}
        </button>
      {/each}
      <IconButton
        label="Add control point (A)"
        size="sm"
        disabled={line.locked}
        onclick={() => editor.addControlPoint()}
      >
        <Plus />
      </IconButton>
    </div>

    {#if point}
      <div class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1">
          <span class={labelClass}>X</span>
          <input
            class={fieldClass}
            type="number"
            min="0"
            max={FIELD_SIZE}
            {step}
            value={point.x}
            disabled={pointLocked}
            oninput={(event) => {
              const x = numberFrom(event.currentTarget);
              if (x !== null) movePoint({ x });
            }}
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class={labelClass}>Y</span>
          <input
            class={fieldClass}
            type="number"
            min="0"
            max={FIELD_SIZE}
            {step}
            value={point.y}
            disabled={pointLocked}
            oninput={(event) => {
              const y = numberFrom(event.currentTarget);
              if (y !== null) movePoint({ y });
            }}
          />
        </label>
      </div>

      <div class="flex items-center justify-end gap-1">
        {#if index > 0}
          <Button
            size="sm"
            variant="ghost"
            disabled={pointLocked}
            onclick={() => editor.deleteSelectedPoint()}
          >
            Delete control point
          </Button>
        {/if}
        <Button
          size="sm"
          variant="ghost"
          disabled={line.locked}
          onclick={toggleLock}
        >
          {#if point.locked}
            <LockOpen class="size-3.5" /> Unlock point
          {:else}
            <Lock class="size-3.5" /> Lock point
          {/if}
        </Button>
      </div>
    {/if}
  </div>

  <div class="flex flex-col gap-2">
    <span class={labelClass}>Heading</span>
    <div class="flex flex-wrap items-center gap-2 text-sm text-body">
      <HeadingControls
        heading={line.heading}
        locked={line.locked}
        onChange={(heading) => edit("heading", (path) => ({ ...path, heading }))}
      />
    </div>
  </div>
</div>
