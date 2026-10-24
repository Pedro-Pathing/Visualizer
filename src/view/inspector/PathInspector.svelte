<script lang="ts">
  import { Lock, LockOpen, Plus, Trash2, X } from "@lucide/svelte";
  import type { AtomicPath, BasePoint, Path } from "../../types";
  import { FIELD_SIZE } from "../../config";
  import { gridSize, showGrid, snapToGrid } from "../../stores";
  import { updatePathById, updatePoint } from "../../model/commands";
  import { atomicSegments } from "../../utils/pathTraversal";
  import { useEditor } from "../../state/editor.svelte";
  import { useProject } from "../../state/project.svelte";
  import Button from "../../lib/components/ui/Button.svelte";
  import { PATH_COLORS } from "../../utils/color";
  import ColorField from "../../lib/components/ui/ColorField.svelte";
  import IconButton from "../../lib/components/ui/IconButton.svelte";
  import { fieldClass, labelClass } from "../../lib/components/ui/styles";
  import HeadingControls from "../../lib/components/HeadingControls.svelte";

  interface Props {
    line: AtomicPath;
  }

  let { line }: Props = $props();

  const project = useProject();
  const editor = useEditor();

  let number = $derived(
    atomicSegments(project.doc.lines).findIndex((path) => path.id === line.id) +
      1,
  );
  let index = $derived(editor.selectedPointIndex);
  let step = $derived($snapToGrid && $showGrid ? $gridSize : 0.1);
  let isOnlyPath = $derived(atomicSegments(project.doc.lines).length <= 1);
  /** A through-curve's inner points replace its control points. */
  let throughPoints = $derived(
    line.throughPoints?.length ? line.throughPoints : null,
  );

  /** Every point in driving order; `index` is its point address (0 is the end). */
  let rows = $derived([
    ...(throughPoints ?? line.controlPoints).map((point, i) => ({
      index: i + 1,
      label: `${throughPoints ? "T" : "CP"}${i + 1}`,
      point: point as BasePoint,
    })),
    { index: 0, label: "End", point: line.endPoint as BasePoint },
  ]);

  /** Typing into one field merges into one undo step. */
  function edit(field: string, update: (path: Path) => Path) {
    project.apply(updatePathById(line.id, update), {
      coalesce: `${line.id}.${field}`,
    });
  }

  function movePoint(pointIndex: number, patch: Partial<BasePoint>) {
    project.apply(
      updatePoint({ kind: "path", lineId: line.id, index: pointIndex }, patch),
      {
        coalesce: `${line.id}.${pointIndex}.${Object.keys(patch).join()}`,
      },
    );
  }

  function toggleLock(pointIndex: number, point: BasePoint) {
    project.apply(
      updatePoint(
        { kind: "path", lineId: line.id, index: pointIndex },
        { locked: !point.locked },
      ),
    );
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
          edit("name", (path) => ({
            ...path,
            name: event.currentTarget.value,
          }))}
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

  <ColorField
    label="Color"
    value={line.color}
    presets={PATH_COLORS}
    disabled={line.locked}
    onchange={(color) => edit("color", (path) => ({ ...path, color }))}
  />

  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between">
      <span class={labelClass}>Points</span>
      {#if !throughPoints}
        <Button
          size="sm"
          variant="ghost"
          disabled={line.locked}
          title="Add control point (A)"
          onclick={() => editor.addControlPoint()}
        >
          <Plus class="size-3.5" /> Control point
        </Button>
      {/if}
    </div>

    <div
      class="grid grid-cols-[2.75rem_1fr_1fr_auto] items-center gap-x-2 gap-y-1"
    >
      {#each rows as row (row.index)}
        {@const locked = Boolean(line.locked || row.point.locked)}
        {@const selected = index === row.index}
        <span
          class={[
            "rounded-md py-1 text-center font-mono text-xs",
            selected ? "bg-primary/15 text-primary" : "text-body",
          ]}
        >
          {row.label}
        </span>
        {#each ["x", "y"] as const as axis (axis)}
          <input
            class={[
              fieldClass,
              "font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
            ]}
            type="number"
            min="0"
            max={FIELD_SIZE}
            {step}
            aria-label={`${row.label} ${axis.toUpperCase()}`}
            value={Number(row.point[axis].toFixed(2))}
            disabled={locked}
            onfocus={() => (editor.selectedPointIndex = row.index)}
            oninput={(event) => {
              const value = numberFrom(event.currentTarget);
              if (value !== null) movePoint(row.index, { [axis]: value });
            }}
          />
        {/each}
        <div class="flex">
          <IconButton
            label={row.point.locked ? "Unlock point" : "Lock point"}
            size="sm"
            active={Boolean(row.point.locked)}
            disabled={line.locked}
            onclick={() => toggleLock(row.index, row.point)}
          >
            {#if row.point.locked}<Lock />{:else}<LockOpen />{/if}
          </IconButton>
          {#if row.index > 0}
            <IconButton
              label={throughPoints
                ? "Delete through point"
                : "Delete control point"}
              size="sm"
              class="hover:text-danger!"
              disabled={locked}
              onclick={() => {
                editor.selectedPointIndex = row.index;
                editor.deleteSelectedPoint();
              }}
            >
              <X />
            </IconButton>
          {:else}
            <span class="size-7"></span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="flex flex-col gap-2">
    <span class={labelClass}>Heading</span>
    <div class="flex flex-wrap items-center gap-2 text-sm text-body">
      <HeadingControls
        heading={line.heading}
        locked={line.locked}
        onChange={(heading) =>
          edit("heading", (path) => ({ ...path, heading }))}
      />
    </div>
  </div>
</div>
