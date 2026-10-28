<script lang="ts">
  import { gridSize } from "../../../stores";
  import {
    FIELD_IMAGE_OVERHANG,
    FIELD_SEAM_COLOR,
    FIELD_SIZE,
  } from "../../../config";
  import type { Axis } from "../../../view/viewport";

  interface Props {
    x: Axis;
    y: Axis;
  }

  let { x, y }: Props = $props();

  let spacing = $derived(Math.max(1, $gridSize || 12));

  // Lines are spaced from the tile corner, which sits under the wall, so they
  // land on the seams painted in the field image.
  let gridPositions = $derived(
    (() => {
      const positions = [0];
      const first = Math.ceil(FIELD_IMAGE_OVERHANG / spacing);
      for (let k = first; ; k++) {
        const pos = Number((k * spacing - FIELD_IMAGE_OVERHANG).toFixed(6));
        if (pos >= FIELD_SIZE) break;
        if (pos > 0) positions.push(pos);
      }
      positions.push(FIELD_SIZE);
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

  // Index of a line counted from the tile corner, so styling and labels follow
  // the seams rather than the array order.
  const lineIndex = (position: number) =>
    Math.round((position + FIELD_IMAGE_OVERHANG) / spacing);

  function showsLabel(position: number): boolean {
    return (
      lineIndex(position) % labelInterval === 0 ||
      position === 0 ||
      position === FIELD_SIZE
    );
  }

  const formatLabel = (position: number) => Number(position.toFixed(2));
</script>

<svg class="absolute top-0 left-0 w-full h-full pointer-events-none z-20">
  <!-- Vertical grid lines -->
  {#each gridPositions as position (position)}
    {@const major = lineIndex(position) % 2 === 0}
    <line
      x1={x(position)}
      y1={y(0)}
      x2={x(position)}
      y2={y(FIELD_SIZE)}
      stroke={major ? FIELD_SEAM_COLOR : "#9ca3af"}
      stroke-width={major ? "1.5" : "0.5"}
      opacity="0.3"
    />
    {#if showsLabel(position)}
      <text
        x={x(position)}
        y={y(0) + 15}
        class="field-label {labelFontSize}"
        text-anchor="middle"
      >
        {formatLabel(position)}"
      </text>
    {/if}
  {/each}

  <!-- Horizontal grid lines -->
  {#each gridPositions as position (position)}
    {@const major = lineIndex(position) % 2 === 0}
    <line
      x1={x(0)}
      y1={y(position)}
      x2={x(FIELD_SIZE)}
      y2={y(position)}
      stroke={major ? FIELD_SEAM_COLOR : "#9ca3af"}
      stroke-width={major ? "1.5" : "0.5"}
      opacity="0.3"
    />
    {#if showsLabel(position)}
      <text
        x={x(0) - 5}
        y={y(position) + 4}
        class="field-label {labelFontSize}"
        text-anchor="end"
      >
        {formatLabel(position)}"
      </text>
    {/if}
  {/each}
</svg>
