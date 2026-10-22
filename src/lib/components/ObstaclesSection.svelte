<script lang="ts">
  import type { Shape } from "../../types";
  import { createTriangle } from "../../utils";
  import { snapToGrid, showGrid, gridSize } from "../../stores";
  import { FIELD_SIZE } from "../../config";
  import { setShapes, updatePoint, updateShape } from "../../model/commands";
  import { useProject } from "../../state/project.svelte";

  const colorChoices = [
    { label: "Red", color: "#dc2626", fill: "#ff6b6b" },
    { label: "Blue", color: "#2563eb", fill: "#60a5fa" },
  ];

  interface Props {
    collapsedObstacles: boolean[];
    compact?: boolean;
  }

  let { collapsedObstacles = $bindable(), compact = false }: Props = $props();

  const project = useProject();
  let shapes = $derived(project.doc.shapes);

  function editShape(shape: Shape, patch: Partial<Shape>, coalesce?: string) {
    project.apply(
      updateShape(shape.id, (current) => ({ ...current, ...patch })),
      { coalesce: coalesce && `${shape.id}.${coalesce}` },
    );
  }

  function setPresetColor(shape: Shape, color: string) {
    const choice = colorChoices.find((c) => c.color === color);
    if (choice)
      editShape(shape, { color: choice.color, fillColor: choice.fill });
  }

  function setVertex(
    shape: Shape,
    index: number,
    axis: "x" | "y",
    input: HTMLInputElement,
  ) {
    const value = parseFloat(input.value);
    if (Number.isNaN(value)) return;
    project.apply(
      updatePoint(
        { kind: "vertex", shapeId: shape.id, index },
        { [axis]: value },
      ),
      { coalesce: `${shape.id}.${index}.${axis}` },
    );
  }

  let snapToGridTitle = $derived(
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping",
  );

  function toggleObstacle(index: number) {
    collapsedObstacles[index] = !collapsedObstacles[index];
    collapsedObstacles = [...collapsedObstacles];
  }

  function toggleAllObstacles() {
    const allCollapsed = collapsedObstacles.every((c) => c);
    collapsedObstacles = collapsedObstacles.map(() => !allCollapsed);
  }
</script>

<div
  class={`flex flex-col w-full justify-start items-start gap-0.5 text-sm ${compact ? "text-xs" : ""}`}
