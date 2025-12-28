<script lang="ts">
  import _ from "lodash";
  import { snapToGrid, showGrid, gridSize } from "../../stores";

  export let line: Line;
  export let lineIdx: number;
  export let collapsed: boolean;
  export let recordChange: () => void;

  $: snapToGridTitle =
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping";

  function toggleCollapsed() {
    collapsed = !collapsed;
  }
</script>

<div class="flex flex-col w-full justify-start items-start mt-2">
  <!-- Control Points header with toggle and add button -->
  <div class="flex items-center justify-between w-full">
    <button
      on:click={toggleCollapsed}
      class="flex items-center gap-2 font-light hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-sm"
      title="{collapsed ? 'Show' : 'Hide'} control points"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-3 transition-transform {collapsed
          ? 'rotate-0'
          : 'rotate-90'}"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m8.25 4.5 7.5 7.5-7.5 7.5"
        />
      </svg>
      Control Points ({line.controlPoints.length})
    </button>
    <!-- Blue inline Add Control Point button removed; use global green plus instead -->
  </div>

  <!-- Control Points list (shown when expanded) -->
  {#if !collapsed && line.controlPoints.length > 0}
    <div class="w-full mt-2 space-y-2">
      {#each line.controlPoints as point, idx1}
        <div
          class="flex flex-col p-2 border border-blue-300 dark:border-blue-700 rounded-md bg-blue-50 dark:bg-blue-900/20"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-blue-500"></div>
              <span
                class="text-sm font-medium text-blue-700 dark:text-blue-300"
              >
                Control Point {idx1 + 1}
              </span>
            </div>
            <button
              on:click={() => {
                let _pts = line.controlPoints;
                _pts.splice(idx1, 1);
                line.controlPoints = _pts;
                recordChange();
              }}
              class="text-red-500 hover:text-red-600"
              title="Remove Control Point"
              disabled={line.locked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={2}
                class="size-4"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
            </button>
          </div>

          <!-- Control Point Position Inputs -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-neutral-600 dark:text-neutral-400"
              >X:</span
            >
            <input
              bind:value={point.x}
              type="number"
              min="0"
              max="144"
              step={$snapToGrid && $showGrid ? $gridSize : 0.1}
              class="w-20 px-2 py-1 text-xs rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              on:change={() => {
                // Update the array to trigger reactivity
                line.controlPoints = [...line.controlPoints];
              }}
              disabled={line.locked}
              title={snapToGridTitle}
            />
            <span class="text-xs text-neutral-600 dark:text-neutral-400"
              >Y:</span
            >
            <input
              bind:value={point.y}
              type="number"
              min="0"
              max="144"
              step={$snapToGrid && $showGrid ? $gridSize : 0.1}
              class="w-20 px-2 py-1 text-xs rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              on:change={() => {
                // Update the array to trigger reactivity
                line.controlPoints = [...line.controlPoints];
              }}
              disabled={line.locked}
              title={snapToGridTitle}
            />
          </div>

          <div class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Line {lineIdx + 1}, Control Point {idx1 + 1}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
