<script lang="ts">
  import _ from "lodash";
  import { getRandomColor } from "../utils";

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
  export let fpa: (arg0: FPALine) => Line;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
  export let settings: FPASettings;
  export let shapes: Shape[];

  function createTriangle(): Shape {
    return {
      id: `triangle-${shapes.length + 1}`,
      name: `Obstacle ${shapes.length + 1}`,
      vertices: [
        { x: 30, y: 30 },
        { x: 50, y: 30 },
        { x: 40, y: 50 }
      ],
      color: "#dc2626",
      fillColor: "#fca5a5"
    };
  }

  function createRectangle(): Shape {
    return {
      id: `rectangle-${shapes.length + 1}`,
      name: `Obstacle ${shapes.length + 1}`,
      vertices: [
        { x: 30, y: 30 },
        { x: 60, y: 30 },
        { x: 60, y: 50 },
        { x: 30, y: 50 }
      ],
      color: "#dc2626",
      fillColor: "#fca5a5"
    };
  }

  function createNGon(sides: number): Shape {
    const centerX = 45;
    const centerY = 45;
    const radius = 15;
    const vertices = [];
    
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides;
      vertices.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      });
    }
    
    return {
      id: `${sides}-gon-${shapes.length + 1}`,
      name: `Obstacle ${shapes.length + 1}`,
      vertices,
      color: "#dc2626",
      fillColor: "#fca5a5"
    };
  }
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
          on:change={() => {
            if (settings) {
              settings.rWidth = robotWidth;
            }
          }}
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-16"
          step="1"
        />
        <div class="font-extralight">Robot Height:</div>
        <input
          bind:value={robotHeight}
          on:change={() => {
            if (settings) {
              settings.rHeight = robotHeight;
            }
          }}
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-16 dark:bg-neutral-950 dark:border-neutral-700"
          step="1"
        />
      </div>
    </div>

    <div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
      <div class="font-semibold">Shapes</div>
      
      {#each shapes as shape, shapeIdx}
        <div class="flex flex-col w-full justify-start items-start gap-1 p-2 border rounded-md border-neutral-300 dark:border-neutral-600">
          <div class="flex flex-row w-full justify-between items-center">
            <div class="font-medium text-sm flex flex-row items-center gap-2">
              <input
                bind:value={shape.name}
                placeholder="Obstacle {shapeIdx + 1}"
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-medium"
              />
              <div class="size-2 rounded-full bg-red-600"></div>
            </div>
            <div class="flex flex-row gap-1">
              <button
                title="Add Vertex"
                on:click={() => {
                  shape.vertices = [...shape.vertices, { x: 50, y: 50 }];
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-4 stroke-green-500">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
              {#if shapes.length > 1}
                <button
                  title="Remove Shape"
                  on:click={() => {
                    shapes.splice(shapeIdx, 1);
                    shapes = shapes;
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-4 stroke-red-500">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </button>
              {/if}
            </div>
          </div>
          
          {#each shape.vertices as vertex, vertexIdx}
            <div class="flex flex-row justify-start items-center gap-2">
              <div class="font-extralight text-xs">V{vertexIdx + 1}:</div>
              <div class="font-extralight text-xs">X:</div>
              <input
                bind:value={vertex.x}
                type="number"
                min="0"
                max="144"
                step="0.1"
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-20 text-xs"
              />
              <div class="font-extralight text-xs">Y:</div>
              <input
                bind:value={vertex.y}
                type="number"
                min="0"
                max="144"
                step="0.1"
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-20 text-xs"
              />
              {#if shape.vertices.length > 3}
                <button
                  title="Remove Vertex"
                  on:click={() => {
                    shape.vertices.splice(vertexIdx, 1);
                    shape.vertices = shape.vertices;
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-3 stroke-red-500">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
      
      <div class="flex flex-row justify-start items-center gap-2 mt-1 flex-wrap">
        <button
          on:click={() => {
            shapes = [...shapes, createTriangle()];
          }}
          class="font-medium text-red-500 text-xs flex flex-row justify-start items-center gap-1 px-2 py-1 rounded-md border border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <p>Triangle</p>
        </button>
        
        <button
          on:click={() => {
            shapes = [...shapes, createRectangle()];
          }}
          class="font-medium text-red-500 text-xs flex flex-row justify-start items-center gap-1 px-2 py-1 rounded-md border border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <p>Rectangle</p>
        </button>
        
        <button
          on:click={() => {
            shapes = [...shapes, createNGon(5)];
          }}
          class="font-medium text-red-500 text-xs flex flex-row justify-start items-center gap-1 px-2 py-1 rounded-md border border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <p>Pentagon</p>
        </button>
        
        <button
          on:click={() => {
            shapes = [...shapes, createNGon(6)];
          }}
          class="font-medium text-red-500 text-xs flex flex-row justify-start items-center gap-1 px-2 py-1 rounded-md border border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <p>Hexagon</p>
        </button>
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
          min="0"
          max="144"
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-28 dark:bg-neutral-950 dark:border-neutral-700"
          step="0.1"
        />
        <div class="font-extralight">Y:</div>
        <input
          bind:value={startPoint.y}
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
              min="0"
              max="144"
              bind:value={line.endPoint.x}
            />
            <div class="font-extralight">Y:</div>
            <input
              class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
              step="0.1"
              min="0"
              max="144"
              type="number"
              bind:value={line.endPoint.y}
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
              />
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
                step="1"
                type="number"
                min="-180"
                max="180"
                bind:value={line.endPoint.endDeg}
              />
            {:else if line.endPoint.heading === "constant"}
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
                step="1"
                type="number"
                min="-180"
                max="180"
                bind:value={line.endPoint.degrees}
              />
            {:else if line.endPoint.heading === "tangential"}
              <p class="text-sm font-extralight">Reverse:</p>
              <input type="checkbox" bind:checked={line.endPoint.reverse} />
            {/if}
            <button
              class="px-2 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none"
              title="Optimize"
              name="Optimize"
              on:click={() => {
                line = fpa({
                  startPoint: idx === 0 ? startPoint : lines[idx - 1].endPoint,
                  endPoint: line.endPoint,
                  controlPoints: line.controlPoints,
                  color: line.color,
                });
              }}
            >Optimize</button>
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
              />
              <div class="font-extralight">Y:</div>
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
                step="0.1"
                type="number"
                bind:value={point.y}
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
