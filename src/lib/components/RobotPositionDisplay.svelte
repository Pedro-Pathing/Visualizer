<script lang="ts">
  import type { BasePoint } from "../../types";

  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
</script>

<div class="flex flex-col w-full min-w-0 justify-start items-start gap-1 text-sm">
  <div class="font-semibold">Current Robot Position</div>
  <div class="flex flex-wrap justify-start items-center gap-1.5 w-full min-w-0">
    <div class="inline-flex items-center gap-1 rounded bg-neutral-100 dark:bg-neutral-900 px-1.5 py-0.5 min-w-0">
      <span class="font-extralight">X:</span>
      <span class="font-medium">{x.invert(robotXY.x).toFixed(3)}</span>
    </div>
    <div class="inline-flex items-center gap-1 rounded bg-neutral-100 dark:bg-neutral-900 px-1.5 py-0.5 min-w-0">
      <span class="font-extralight">Y:</span>
      <span class="font-medium">{y.invert(robotXY.y).toFixed(3)}</span>
    </div>
    <div class="inline-flex items-center gap-1 rounded bg-neutral-100 dark:bg-neutral-900 px-1.5 py-0.5 min-w-0">
      <span class="font-extralight">Heading:</span>
      <span class="font-medium">
        {robotHeading.toFixed(0) === "-0" ? "0" : -robotHeading.toFixed(0)}&deg;
      </span>
    </div>
  </div>
</div>
