<script lang="ts">
  import _ from "lodash";
  import { getRandomColor } from "../utils";
  import { dndzone } from 'svelte-dnd-action';

  export let percent: number;
  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let startPoint: Point;
  export let lines: Line[];
  export let robotWidth: number;
  export let robotHeight: number;
  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
</script>

<div class="flex-1 flex flex-col justify-start items-center gap-2 h-full">
  <div
    class="flex flex-col justify-start items-start w-full rounded-lg bg-neutral-50 dark:bg-neutral-900 shadow-md p-4 overflow-y-scroll overflow-x-hidden h-full gap-6"
  >
    <div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
      <div class="font-semibold">Canvas Options</div>
      <div class="flex flex-row justify-start items-center gap-2">
        <div class="font-extralight">Robot Width:</div>
        <input
          bind:value={robotWidth}
          on:input={() => {
            if (robotWidth > 18) robotWidth = 18;
            else if (robotWidth < 1 && robotWidth != undefined) robotWidth = 1;
          }}
          max="18"
          min="1"
          step="0.5"
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-16"
        />
        <div class="font-extralight">Robot Height:</div>
        <input
          bind:value={robotHeight}
          on:input={() => {
            if (robotHeight > 18) robotHeight = 18;
            else if (robotHeight < 1 && robotHeight != undefined) robotHeight = 1;
          }}
          max="18"
          min="1"
          step="0.5"
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-16 dark:bg-neutral-950 dark:border-neutral-700"
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
          on:input={() => {
            if (startPoint.x > 144) startPoint.x = 144;
            else if (startPoint.x < 0 && startPoint.x != undefined) startPoint.x = 0;
          }}
          min="0"
          max="144"
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-28 dark:bg-neutral-950 dark:border-neutral-700"
          step="0.1"
        />
        <div class="font-extralight">Y:</div>
        <input
          bind:value={startPoint.y}
          on:input={() => {
            if (startPoint.y > 144) startPoint.y = 144;
            else if (startPoint.y < 0 && startPoint.y != undefined) startPoint.y = 0;
          }}
          min="0"
          max="144"
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-28 dark:bg-neutral-950 dark:border-neutral-700"
          step="0.1"
        />
      </div>
    </div>

    <div class="flex flex-col w-full justify-start items-start gap-0.5" use:dndzone={{ items: lines, flipDuration: 300 }}>
      <div class="font-semibold">Lines</div>
      {#each lines as line, idx (line.id)}
        <div class="flex flex-col w-full justify-start items-start gap-1" data-dnd-item>
          <div class="flex flex-row w-full justify-between">
            <div
              class="font-semibold flex flex-row justify-start items-center gap-2"
            >
              <p>Line {idx + 1}</p>
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
              <button
                title="Remove Line"
                on:click={() => {
                  lines.splice(idx, 1);
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
          <div class={`h-[0.75px] w-full`} style={`background: ${line.color}`} />
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
                on:input={() => {
                  if (line.endPoint.x > 144) line.endPoint.x = 144;
                  else if (line.endPoint.x < 0 && line.endPoint.x != undefined) line.endPoint.x = 0;
                }}
              />
              <div class="font-extralight">Y:</div>
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
                step="0.1"
                min="0"
                max="144"
                type="number"
                bind:value={line.endPoint.y}
                on:input={() => {
                  if (line.endPoint.y > 144) line.endPoint.y = 144;
                  else if (line.endPoint.y < 0 && line.endPoint.y != undefined) line.endPoint.y = 0;
                }}
              />

              <select
                bind:value={line.endPoint.heading}
                class=" rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28 text-sm"
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
                  on:input={() => {
                    if (line.endPoint.startDeg > 180) line.endPoint.startDeg = 180;
                    else if (line.endPoint.startDeg < -180 && line.endPoint.startDeg != undefined) line.endPoint.startDeg = -180;
                  }}
                />
                <input
                  class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
                  step="1"
                  type="number"
                  min="-180"
                  max="180"
                  bind:value={line.endPoint.endDeg}
                  on:input={() => {
                    if (line.endPoint.endDeg > 180) line.endPoint.endDeg = 180;
                    else if (line.endPoint.endDeg < -180 && line.endPoint.endDeg != undefined) line.endPoint.endDeg = -180;
                  }}
                />
              {:else if line.endPoint.heading === "constant"}
                <input
                  class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
                  step="1"
                  type="number"
                  min="-180"
                  max="180"
                  bind:value={line.endPoint.degrees}
                  on:input={() => {
                    if (line.endPoint.degrees > 180) line.endPoint.degrees = 180;
                    else if (line.endPoint.degrees < -180 && line.endPoint.degrees != undefined) line.endPoint.degrees = -180;
                  }}
                />
              {:else if line.endPoint.heading === "tangential"}
                <p class="text-sm font-extralight">Reverse:</p>
                <input type="checkbox" bind:checked={line.endPoint.reverse} />
              {/if}
            </div>
          </div>
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
                  min="0"
                  max="144"
                  on:input={() => {
                    if (point.x > 140) point.x = 140;
                    else if (point.x < 0 && point.x != undefined) point.x = 0;
                  }}
                />
                <div class="font-extralight">Y:</div>
                <input
                  class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
                  step="0.1"
                  type="number"
                  bind:value={point.y}
                  on:input={() => {
                    if (point.y > 140) point.y = 140;
                    else if (point.y < 0 && point.y != undefined) point.y = 0;
                  }}
                  min="0"
                  max="144"
                />
                <button
                  title="Remove Control Point"
                  on:click={() => {
                    let _pts = line.controlPoints;
                    _pts.splice(idx1, 1);
                    line.controlPoints = _pts;
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
    </div>
    <button
      on:click={() => {
        lines = [
          ...lines,
          {
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
      }}
      class="font-semibold text-green-500 text-sm flex flex-row justify-start items-center gap-1"
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
  </div>
  <div
    class="w-full bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 flex flex-row justify-start items-center gap-3 shadow-lg"
  >
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
  </div>
</div>
