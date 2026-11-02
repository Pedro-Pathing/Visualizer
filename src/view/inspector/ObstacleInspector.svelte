<script lang="ts">
  import { coordinateSettings } from "../../stores";
  import { gridSpacing } from "../../utils/coordinates";
  import CoordinateField from "../../lib/components/CoordinateField.svelte";
  import { Minus, Plus, Trash2 } from "@lucide/svelte";
  import type { Shape } from "../../types";
  import { BLUE_ALLIANCE_COLORS, RED_ALLIANCE_COLORS } from "../../config";
  import { gridSize, showGrid, snapToGrid } from "../../stores";
  import { setShapes, updatePoint, updateShape } from "../../model/commands";
  import { useEditor } from "../../state/editor.svelte";
  import { useProject } from "../../state/project.svelte";
  import Button from "../../lib/components/ui/Button.svelte";
  import ColorField from "../../lib/components/ui/ColorField.svelte";
  import IconButton from "../../lib/components/ui/IconButton.svelte";
  import { fieldClass, labelClass } from "../../lib/components/ui/styles";

  interface Props {
    shape: Shape;
  }

  let { shape }: Props = $props();

  const project = useProject();
  const editor = useEditor();

  /** Alliance colors pair with a lighter vertex fill; any other color fills with itself. */
  const COLORS = [RED_ALLIANCE_COLORS, BLUE_ALLIANCE_COLORS];

  let number = $derived(
    project.doc.shapes.findIndex((candidate) => candidate.id === shape.id) + 1,
  );
  let step = $derived(
    $snapToGrid && $showGrid
      ? gridSpacing($gridSize, $coordinateSettings)
      : 0.1,
  );

  function edit(patch: Partial<Shape>, field?: string) {
    project.apply(
      updateShape(shape.id, (current) => ({ ...current, ...patch })),
      { coalesce: field && `${shape.id}.${field}` },
    );
  }

  function remove() {
    project.apply(
      setShapes(project.doc.shapes.filter((other) => other.id !== shape.id)),
    );
    editor.clearSelection();
  }
</script>

<div class="flex flex-col gap-3">
  {#if shape.fieldCalibration}
    <p class="text-xs text-body">
      Built-in outline: follows tile calibration. Editing a vertex makes it
      custom.
    </p>
  {/if}
  <div class="flex items-end gap-2">
    <label class="flex min-w-0 flex-1 flex-col gap-1">
      <span class={labelClass}>Name</span>
      <input
        class={fieldClass}
        value={shape.name ?? ""}
        placeholder={`Obstacle ${number}`}
        oninput={(event) => edit({ name: event.currentTarget.value }, "name")}
      />
    </label>
    <IconButton
      label="Delete obstacle"
      class="hover:text-danger!"
      onclick={remove}
    >
      <Trash2 />
    </IconButton>
  </div>

  <ColorField
    label="Color"
    value={shape.color}
    presets={COLORS.map((choice) => choice.color)}
    onchange={(color) =>
      edit(
        {
          color,
          fillColor:
            COLORS.find((choice) => choice.color === color)?.fillColor ?? color,
        },
        "color",
      )}
  />

  <div class="flex flex-col gap-1.5">
    <span class={labelClass}>Vertices</span>
    {#each shape.vertices as vertex, index (index)}
      <div class="flex items-center gap-2">
        <span class="w-4 text-right font-mono text-xs text-body"
          >{index + 1}</span
        >
        <CoordinateField
          class={fieldClass}
          point={vertex}
          axis="x"
          {step}
          aria-label={`Vertex ${index + 1} x`}
          onpoint={(point) =>
            project.apply(
              updatePoint(
                { kind: "vertex", shapeId: shape.id, index },
                { x: point.x, y: point.y },
              ),
              { coalesce: `${shape.id}.${index}.x` },
            )}
        />
        <CoordinateField
          class={fieldClass}
          point={vertex}
          axis="y"
          {step}
          aria-label={`Vertex ${index + 1} y`}
          onpoint={(point) =>
            project.apply(
              updatePoint(
                { kind: "vertex", shapeId: shape.id, index },
                { x: point.x, y: point.y },
              ),
              { coalesce: `${shape.id}.${index}.y` },
            )}
        />
        <IconButton
          label="Remove vertex"
          size="sm"
          disabled={shape.vertices.length <= 3}
          onclick={() =>
            edit({ vertices: shape.vertices.filter((_, i) => i !== index) })}
        >
          <Minus />
        </IconButton>
      </div>
    {/each}
    <div>
      <Button
        size="sm"
        variant="ghost"
        onclick={() => {
          const last = shape.vertices[shape.vertices.length - 1];
          edit({
            vertices: [...shape.vertices, { x: last.x + 6, y: last.y }],
          });
        }}
      >
        <Plus class="size-3.5" /> Add vertex
      </Button>
    </div>
  </div>
</div>
