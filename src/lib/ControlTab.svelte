<script lang="ts">
  import _ from "lodash";
  import { getRandomColor } from "../utils";
  import { history } from "../utils/history";

  // Detect OS for keyboard shortcut labels
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const modKey = isMac ? 'Cmd' : 'Ctrl';

  export let percent: number;
  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let startPoint: Point;
  export let lines: Line[];
  export let robotWidth: number = 16;
  export let robotHeight: number = 16;
  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
  export let settings: FPASettings;
  export let playElapsedMs: number = 0;
  export let pushHistory: () => void = () => {};
  export let undo: () => void = () => {};
  export let redo: () => void = () => {};
  function formatMs(ms: number) {
    const s = Math.floor(ms / 1000);
    const rem = Math.floor(ms % 1000);
    return `${s}.${String(rem).padStart(3, '0')}s`;
  }

  // Ensure each wait line's endPoint matches the previous non-wait path's endPoint (or startPoint)
  function updateWaitPositions() {
    if (!lines) return;
    const newLines = lines.map((l) => ({
      ...l,
      // shallow-copy objects to avoid mutating original references
      endPoint: { ...l.endPoint },
      controlPoints: l.controlPoints ? l.controlPoints.map((p) => ({ ...p })) : [],
    }));

    for (let i = 0; i < newLines.length; i++) {
      const l = newLines[i] as any;
      if (l && l.waitMs !== undefined) {
        // find previous non-wait line
        let j = i - 1;
        while (j >= 0 && (newLines[j] as any).waitMs !== undefined) j--;
        const source = j >= 0 ? (newLines[j] as any).endPoint : startPoint;
        if (source) {
          l.endPoint = { ...source };
        }
      }
    }

    lines = newLines;
  }
</script>

