<script lang="ts">
  import { createTriangle } from "../../utils";
  import { snapToGrid, showGrid, gridSize } from "../../stores";

  export let shapes: Shape[];
  export let collapsedObstacles: boolean[];

  $: snapToGridTitle =
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping";

  function toggleObstacle(index: number) {
    collapsedObstacles[index] = !collapsedObstacles[index];
    collapsedObstacles = [...collapsedObstacles]; // Force reactivity
  }

  function toggleAllObstacles() {
    const allCollapsed = collapsedObstacles.every((c) => c);
    collapsedObstacles = collapsedObstacles.map(() => !allCollapsed);
  }
</script>

<div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
  <div class="flex items-center gap-2 w-full">
    <button
      on:click={toggleAllObstacles}
      class="flex items-center gap-2 font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors"
      title="{collapsedObstacles.every((c) => c)
        ? 'Expand all'
        : 'Collapse all'} obstacles"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-4 transition-transform {collapsedObstacles.every((c) => c)
          ? 'rotate-0'
          : 'rotate-90'}"
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

  {#each shapes as shape, shapeIdx}
    <div
      class="flex flex-col w-full justify-start items-start gap-1 p-2 border rounded-md border-neutral-300 dark:border-neutral-600 mt-2"
    >
      <div class="flex flex-row w-full justify-between items-center">
        <div class="flex flex-row items-center gap-2">
          <button
            on:click={() => toggleObstacle(shapeIdx)}
            class="flex items-center gap-2 font-medium text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors"
            title="{collapsedObstacles[shapeIdx]
              ? 'Expand'
              : 'Collapse'} obstacle"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-4 transition-transform {collapsedObstacles[shapeIdx]
                ? 'rotate-0'
                : 'rotate-90'}"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m8.25 4.5 7.5 7.5-7.5 7.5"
              />
            </svg>
            Obstacle {shapeIdx + 1}
          </button>

          <input
            bind:value={shape.name}
            placeholder="Obstacle {shapeIdx + 1}"
            class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-medium"
          />
          <div
            class="relative size-5 rounded-full overflow-hidden shadow-sm border border-neutral-300 dark:border-neutral-600 shrink-0"
            style="background-color: {shape.color}"
          >
            <input
              type="color"
              bind:value={shape.color}
              class="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
              title="Change Obstacle Color"
            />
          </div>
        </div>

        <div class="flex flex-row gap-1">
          <button
            title="Add Vertex"
            on:click={() => {
              shape.vertices = [...shape.vertices, { x: 50, y: 50 }];
            }}
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
              on:click={() => {
                shapes.splice(shapeIdx, 1);
                shapes = shapes;
                // Also remove the collapsed state for this obstacle
                collapsedObstacles.splice(shapeIdx, 1);
                collapsedObstacles = [...collapsedObstacles];
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
        {#each shape.vertices as vertex, vertexIdx}
          <div class="flex flex-row justify-start items-center gap-2">
            <div class="font-bold text-sm">{vertexIdx + 1}:</div>
            <div class="font-extralight text-sm">X:</div>
            <input
              bind:value={vertex.x}
              type="number"
              min="0"
              max="144"
              step={$snapToGrid && $showGrid ? $gridSize : 0.1}
              title={snapToGridTitle}
              class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-24 text-sm"
            />
            <div class="font-extralight text-sm">Y:</div>
            <input
              bind:value={vertex.y}
              type="number"
              min="0"
              max="144"
              step={$snapToGrid && $showGrid ? $gridSize : 0.1}
              class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-24 text-sm"
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
                on:click={() => {
                  shape.vertices.splice(vertexIdx, 1);
                  shape.vertices = shape.vertices;
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
        {/each}
      {/if}
    </div>
  {/each}

  <button
    on:click={() => {
      shapes = [...shapes, createTriangle(shapes.length)];
      // Add a new collapsed state for the new obstacle (default to collapsed)
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
