<script lang="ts">
  export let startPoint: Point;
  export let addPathAtStart: () => void;
  export let addWaitAtStart: () => void;
</script>

<div class="flex flex-col w-full justify-start items-start gap-0.5">
  <div class="flex items-center justify-between w-full">
    <div class="font-semibold flex items-center gap-2">
      Starting Point
      <button
        title={startPoint.locked
          ? "Unlock Starting Point"
          : "Lock Starting Point"}
        on:click|stopPropagation={() => {
          startPoint.locked = !startPoint.locked;
          startPoint = { ...startPoint }; // Force reactivity
        }}
        class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
      >
        {#if startPoint.locked}
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
    </div>
  </div>
  <div class="flex flex-row justify-start items-center gap-2">
    <span class="font-extralight">X:</span>
    <input
      bind:value={startPoint.x}
      min="0"
      max="144"
      type="number"
      class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-28 dark:bg-neutral-950 dark:border-neutral-700"
      step="0.1"
      disabled={startPoint.locked}
    />
    <span class="font-extralight">Y:</span>
    <input
      bind:value={startPoint.y}
      min="0"
      max="144"
      type="number"
      class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-28 dark:bg-neutral-950 dark:border-neutral-700"
      step="0.1"
      disabled={startPoint.locked}
    />
    <!-- Removed Add Path and Add Wait buttons from starting point section per user request -->
  </div>
</div>
