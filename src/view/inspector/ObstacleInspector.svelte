<script lang="ts">
  import { Minus, Plus, Trash2 } from "@lucide/svelte";
  import type { Shape } from "../../types";
  import { FIELD_SIZE } from "../../config";
  import { gridSize, showGrid, snapToGrid } from "../../stores";
  import { setShapes, updatePoint, updateShape } from "../../model/commands";
  import { useEditor } from "../../state/editor.svelte";
  import { useProject } from "../../state/project.svelte";
  import Button from "../../lib/components/ui/Button.svelte";
  import IconButton from "../../lib/components/ui/IconButton.svelte";
  import { fieldClass, labelClass } from "../../lib/components/ui/styles";

  interface Props {
    shape: Shape;
  }

  let { shape }: Props = $props();

  const project = useProject();
  const editor = useEditor();

  const COLORS = [
    { label: "Red", color: "#dc2626", fill: "#ff6b6b" },
    { label: "Blue", color: "#2563eb", fill: "#60a5fa" },
  ];

  let number = $derived(
    project.doc.shapes.findIndex((candidate) => candidate.id === shape.id) + 1,
  );
  let step = $derived($snapToGrid && $showGrid ? $gridSize : 0.1);

  function edit(patch: Partial<Shape>, field?: string) {
    project.apply(
      updateShape(shape.id, (current) => ({ ...current, ...patch })),
      { coalesce: field && `${shape.id}.${field}` },
    );
  }

  function setVertex(index: number, axis: "x" | "y", input: HTMLInputElement) {
    const value = parseFloat(input.value);
    if (Number.isNaN(value)) return;
    project.apply(
      updatePoint({ kind: "vertex", shapeId: shape.id, index }, { [axis]: value }),
      { coalesce: `${shape.id}.${index}.${axis}` },
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
    <label class="flex flex-col gap-1">
      <span class={labelClass}>Color</span>
      <select
        class={[fieldClass, "w-24"]}
        value={shape.color}
        onchange={(event) => {
          const choice = COLORS.find((c) => c.color === event.currentTarget.value);
          if (choice) edit({ color: choice.color, fillColor: choice.fill });
        }}
      >
        {#each COLORS as choice (choice.color)}
          <option value={choice.color}>{choice.label}</option>
        {/each}
      </select>
    </label>
    <IconButton label="Delete obstacle" class="hover:text-danger!" onclick={remove}>
      <Trash2 />
    </IconButton>
  </div>

  <div class="flex flex-col gap-1.5">
    <span class={labelClass}>Vertices</span>
    {#each shape.vertices as vertex, index (index)}
      <div class="flex items-center gap-2">
        <span class="w-4 text-right font-mono text-xs text-body">{index + 1}</span>
        <input
          class={fieldClass}
          type="number"
          min="0"
          max={FIELD_SIZE}
          {step}
          aria-label={`Vertex ${index + 1} x`}
          value={vertex.x}
          oninput={(event) => setVertex(index, "x", event.currentTarget)}
        />
        <input
          class={fieldClass}
          type="number"
          min="0"
          max={FIELD_SIZE}
          {step}
          aria-label={`Vertex ${index + 1} y`}
          value={vertex.y}
          oninput={(event) => setVertex(index, "y", event.currentTarget)}
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
