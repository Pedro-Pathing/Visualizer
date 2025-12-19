<script lang="ts">
    // Helper to create a valid 'linear' Point
    function makeLinearPoint(
      x: number,
      y: number,
      startDeg: number,
      endDeg: number
    ): BasePoint & { heading: "linear"; startDeg: number; endDeg: number; degrees?: never; reverse?: never } {
      return {
        x,
        y,
        heading: 'linear',
        startDeg,
        endDeg
      };
    }
    function makeTangentialPoint(x: number, y: number, reverse: boolean = false): Point {
      return {
        x,
        y,
        heading: "tangential",
        reverse,
      };
    }
  // Collision settings have been moved to Navbar.svelte
  import _ from "lodash";
  import { getRandomColor } from "../utils";
  // ...existing code...

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
  export let playbackSpeed: number = 1;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
  export let settings: FPASettings;

  import { getRobotPercentAndWait } from '../utils';
  // Input handlers to avoid inline TypeScript casts in templates
  function handleStartPointXInput(e: Event) {
    const t = e.target as HTMLInputElement | null;
    if (!t) return;
    startPoint.x = Number(t.value);
  }
  function handleStartPointYInput(e: Event) {
    const t = e.target as HTMLInputElement | null;
    if (!t) return;
    startPoint.y = Number(t.value);
  }
  function handleLineEndXInput(e: Event, lineIdx: number) {
    const t = e.target as HTMLInputElement | null;
    if (!t) return;
    lines[lineIdx].endPoint.x = Number(t.value);
    lines = lines;
  }
  function handleLineEndYInput(e: Event, lineIdx: number) {
    const t = e.target as HTMLInputElement | null;
    if (!t) return;
    lines[lineIdx].endPoint.y = Number(t.value);
    lines = lines;
  }
  function handleControlPointXInput(e: Event, lineIdx: number, ptIdx: number) {
    const t = e.target as HTMLInputElement | null;
    if (!t) return;
    lines[lineIdx].controlPoints[ptIdx].x = Number(t.value);
    lines = lines;
  }
  function handleControlPointYInput(e: Event, lineIdx: number, ptIdx: number) {
    const t = e.target as HTMLInputElement | null;
    if (!t) return;
    lines[lineIdx].controlPoints[ptIdx].y = Number(t.value);
    lines = lines;
  }
  // Precompute playbar percent for each segment end, accounting for waits
  $: markerPercents = lines.map((line, idx) => {
    let lo = 0, hi = 100, target = ((idx+1)/lines.length)*100, found = 100;
    for (let iter = 0; iter < 16; ++iter) {
      let mid = (lo + hi) / 2;
      let { robotPercent } = getRobotPercentAndWait(mid, lines);
      if (robotPercent < target) {
        lo = mid;
      } else {
        found = mid;
        hi = mid;
      }
    }
    found = Math.max(0, Math.min(100, found));
    return found;
  });
</script>

