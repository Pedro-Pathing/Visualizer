<script lang="ts">
  import type { BasePoint } from "../../types";
  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
</script>

<div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
  <div class="font-semibold">Current Robot Position</div>
  <div class="flex flex-row justify-start items-center gap-2">
    <div class="font-extralight">X:</div>
    <div class="w-16">{x.invert(robotXY.x).toFixed(3)}</div>
    <div class="font-extralight">Y:</div>
    <div class="w-16">{y.invert(robotXY.y).toFixed(3)}</div>
    <div class="font-extralight">Heading:</div>
    <div>
      {robotHeading.toFixed(0) === "-0" ? "0" : -robotHeading.toFixed(0)}&deg;
    </div>
  </div>
</div>
