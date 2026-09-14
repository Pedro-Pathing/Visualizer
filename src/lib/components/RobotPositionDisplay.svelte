<script lang="ts">
  import type { BasePoint } from "../../types";
  import type * as d3 from "d3";
  import { fieldFrame } from "../../stores";
  import { headingToDocFrame, toDocFrame } from "../../utils/frame";

  interface Props {
    robotXY: BasePoint;
    robotHeading: number;
    x: d3.ScaleLinear<number, number>;
    y: d3.ScaleLinear<number, number>;
  }

  let { robotXY, robotHeading, x, y }: Props = $props();

  // robotXY arrives in pixels, so it goes back through the scales first.
  let shown = $derived(
    toDocFrame({ x: x.invert(robotXY.x), y: y.invert(robotXY.y) }, $fieldFrame),
  );
  let shownHeading = $derived(headingToDocFrame(-robotHeading, $fieldFrame));
</script>

<div class="flex flex-col w-full justify-start items-start gap-2 text-sm">
  <div class="font-semibold">Current Robot Position</div>
  <div class="grid w-full grid-cols-1 gap-1.5 text-[12px]">
    <div
      class="flex items-center justify-between gap-2 rounded border border-[#333333] bg-[#1f1f1f] px-2 py-1.5"
    >
      <div class="font-extralight text-gray-400">X</div>
      <div class="font-medium text-gray-100">
        {shown.x.toFixed(3)}
      </div>
    </div>
    <div
      class="flex items-center justify-between gap-2 rounded border border-[#333333] bg-[#1f1f1f] px-2 py-1.5"
    >
      <div class="font-extralight text-gray-400">Y</div>
      <div class="font-medium text-gray-100">
        {shown.y.toFixed(3)}
      </div>
    </div>
    <div
      class="flex items-center justify-between gap-2 rounded border border-[#333333] bg-[#1f1f1f] px-2 py-1.5"
    >
      <div class="font-extralight text-gray-400">Heading</div>
      <div class="font-medium text-gray-100">
        {shownHeading.toFixed(0) === "-0" ? "0" : shownHeading.toFixed(0)}&deg;
      </div>
    </div>
  </div>
</div>
