<script lang="ts">
  import { stopPropagation } from "svelte/legacy";

  import type { StartPose } from "../../types";
  import CoordinateInput from "./ui/CoordinateInput.svelte";

  interface Props {
    startPoint: StartPose;
  }

  let { startPoint = $bindable() }: Props = $props();

  const INPUT_CLASS =
    "w-full rounded-md border-[0.5px] bg-neutral-100 px-2 py-1 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950";
</script>

<div class="flex flex-col w-full justify-start items-start gap-2">
  <div class="flex items-start justify-between w-full gap-2">
    <div class="font-semibold flex items-center gap-2">
      Starting Point
      <button
        title={startPoint.locked
          ? "Unlock Starting Point"
          : "Lock Starting Point"}
        onclick={stopPropagation(() => {
          startPoint.locked = !startPoint.locked;
          startPoint = { ...startPoint };
        })}
        class="p-1 rounded transition-colors duration-250"
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

  <div class="grid w-full grid-cols-1 gap-2">
    <label class="flex flex-col gap-1 text-xs">
      <span class="font-extralight">Name</span>
      <input
        value={startPoint.name ?? ""}
        oninput={(e) => {
          startPoint.name = e.currentTarget.value;
          startPoint = { ...startPoint };
        }}
        type="text"
        placeholder="start"
        class="w-full rounded-md border-[0.5px] bg-neutral-100 px-2 py-1 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
        disabled={startPoint.locked}
      />
    </label>

    {#each ["x", "y"] as const as axis (axis)}
      <label class="flex flex-col gap-1 text-xs">
        <span class="font-extralight">{axis.toUpperCase()}</span>
        <CoordinateInput
          point={startPoint}
          {axis}
          onChange={(next) => (startPoint = { ...startPoint, ...next })}
          class={INPUT_CLASS}
          disabled={startPoint.locked}
        />
      </label>
    {/each}
  </div>
</div>