>
  <div class="flex items-center gap-2 w-full">
    <button
      onclick={toggleAllObstacles}
      class={`flex items-center gap-2 font-semibold px-2 py-1 transition-colors duration-250 ${compact ? "text-xs" : "text-sm"}`}
      title={collapsedObstacles.every((c) => c) ? "Expand all" : "Collapse all"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class={`size-4 transition-transform ${collapsedObstacles.every((c) => c) ? "rotate-0" : "rotate-90"}`}
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m8.25 4.5 7.5 7.5-7.5 7.5"
        />
      </svg>
      Obstacles ({shapes.length})
    </button>
  </div>

  {#each shapes as shape, shapeIdx (shapeIdx)}
    <div
      class={`flex flex-col w-full justify-start items-start gap-1 border border-neutral-300 dark:border-neutral-600 ${compact ? "p-1 mt-1" : "p-2 mt-2"}`}
    >
      <div class="flex flex-row w-full justify-between items-center gap-2">
        <div class="flex flex-row items-center gap-2 min-w-0">
          <button
            onclick={() => toggleObstacle(shapeIdx)}
            class={`flex items-center gap-2 font-medium transition-colors duration-250 ${compact ? "px-1 py-0.5 text-xs" : "px-2 py-1 text-sm"}`}
            title={collapsedObstacles[shapeIdx] ? "Expand" : "Collapse"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class={`size-4 transition-transform ${collapsedObstacles[shapeIdx] ? "rotate-0" : "rotate-90"}`}
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m8.25 4.5 7.5 7.5-7.5 7.5"
              />
            </svg>
            <span class={compact ? "text-xs" : "text-sm"}
              >Obstacle {shapeIdx + 1}</span
            >
          </button>

          <input
            value={shape.name ?? ""}
            oninput={(e) =>
              editShape(shape, { name: e.currentTarget.value }, "name")}
            placeholder={`Obstacle ${shapeIdx + 1}`}
            class={`pl-1.5 bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none font-medium ${compact ? "w-28 py-0.5 text-xs" : "w-40 py-1 text-sm"}`}
          />

          <select
            class={`bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] px-2 font-medium ${compact ? "py-0.5 text-xs" : "py-1 text-sm"}`}
            value={shape.color}
            onchange={(e) => setPresetColor(shape, e.currentTarget.value)}
          >
            {#each colorChoices as c (c.color)}
              <option value={c.color}>{c.label}</option>
            {/each}
          </select>
        </div>

        <div class="flex flex-row gap-1 shrink-0">
          <button
            title="Add Vertex"
            onclick={() =>
              editShape(shape, {
                vertices: [...shape.vertices, { x: 50, y: 50 }],
              })}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              class="size-4 stroke-green-500"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          </button>
          {#if shapes.length > 0}
            <button
              title="Remove Shape"
              onclick={() => {
                project.apply(
                  setShapes(shapes.filter((other) => other.id !== shape.id)),
                );
                collapsedObstacles = collapsedObstacles.filter(
                  (_, index) => index !== shapeIdx,
                );
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={2}
                class="size-4 stroke-red-500"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </button>
          {/if}
        </div>
      </div>

      {#if !collapsedObstacles[shapeIdx]}
        {#each shape.vertices as vertex, vertexIdx (vertexIdx)}
          <div
            class={`flex flex-row justify-start items-center ${compact ? "gap-1" : "gap-2"}`}
          >
            <div class={`font-bold ${compact ? "text-xs" : "text-sm"}`}>
              {vertexIdx + 1}:
            </div>
            <div class={`font-extralight ${compact ? "text-xs" : "text-sm"}`}>
              X:
            </div>
            <input
              value={vertex.x}
              oninput={(e) => setVertex(shape, vertexIdx, "x", e.currentTarget)}
              type="number"
              min="0"
              max={FIELD_SIZE}
              step={$snapToGrid && $showGrid ? $gridSize : 0.1}
              title={snapToGridTitle}
              class={`pl-1.5 bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none ${compact ? "w-16 py-0.5 text-xs" : "w-24 py-1 text-sm"}`}
            />
            <div class={`font-extralight ${compact ? "text-xs" : "text-sm"}`}>
              Y:
            </div>
            <input
              value={vertex.y}
              oninput={(e) => setVertex(shape, vertexIdx, "y", e.currentTarget)}
              type="number"
              min="0"
              max={FIELD_SIZE}
              step={$snapToGrid && $showGrid ? $gridSize : 0.1}
              class={`pl-1.5 bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none ${compact ? "w-16 py-0.5 text-xs" : "w-24 py-1 text-sm"}`}
              title={snapToGridTitle}
            />
            {#if $snapToGrid && $showGrid}
              <span class="text-xs text-green-500" title="Snapping enabled"
                >✓</span
              >
            {/if}
            {#if shape.vertices.length > 3}
              <button
                title="Remove Vertex"
                onclick={() =>
                  editShape(shape, {
                    vertices: shape.vertices.filter(
                      (_, index) => index !== vertexIdx,
                    ),
                  })}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width={2}
                  class="size-4 stroke-red-500"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
              </button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/each}

  <button
    onclick={() => {
      project.apply(setShapes([...shapes, createTriangle()]));
      collapsedObstacles = [...collapsedObstacles, true];
    }}
    class="font-semibold text-red-500 text-sm flex flex-row justify-start items-center gap-1 mt-2"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width={2}
      stroke="currentColor"
      class="size-5"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
    <p>Add Obstacle</p>
  </button>
</div>