<div class="flex-1 flex flex-shrink-0 flex-col justify-start items-center gap-2 h-full overflow-y-auto">
  <div
    class="flex flex-col justify-start items-start w-full rounded-lg bg-neutral-50 dark:bg-neutral-900 shadow-md p-4 overflow-y-scroll overflow-x-hidden h-full gap-3"
  >
    <div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
      <div class="font-semibold">Canvas Options</div>
      <div class="flex flex-row justify-start items-center gap-2">
        <div class="font-extralight">Robot Length:</div>
        <input
          bind:value={robotWidth}
          on:change={() => {
            if (settings) {
              settings.rWidth = robotWidth;
            }
            pushHistory();
          }}
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-16"
          step="1"
        />
        <div class="font-extralight">Robot Width:</div>
        <input
          bind:value={robotHeight}
          on:change={() => {
            if (settings) {
              settings.rHeight = robotHeight;
            }
            pushHistory();
          }}
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-16 dark:bg-neutral-950 dark:border-neutral-700"
          step="1"
        />
      </div>
    </div>

    <div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
      <div class="font-semibold">Current Robot Position</div>
      <div class="flex flex-row justify-start items-center gap-2">
        <div class="font-extralight">X:</div>
        <div class="w-16">{x.invert(robotXY.x).toFixed(3)}</div>
        <div class="font-extralight">Y:</div>
        <div class="w-16">{y.invert(robotXY.y).toFixed(3)}</div>
        <div class="font-extralight">Heading:</div>
        <div>
          {robotHeading.toFixed(0) === "-0"
            ? "0"
            : -robotHeading.toFixed(0)}&deg;
        </div>
      </div>
    </div>

    <div class="flex flex-col w-full justify-start items-start gap-0.5">
      <div class="font-semibold">Start Point</div>
      <div class="flex flex-row justify-start items-center gap-2">
        <div class="font-extralight">X:</div>
        <input
          bind:value={startPoint.x}
          on:change={pushHistory}
          min="0"
          max="144"
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-28 dark:bg-neutral-950 dark:border-neutral-700"
          step="0.1"
        />
        <div class="font-extralight">Y:</div>
        <input
          bind:value={startPoint.y}
          on:change={pushHistory}
          min="0"
          max="144"
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-28 dark:bg-neutral-950 dark:border-neutral-700"
          step="0.1"
        />
      </div>
    </div>

    {#each lines as line, idx}
      <div class="flex flex-col w-full justify-start items-start gap-1">
        <div class="flex flex-row w-full justify-between">
          <div
            class="font-semibold flex flex-row justify-start items-center gap-2"
          >
            <input
              bind:value={line.name}
              on:change={pushHistory}
              placeholder="Path {idx + 1}"
              class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-semibold"
            />
            <div
              class="size-2.5 rounded-full shadow-md"
              style={`background: ${line.color}`}
            />
          </div>
          <div class="flex flex-row justify-end items-center gap-1">
            <button
              title="Add Control Point"
              on:click={() => {
                line.controlPoints = [
                  ...line.controlPoints,
                  {
                    x: _.random(36, 108),
                    y: _.random(36, 108),
                  },
                ];
                pushHistory();
              }}
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
            {#if lines.length > 1}
              <button
                title="Remove Line"
                on:click={() => {
                  let _lns = lines;
                  _lns.splice(idx, 1);
                  lines = _lns;
                  // ensure waits still reference the correct preceding path
                  updateWaitPositions();
                  pushHistory();
                }}
              >
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
            <button
              title="Move Up"
              on:click={() => {
                if (idx <= 0) return;
                const _lns = lines.slice();
                const tmp = _lns[idx - 1];
                _lns[idx - 1] = _lns[idx];
                _lns[idx] = tmp;
                lines = _lns;
                updateWaitPositions();
                pushHistory();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-5 stroke-yellow-400">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              title="Move Down"
              on:click={() => {
                if (idx >= lines.length - 1) return;
                const _lns = lines.slice();
                const tmp = _lns[idx + 1];
                _lns[idx + 1] = _lns[idx];
                _lns[idx] = tmp;
                lines = _lns;
                updateWaitPositions();
                pushHistory();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-5 stroke-yellow-400">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
        <div class={`h-[0.75px] w-full`} style={`background: ${line.color}`} />
        {#if line.waitMs === undefined}
        <div class="flex flex-col justify-start items-start">
          <div class="font-light">End Point:</div>
          <div class="flex flex-row justify-start items-center gap-2">
            <div class="font-extralight">X:</div>
            <input
              class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
              step="0.1"
              type="number"
              min="0"
              max="144"
              bind:value={line.endPoint.x}
              on:change={pushHistory}
            />
            <div class="font-extralight">Y:</div>
            <input
              class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
              step="0.1"
              min="0"
              max="144"
              type="number"
              bind:value={line.endPoint.y}
              on:change={pushHistory}
            />

            <select
              bind:value={line.endPoint.heading}
              on:change={pushHistory}
              class=" rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28 text-sm"
              title="The heading style of the robot.
With constant heading, the robot maintains the same heading throughout the line.
With linear heading, heading changes linearly between given start and end angles.
With tangential heading, the heading follows the direction of the line."
            >
              <option value="constant">Constant</option>
              <option value="linear">Linear</option>
              <option value="tangential">Tangential</option>
            </select>

            {#if line.endPoint.heading === "linear"}
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
                step="1"
                type="number"
                min="-180"
                max="180"
                bind:value={line.endPoint.startDeg}
                on:change={pushHistory}
                title="The heading the robot starts this line at (in degrees)"
              />
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
                step="1"
                type="number"
                min="-180"
                max="180"
                bind:value={line.endPoint.endDeg}
                on:change={pushHistory}
                title="The heading the robot ends this line at (in degrees)"
              />
            {:else if line.endPoint.heading === "constant"}
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
                step="1"
                type="number"
                min="-180"
                max="180"
                bind:value={line.endPoint.degrees}
                on:change={pushHistory}
                title="The constant heading the robot maintains throughout this line (in degrees)"
              />
            {:else if line.endPoint.heading === "tangential"}
              <p class="text-sm font-extralight">Reverse:</p>
              <input type="checkbox" bind:checked={line.endPoint.reverse} on:change={pushHistory} title="Reverse the direction the robot faces along the tangential path" />
            {/if}
          </div>
        </div>
        {:else}
        <div class="flex flex-col justify-start items-start">
          <div class="font-light">Wait</div>
          <div class="flex flex-row justify-start items-center gap-2">
            <div class="font-extralight">Duration (ms):</div>
            <input
              class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
              step="10"
              type="number"
              min="0"
              bind:value={line.waitMs}
              on:change={() => { line.waitMs = Number(line.waitMs) || 0; pushHistory(); }}
            />
            <div class="font-extralight">(Robot pauses at previous point)</div>
          </div>
        </div>
        {/if}
        {#each line.controlPoints as point, idx1}
          <div class="flex flex-col justify-start items-start">
            <div class="font-light">Control Point {idx1 + 1}:</div>
            <div class="flex flex-row justify-start items-center gap-2">
              <div class="font-extralight">X:</div>
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
                step="0.1"
                type="number"
                bind:value={point.x}
                on:change={pushHistory}
                min="0"
                max="144"
              />
              <div class="font-extralight">Y:</div>
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
                step="0.1"
                type="number"
                bind:value={point.y}
                on:change={pushHistory}
                min="0"
                max="144"
              />
              <button
                title="Remove Control Point"
                on:click={() => {
                  let _pts = line.controlPoints;
                  _pts.splice(idx1, 1);
                  line.controlPoints = _pts;
                  pushHistory();
                }}
              >
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
            </div>
          </div>
        {/each}
      </div>
    {/each}
    <div class="flex flex-row gap-2">
    <button
      on:click={() => {
        lines = [
          ...lines,
          {
            name: `Path ${lines.length + 1}`,
            endPoint: {
              x: _.random(0, 144),
              y: _.random(0, 144),
              heading: "tangential",
              reverse: false,
            },
            controlPoints: [],
            color: getRandomColor(),
          },
        ];
        pushHistory();
      }}
      class="font-semibold text-green-500 text-sm flex flex-row justify-center items-center gap-1 h-8 px-3"
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
      <p>Add Line</p>
    </button>
    <button
      on:click={() => {
        // Add a wait entry: keep endPoint equal to last end point (or startPoint)
        const lastEnd = lines.length > 0 ? lines[lines.length - 1].endPoint : startPoint;
        lines = [
          ...lines,
          {
            name: `Wait ${lines.length + 1}`,
            endPoint: { x: lastEnd.x, y: lastEnd.y, heading: "constant", degrees: 0 },
            controlPoints: [],
            color: '#888888',
            waitMs: 1000,
          },
        ];
        pushHistory();
      }}
      class="font-semibold text-yellow-500 text-sm flex flex-row justify-center items-center gap-1 h-8 px-3"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12M6 12h12" />
      </svg>
      <p>Add Wait</p>
    </button>
    </div>
  </div>
  <div
    class="w-full bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 flex flex-row justify-start items-center gap-3 shadow-lg"
  >
    <div class="flex flex-row items-center gap-1">
      <button
        title="Undo ({modKey}+Z)"
        on:click={undo}
        disabled={$history.past.length === 0}
        class="disabled:opacity-30"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
      </button>
      <button
        title="Redo ({modKey}+Shift+Z)"
        on:click={redo}
        disabled={$history.future.length === 0}
        class="disabled:opacity-30"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
        </svg>
      </button>
    </div>
    <div class="w-[1px] h-6 bg-neutral-200 dark:bg-neutral-800 mx-1" />
    <button
      title="Play/Pause"
      on:click={() => {
        if (playing) {
          pause();
        } else {
          play();
        }
      }}
    >
      {#if !playing}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6 stroke-green-500"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
          />
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6 stroke-green-500"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15.75 5.25v13.5m-7.5-13.5v13.5"
          />
        </svg>
      {/if}
    </button>
    <input
      bind:value={percent}
      type="range"
      min="0"
      max="100"
      step="0.000001"
      class="w-full appearance-none slider focus:outline-none"
    />
    <div class="text-sm font-extralight ml-2">
      {#if playElapsedMs}
        {formatMs(playElapsedMs)}
      {:else}
        0.000s
      {/if}
    </div>
  </div>
</div>
