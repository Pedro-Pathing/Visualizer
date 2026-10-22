<script lang="ts">
  import { gridSize } from "../../../stores";
  import { FIELD_SIZE } from "../../../config";
  import type { Axis } from "../../../view/viewport";

  interface Props {
    x: Axis;
    y: Axis;
  }

  let { x, y }: Props = $props();

  let spacing = $derived(Math.max(1, $gridSize || 12));

  let gridPositions = $derived(
    (() => {
      const positions: number[] = [];
      for (let pos = 0; pos <= FIELD_SIZE; pos += spacing) {
        positions.push(Number(pos.toFixed(6)));
      }
      if (positions[positions.length - 1] !== FIELD_SIZE) {
        positions.push(FIELD_SIZE);
      }
      return positions;
    })(),
  );

  // Adjust label frequency and size based on grid density
  let labelInterval = $derived(
    spacing <= 1 ? 12 : spacing <= 3 ? 4 : spacing <= 6 ? 2 : 1,
  );
  let labelFontSize = $derived(
    spacing <= 1
      ? "text-[8px]"
      : spacing <= 3
        ? "text-[9px]"
        : spacing <= 6
          ? "text-[10px]"
          : "text-xs",
  );

  function showsLabel(index: number, position: number): boolean {
    return (
      index % labelInterval === 0 || position === 0 || position === FIELD_SIZE
    );
  }
</script>

<svg class="absolute top-0 left-0 w-full h-full pointer-events-none z-20">
  <!-- Vertical grid lines -->
  {#each gridPositions as position, i (position)}
    <line
      x1={x(position)}
      y1={y(0)}
      x2={x(position)}
      y2={y(FIELD_SIZE)}
      stroke={i % 2 === 0 ? "#6b7280" : "#9ca3af"}
      stroke-width={i % 2 === 0 ? "1.5" : "0.5"}
      opacity="0.3"
    />
    {#if showsLabel(i, position)}
      <text
        x={x(position)}
        y={y(0) + 15}
        class="field-label {labelFontSize}"
        text-anchor="middle"
      >
        {position}"
      </text>
    {/if}
  {/each}

  <!-- Horizontal grid lines -->
  {#each gridPositions as position, i (position)}
    <line
      x1={x(0)}
      y1={y(position)}
      x2={x(FIELD_SIZE)}
      y2={y(position)}
      stroke={i % 2 === 0 ? "#6b7280" : "#9ca3af"}
      stroke-width={i % 2 === 0 ? "1.5" : "0.5"}
      opacity="0.3"
    />
    {#if showsLabel(i, position)}
      <text
        x={x(0) - 5}
        y={y(position) + 4}
        class="field-label {labelFontSize}"
        text-anchor="end"
      >
        {position}"
      </text>
    {/if}
  {/each}
</svg>
