<script lang="ts">
  import type { Line } from "../../types";
  import { snapToGrid, showGrid, gridSize } from "../../stores";
  import EventMarkersSection from "./EventMarkersSection.svelte";
  import ControlPointsSection from "./ControlPointsSection.svelte";
  import HeadingControls from "./HeadingControls.svelte";

  export let line: Line;
  export let idx: number;
  export let lines: Line[];
  export let collapsed: boolean;
  export let collapsedEventMarkers: boolean;
  export let collapsedControlPoints: boolean;
  export let onRemove: () => void;
  export let onInsertAfter: () => void;
  export let onAddWaitAfter: () => void;
  export let recordChange: () => void;
  export let onMoveUp: () => void;
  export let onMoveDown: () => void;
  export let canMoveUp: boolean = true;
  export let canMoveDown: boolean = true;

  $: snapToGridTitle =
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping";

  function toggleCollapsed() {
    collapsed = !collapsed;
  }
</script>

<div class="flex flex-col w-full justify-start items-start gap-1">
  <div class="flex flex-row w-full justify-between items-center">
    <div class="flex flex-row items-center gap-2">
      <button
        on:click={toggleCollapsed}
        class="flex items-center gap-2 font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors"
        title="{collapsed ? 'Expand' : 'Collapse'} path"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-4 transition-transform {collapsed
            ? 'rotate-0'
            : 'rotate-90'}"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>
        Path {idx + 1}
      </button>

      <input
        bind:value={line.name}
        placeholder="Path {idx + 1}"
        class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-semibold"
        disabled={line.locked}
        on:input={() => {
          // Force parent reactivity so other components (like exporters)
          // pick up the updated name immediately.
          lines = [...lines];
        }}
        on:blur={() => {
          // Commit the change for history/undo
          lines = [...lines];
          if (recordChange) recordChange();
        }}
      />
      <div
        class="relative size-5 rounded-full overflow-hidden shadow-sm border border-neutral-300 dark:border-neutral-600 shrink-0"
        style="background-color: {line.color}"
      >
        <input
          type="color"
          bind:value={line.color}
          class="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
          title="Change Path Color"
        />
      </div>

      <!-- Lock/Unlock Button -->
      <button
        title={line.locked ? "Unlock Path" : "Lock Path"}
        on:click|stopPropagation={() => {
          line.locked = !line.locked;
          lines = [...lines]; // Force reactivity
        }}
        class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
      >
        {#if line.locked}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 stroke-yellow-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 stroke-gray-400"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {/if}
      </button>

      <div class="flex flex-row gap-0.5 ml-1">
        <button
          title={line.locked ? "Path locked" : "Move up"}
          on:click|stopPropagation={() => {
            if (!line.locked && onMoveUp) onMoveUp();
          }}
          class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canMoveUp || line.locked}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m5 15 7-7 7 7"
            />
          </svg>
        </button>
        <button
          title={line.locked ? "Path locked" : "Move down"}
          on:click|stopPropagation={() => {
            if (!line.locked && onMoveDown) onMoveDown();
          }}
          class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canMoveDown || line.locked}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m19 9-7 7-7-7"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="flex flex-row justify-end items-center gap-1">
      <!-- Add Point After Button -->

      <button
        title="Add Point After This Line"
        on:click={onInsertAfter}
        class="text-blue-500 hover:text-blue-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          class="size-5 stroke-green-500"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
      </button>

      <!-- Add Wait After Button -->
      <button
        title="Add Wait After"
        on:click={onAddWaitAfter}
        class="text-orange-500 hover:text-orange-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-5"
        >
          <circle cx="12" cy="12" r="9" />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 7v5l3 2"
          />
        </svg>
      </button>

      {#if lines.length > 1}
        <button title="Remove Line" on:click={onRemove}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            class="size-5 stroke-red-500"
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

  {#if !collapsed}
    <div class={`h-[0.75px] w-full`} style={`background: ${line.color}`} />

    <div class="flex flex-col justify-start items-start w-full">
      <div class="font-light">Point Position:</div>
      <div class="flex flex-row justify-start items-center gap-2">
        <div class="font-extralight">X:</div>
        <input
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
          step={$snapToGrid && $showGrid ? $gridSize : 0.1}
          type="number"
          min="0"
          max="144"
          bind:value={line.endPoint.x}
          disabled={line.locked}
          title={snapToGridTitle}
        />
        <div class="font-extralight">Y:</div>
        <input
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
          step={$snapToGrid && $showGrid ? $gridSize : 0.1}
          min="0"
          max="144"
          type="number"
          bind:value={line.endPoint.y}
          disabled={line.locked}
          title={snapToGridTitle}
        />

        <HeadingControls
          endPoint={line.endPoint}
          locked={line.locked}
          on:change={() => {
            // Force reactivity so timeline recalculates immediately
            lines = [...lines];
          }}
          on:commit={() => {
            // Commit change to history
            lines = [...lines];
            recordChange();
          }}
        />
      </div>
    </div>

    <EventMarkersSection
      bind:line
      lineIdx={idx}
      bind:collapsed={collapsedEventMarkers}
    />

    <ControlPointsSection
      bind:line
      lineIdx={idx}
      bind:collapsed={collapsedControlPoints}
      {recordChange}
    />
  {/if}
</div>
