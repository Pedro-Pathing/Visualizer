<script lang="ts">
  import type { RobotPose } from "../../sim/pose";

  interface Props {
    pose: RobotPose;
  }

  let { pose }: Props = $props();
  let heading = $derived(Math.round(pose.heading) || 0);
</script>

<div class="flex flex-col w-full justify-start items-start gap-2 text-sm">
  <div class="font-semibold">Current Robot Position</div>
  <div class="grid w-full grid-cols-1 gap-1.5 text-[12px]">
    <div
      class="flex items-center justify-between gap-2 rounded border border-[#333333] bg-[#1f1f1f] px-2 py-1.5"
    >
      <div class="font-extralight text-gray-400">X</div>
      <div class="font-medium text-gray-100">
        {pose.x.toFixed(3)}
      </div>
    </div>
    <div
      class="flex items-center justify-between gap-2 rounded border border-[#333333] bg-[#1f1f1f] px-2 py-1.5"
    >
      <div class="font-extralight text-gray-400">Y</div>
      <div class="font-medium text-gray-100">
        {pose.y.toFixed(3)}
      </div>
    </div>
    <div
      class="flex items-center justify-between gap-2 rounded border border-[#333333] bg-[#1f1f1f] px-2 py-1.5"
    >
      <div class="font-extralight text-gray-400">Heading</div>
      <div class="font-medium text-gray-100">
        {heading}&deg;
      </div>
    </div>
  </div>
</div>
