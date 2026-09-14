<script lang="ts">
  import { formatTime } from "../../utils";

  interface Props {
    playing: boolean;
    play: () => any;
    pause: () => any;
    percent: number;
    handleSeek: (percent: number) => void;
    loopAnimation?: boolean;
    markers?: { percent: number; color: string; name: string }[];
    // totalTime is in seconds
    totalTime?: number;
  }

  let {
    playing,
    play,
    pause,
    percent = $bindable(),
    handleSeek,
    loopAnimation = $bindable(true),
    markers = [],
    totalTime = 0,
  }: Props = $props();

  let elapsedSeconds = $derived((percent / 100) * (totalTime || 0));
  let completionPercent = $derived(
    Math.round(Math.max(0, Math.min(100, percent))),
  );
</script>

<div
    class="w-full shrink-0 rounded-lg bg-neutral-50 p-3 shadow-lg dark:bg-neutral-900"
>
  <div class="flex min-w-0 items-center gap-3">
    <div class="flex shrink-0 items-center gap-1">
      <button
        title="Play/Pause"
        onclick={() => {
          if (playing) pause();
          else play();
        }}
      >
        {#if !playing}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6 stroke-green-500">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6 stroke-green-500">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
          </svg>
        {/if}
      </button>

      <button
        title={loopAnimation ? "Disable Loop" : "Enable Loop"}
        onclick={() => (loopAnimation = !loopAnimation)}
        class:opacity-100={loopAnimation}
        class:opacity-50={!loopAnimation}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6 stroke-blue-500">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      </button>
    </div>

    <div class="relative h-3 min-w-0 flex-1">
      <div class="absolute inset-x-0 bottom-0 h-3 rounded-full bg-neutral-300 shadow-inner dark:bg-neutral-700">
      <div
        class="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-green-500"
        style={`width: ${completionPercent}%`}
      ></div>
      {#each markers as m, i (i)}
        <div
          class="absolute z-20"
          role="button"
          tabindex="0"
          onclick={() => handleSeek(m.percent)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleSeek(m.percent);
          }}
          style={`left: ${m.percent}%; top: 1px; transform: translateX(-50%); width: 10px; height: 10px; border-radius: 9999px; background: ${m.color}; box-shadow: 0 0 0 2px rgba(0,0,0,0.25); cursor: pointer;`}
          title={m.name}
          aria-label={m.name}
        ></div>
      {/each}

      <input
        bind:value={percent}
        type="range"
        min="0"
        max="100"
        step="0.000001"
        aria-label={`Playback progress: ${completionPercent}%`}
        class="slider absolute inset-0 z-10 h-3 w-full appearance-none focus:outline-none"
        oninput={(e) => handleSeek(parseFloat(e.currentTarget.value))}
      />
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
      <div class="whitespace-nowrap">
        {formatTime(elapsedSeconds)} / {formatTime(totalTime || 0)}
      </div>
      <div
        class="flex h-8 w-14 items-center justify-center rounded border border-neutral-300 bg-neutral-100 px-2 font-semibold tabular-nums text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        aria-label="Playback completion"
      >
        {completionPercent}%
      </div>
    </div>
  </div>
</div>
