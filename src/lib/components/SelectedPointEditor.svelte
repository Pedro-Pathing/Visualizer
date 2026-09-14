<script lang="ts">
  import type { AtomicPath, BasePoint } from "../../types";
  import { snapToGrid, showGrid, gridSize } from "../../stores";
  import CoordinateInput from "./ui/CoordinateInput.svelte";
  import HeadingControls from "./HeadingControls.svelte";

  interface Props {
    selectedLine: AtomicPath;
    selectedPoint: BasePoint;
    selectedPointIndex: number;
    selectedPointLabel: string;
    onCommit: () => void;
    onLinesChanged: () => void;
    onRecordChange: () => void;
    onDeleteControlPoint: () => void;
    onToggleLock: () => void;
  }

  let {
    selectedLine,
    selectedPoint = $bindable(),
    selectedPointIndex = $bindable(),
    selectedPointLabel,
    onCommit,
    onLinesChanged,
    onRecordChange,
    onDeleteControlPoint,
    onToggleLock,
  }: Props = $props();

  // Read the lock off the line so it tracks edits made through `lines`.
  let livePoint = $derived(
    selectedPointIndex === 0
      ? selectedLine.endPoint
      : (selectedLine.controlPoints[selectedPointIndex - 1] ?? selectedPoint),
  );
  let isPointLocked = $derived(Boolean(livePoint?.locked));
  let disabled = $derived(selectedLine.locked || isPointLocked);
  let coordinateStep = $derived($snapToGrid && $showGrid ? $gridSize : 0.1);
  function moveTo(next: BasePoint) {
    selectedPoint.x = next.x;
    selectedPoint.y = next.y;
    onCommit();
  }

  const FIELD_CLASS =
    "w-24 rounded border border-[#444444] bg-[#111111] px-2 py-1 text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50";
  const ACTION_CLASS =
    "rounded border border-[#444444] px-2 py-1 font-semibold text-gray-100 hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50";
  const CHIP_CLASS =
    "rounded border border-[#444444] px-2 py-1 text-[10px] font-semibold text-gray-200 hover:bg-[#2a2a2a]";
</script>

<div class="border border-[#333333] bg-[#1f1f1f] px-2 py-2 leading-tight">
  <div class="flex items-center justify-between gap-2">
    <div>
      <div class="text-gray-500">Selected Point</div>
      <div class="font-medium text-gray-100">{selectedPointLabel}</div>
    </div>
    <div class="flex flex-wrap gap-1">
      <button
        class="{CHIP_CLASS} {selectedPointIndex === 0 ? 'bg-[#2f2f2f]' : ''}"
        onclick={() => (selectedPointIndex = 0)}
      >
        Endpoint
      </button>
      {#each selectedLine.controlPoints as _, pointIdx (pointIdx)}
        <button
          class="{CHIP_CLASS} {selectedPointIndex === pointIdx + 1
            ? 'bg-[#2f2f2f]'
            : ''}"
          onclick={() => (selectedPointIndex = pointIdx + 1)}
        >
          CP{pointIdx + 1}
        </button>
      {/each}
    </div>
  </div>

  <div class="mt-3 flex flex-wrap items-end gap-2 text-[11px]">
    {#each ["x", "y"] as const as axis (axis)}
      <label class="flex flex-col gap-1">
        <span class="text-gray-500">{axis.toUpperCase()}</span>
        <CoordinateInput
          point={selectedPoint}
          {axis}
          onChange={moveTo}
          step={coordinateStep}
          class={FIELD_CLASS}
          {disabled}
        />
      </label>
    {/each}
  </div>

  {#if selectedPointIndex === 0}
    <div
      class="mt-3 flex items-center gap-2 text-[11px] text-gray-300 flex-wrap"
    >
      <div class="text-gray-500">Heading</div>
      <HeadingControls
        heading={selectedLine.heading}
        locked={disabled}
        on:change={onLinesChanged}
        on:commit={() => {
          onLinesChanged();
          onRecordChange();
        }}
      />
    </div>
  {/if}

  <div
    class="mt-2 flex items-center justify-end gap-2 text-[11px] text-gray-300"
  >
    <div class="flex items-center gap-2">
      <button
        class={ACTION_CLASS}
        onclick={onDeleteControlPoint}
        disabled={selectedLine.locked ||
          selectedPointIndex === 0 ||
          selectedLine.controlPoints.length === 0}
        title={selectedPointIndex === 0
          ? "Endpoint cannot be deleted"
          : "Delete the selected control point"}
      >
        Delete Control Point
      </button>
      <button
        class={ACTION_CLASS}
        onclick={onToggleLock}
        disabled={selectedLine.locked}
      >
        {isPointLocked ? "Unlock Point" : "Lock Point"}
      </button>
    </div>
  </div>
</div>