<div class="flex-1 flex flex-shrink-0 flex-col justify-start items-center gap-2 h-full overflow-y-auto">
  <div
    class="flex flex-col justify-start items-start w-full rounded-lg bg-neutral-100 dark:bg-neutral-950 shadow-md p-4 overflow-y-scroll overflow-x-hidden h-full gap-6"
  >
    <div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
      <div class="font-semibold">Canvas Options</div>
      <div class="flex flex-row justify-start items-center gap-2">
        <div class="font-extralight">Robot Length:</div>
        <input
          bind:value={robotWidth}
          on:change={() => {
            if (robotWidth < 12) robotWidth = 12;
            if (robotWidth > 18) robotWidth = 18;
            if (settings) {
              settings.rWidth = robotWidth;
            }
          }}
          type="number"
          min="12"
          max="18"
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-16"
          step="1"
        />
        <div class="font-extralight">Robot Width:</div>
        <input
          bind:value={robotHeight}
          on:change={() => {
            if (robotHeight < 12) robotHeight = 12;
            if (robotHeight > 18) robotHeight = 18;
            if (settings) {
              settings.rHeight = robotHeight;
            }
          }}
          type="number"
          min="12"
          max="18"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-16 dark:bg-neutral-950 dark:border-neutral-700"
          step="1"
        />
      </div>
        <!-- Collision settings moved to Navbar.svelte -->
      <div class="text-xs text-neutral-500 dark:text-neutral-400">Size must be between 12" and 18"</div>
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
          min="1"
          max="143"
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-28 dark:bg-neutral-950 dark:border-neutral-700"
          step="0.1"
          on:input={(e) => handleStartPointXInput(e)}
          on:change={() => { startPoint.x = Math.max(1, Math.min(143, Number(startPoint.x))); }}
        />
        <div class="font-extralight">Y:</div>
        <input
          bind:value={startPoint.y}
          min="3"
          max="143"
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-28 dark:bg-neutral-950 dark:border-neutral-700"
          step="0.1"
          on:input={(e) => handleStartPointYInput(e)}
          on:change={() => { startPoint.y = Math.max(3, Math.min(143, Number(startPoint.y))); }}
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
              placeholder="Path {idx + 1}"
              class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-semibold"
            />
            <div
              class="size-2.5 rounded-full shadow-md"
              style={`background: ${line.color}`}
            />
            <input
              type="color"
              bind:value={line.color}
              title="Line color"
              class="w-6 h-6 p-0 border-0 bg-transparent"
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
                    color: line.color,
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
              title="Insert Line After This Path"
              on:click={() => {
                // Get the current endpoint as the start of the new segment
                const currentEnd = line.endPoint;
                // Create a new line that starts from current endpoint
                // and ends at a point between current end and next line's end (or random if last)
                const newEndX = idx < lines.length - 1 
                  ? (currentEnd.x + lines[idx + 1].endPoint.x) / 2 
                  : _.random(1, 143);
                const newEndY = idx < lines.length - 1 
                  ? (currentEnd.y + lines[idx + 1].endPoint.y) / 2 
                  : _.random(3, 143);


                // Prefill angles from previous endpoint
                let prevEndDeg = (currentEnd.heading === 'linear' ? currentEnd.endDeg : currentEnd.heading === 'constant' ? currentEnd.degrees : 0) || 0;
                const newEndPoint = makeLinearPoint(newEndX, newEndY, prevEndDeg, prevEndDeg);
                const newLine = {
                  name: `Path ${idx + 2}`,
                  endPoint: newEndPoint,
                  controlPoints: [],
                  color: getRandomColor(),
                };

                // Insert the new line after the current one

                lines.splice(idx + 1, 0, newLine);

                // Update names for subsequent paths

                for (let i = idx + 2; i < lines.length; i++) {
                  if (lines[i] && typeof lines[i].name === 'string' && lines[i].name.startsWith('Path ')) {
                    lines[i].name = `Path ${i + 1}`;
                  }
                }

                lines = lines; // Trigger reactivity
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={2}
                class="size-5 stroke-blue-500"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </button>
            {#if lines.length > 1}
              <button
                title="Remove Line"
                on:click={() => {
                  let _lns = lines;
                  lines.splice(idx, 1);
                  lines = _lns;
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
              min="1"
              max="143"
              bind:value={line.endPoint.x}
              on:input={(e) => handleLineEndXInput(e, idx)}
              on:change={() => { line.endPoint.x = Math.max(1, Math.min(143, Number(line.endPoint.x))); }}
            />
            <div class="font-extralight">Y:</div>
            <input
              class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
              step="0.1"
              min="3"
              max="143"
              type="number"
              bind:value={line.endPoint.y}
              on:input={(e) => handleLineEndYInput(e, idx)}
              on:change={() => { line.endPoint.y = Math.max(3, Math.min(143, Number(line.endPoint.y))); }}
            />

            <input
              type="color"
              bind:value={line.endPoint.color}
              on:input={() => { if (!line.endPoint.color) line.endPoint.color = line.color }}
              title="End point color"
              class="w-6 h-6 p-0 border-0 bg-transparent"
            />

            <select
              bind:value={line.endPoint.heading}
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
                title="The heading the robot starts this line at (in degrees)"
              />
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
                step="1"
                type="number"
                min="-180"
                max="180"
                bind:value={line.endPoint.endDeg}
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
                title="The constant heading the robot maintains throughout this line (in degrees)"
              />
            {:else if line.endPoint.heading === "tangential"}
              <p class="text-sm font-extralight">Reverse:</p>
              <input type="checkbox" bind:checked={line.endPoint.reverse} title="Reverse the direction the robot faces along the tangential path" />
            {/if}
          </div>
          <div class="flex flex-row justify-start items-center gap-2 mt-1">
            <div class="font-extralight">Wait:</div>
            <input
              class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-16"
              step="0.1"
              type="number"
              min="0"
              bind:value={line.waitTime}
              placeholder="0"
              title="Time in seconds to wait after reaching this point"
            />
            <div class="font-extralight text-xs">sec</div>
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
                min="1"
                max="143"
                on:input={(e) => handleControlPointXInput(e, idx, idx1)}
                on:change={() => { point.x = Math.max(1, Math.min(143, Number(point.x))); }}
              />
              <div class="font-extralight">Y:</div>
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
                step="0.1"
                type="number"
                bind:value={point.y}
                min="3"
                max="143"
                on:input={(e) => handleControlPointYInput(e, idx, idx1)}
                on:change={() => { point.y = Math.max(3, Math.min(143, Number(point.y))); }}
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
              <input
                type="color"
                bind:value={point.color}
                on:input={() => { if (!point.color) point.color = line.color }}
                title="Control point color"
                class="w-6 h-6 p-0 border-0 bg-transparent"
              />
          </div>
        {/each}
      </div>
    {/each}
    <button
      on:click={() => {
        lines = [
          ...lines,
          {
            name: `Path ${lines.length + 1}`,
            endPoint: {
              x: _.random(1, 143),
              y: _.random(3, 143),
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
    class="w-full bg-neutral-100 dark:bg-neutral-950 rounded-lg p-3 flex flex-col justify-start items-center gap-3 shadow-lg"
  >
    <!-- Speed Control - Above playbar -->
    <div class="flex items-center gap-3 w-full">
      <span class="text-xs font-medium text-neutral-600 dark:text-neutral-400">Speed</span>
      <input
        bind:value={playbackSpeed}
        type="range"
        min="0.25"
        max="3"
        step="0.25"
        class="flex-1 h-2 appearance-none rounded-full bg-neutral-300 dark:bg-neutral-700 cursor-pointer slider-speed focus:outline-none"
        title="Playback speed: {playbackSpeed}x"
      />
      <span class="text-xs font-bold text-blue-500 dark:text-blue-400 min-w-[2.5rem] text-right">{playbackSpeed}x</span>
    </div>
    
    <!-- Playbar -->
    <div class="flex flex-row w-full justify-start items-center gap-3">
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
      <div class="relative w-full h-5 flex items-center">
        <input
          bind:value={percent}
          type="range"
          min="0"
          max="100"
          step="0.000001"
          class="w-full appearance-none slider focus:outline-none absolute inset-0"
        />
        <!-- Waypoint markers -->
        <!-- Compute playbar percent for each segment end, accounting for waits -->
        {#if lines.length > 0}
          <button
            class="absolute w-3 h-3 rounded-full transform -translate-x-1/2 z-10 hover:scale-125 transition-transform border-2 border-white dark:border-neutral-800 shadow-sm"
            style="left: 0%; background: {lines[0].color};"
            title={`Start Point (${startPoint.x.toFixed(1)}, ${startPoint.y.toFixed(1)})`}
            on:click={() => { percent = 0; }}
          />
          {#each markerPercents as found, idx}
            <button
              class="absolute w-3 h-3 rounded-full transform -translate-x-1/2 z-10 hover:scale-125 transition-transform border-2 border-white dark:border-neutral-800 shadow-sm"
              style={`left: ${found}%; background: ${lines[idx].color};`}
              title={`${lines[idx].name || `Path ${idx + 1}`} End (${lines[idx].endPoint.x.toFixed(1)}, ${lines[idx].endPoint.y.toFixed(1)})`}
              on:click={() => { percent = found - 0.000001; }}
            />
          {/each}
        {/if}
      <script lang="ts">
        // ...existing code...

        // Precompute playbar percent for each segment end, accounting for waits
        $: markerPercents = lines.map((line, idx) => {
          let lo = 0, hi = 100, target = ((idx+1)/lines.length)*100, found = 100;
          for (let iter = 0; iter < 16; ++iter) {
            let mid = (lo + hi) / 2;
            let { robotPercent } = getRobotPercentAndWait(mid);
            if (robotPercent < target) {
              lo = mid;
            } else {
              found = mid;
              hi = mid;
            }
          }
          found = Math.max(0, Math.min(100, found));
          return found;
        });
      </script>
      </div>
    </div>
  </div>
</div>
