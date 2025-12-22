<script lang="ts">
  export let line: Line;
  export let lineIdx: number;
  export let collapsed: boolean;

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  function addEventMarker() {
    if (!line.eventMarkers) {
      line.eventMarkers = [];
    }
    line.eventMarkers.push({
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Event_${lineIdx + 1}_${line.eventMarkers.length + 1}`,
      position: 0.5,
      lineIndex: lineIdx,
    });
    line = { ...line }; // Force reactivity
  }

  function removeEventMarker(eventIdx: number) {
    if (line.eventMarkers) {
      line.eventMarkers.splice(eventIdx, 1);
      line = { ...line };
    }
  }
</script>

<div class="flex flex-col w-full justify-start items-start mt-2">
  <div class="flex items-center justify-between w-full">
    <button
      on:click={toggleCollapsed}
      class="flex items-center gap-2 font-light hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-sm"
      title="{collapsed ? 'Show' : 'Hide'} event markers"
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
      Event Markers ({line.eventMarkers?.length || 0})
    </button>
    <button
      on:click={addEventMarker}
      class="text-sm text-purple-500 hover:text-purple-600 flex items-center gap-1 px-2 py-1"
      title="Add Event Marker"
      disabled={line.locked}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-4"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
      Add Marker
    </button>
  </div>

  {#if !collapsed && line.eventMarkers && line.eventMarkers.length > 0}
    <div class="w-full mt-2 space-y-2">
      {#each line.eventMarkers as event, eventIdx}
        <div
          class="flex flex-col p-2 border border-purple-300 dark:border-purple-700 rounded-md bg-purple-50 dark:bg-purple-900/20"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-purple-500"></div>
              <input
                bind:value={event.name}
                class="pl-1.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm w-32"
                placeholder="Event name"
                disabled={line.locked}
                on:change={() => {
                  // Update the array to trigger reactivity
                  line.eventMarkers = [...line.eventMarkers];
                }}
              />
            </div>
            <!-- Event delete Button -->

            <button
              on:click={() => removeEventMarker(eventIdx)}
              class="text-red-500 hover:text-red-600"
              title="Remove Event Marker"
              disabled={line.locked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={2}
                class="size-4"
                stroke="red"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
            </button>
          </div>

          <!-- Position Slider and text -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-neutral-600 dark:text-neutral-400"
              >Position:</span
            >
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={event.position}
              class="flex-1 slider"
              disabled={line.locked}
              on:input={(e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value)) {
                  event.position = value;
                  line.eventMarkers = [...line.eventMarkers];
                }
              }}
            />
            <input
              type="number"
              value={event.position}
              disabled={line.locked}
              min="0"
              max="1"
              step="0.01"
              class="w-16 px-2 py-1 text-xs rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
              on:input={(e) => {
                // Don't update immediately, just show the typed value
                // We'll validate on blur or Enter
              }}
              on:blur={(e) => {
                const value = parseFloat(e.target.value);
                if (isNaN(value) || value < 0 || value > 1) {
                  // Invalid - revert to current value
                  e.target.value = event.position;
                  return;
                }
                // Valid - update
                event.position = value;
                line.eventMarkers = [...line.eventMarkers];
              }}
              on:keydown={(e) => {
                if (e.key === "Enter") {
                  const value = parseFloat(e.target.value);
                  if (isNaN(value) || value < 0 || value > 1) {
                    // Invalid - revert
                    e.target.value = event.position;
                    e.preventDefault();
                    return;
                  }
                  // Valid - update
                  event.position = value;
                  line.eventMarkers = [...line.eventMarkers];
                  e.target.blur(); // Trigger blur to update
                }
              }}
            />
          </div>

          <div class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Line {lineIdx + 1}, Position: {event.position.toFixed(2)}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
