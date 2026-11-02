<script lang="ts">
  import { coordinateSettings } from "../../../stores";
  import {
    gridOrigin,
    gridSpacing,
    toDisplay,
    unitLabel,
  } from "../../../utils/coordinates";
  import { gridSize } from "../../../stores";
  import { FIELD_SEAM_COLOR, FIELD_SIZE } from "../../../config";
  import type { Axis } from "../../../view/viewport";

  interface Props {
    x: Axis;
    y: Axis;
  }

  let { x, y }: Props = $props();

  let spacing = $derived(
    Math.max(0.1, gridSpacing($gridSize || 12, $coordinateSettings)),
  );
  let origin = $derived(gridOrigin($coordinateSettings));

  // Display frames set the grid origin; geometry remains in Pedro inches.
  let gridPositions = $derived(
    (() => {
      const positions = [0];
      const first = Math.ceil(-origin / spacing);
      for (let k = first; ; k++) {
        const pos = Number((k * spacing + origin).toFixed(6));
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

  // Count from the selected origin for major lines and label frequency.
  const lineIndex = (position: number) =>
    Math.round((position - origin) / spacing);

  function showsLabel(position: number): boolean {
    return (
      lineIndex(position) % labelInterval === 0 ||
      position === 0 ||
      position === FIELD_SIZE
    );
  }

  function formatLabel(position: number, vertical: boolean) {
    const point = toDisplay(
      vertical ? { x: position, y: origin } : { x: origin, y: position },
      $coordinateSettings,
    );
    const swapped =
      $coordinateSettings.coordinateSystem === "ftc" ||
      $coordinateSettings.coordinateSystem === "ftc-inverted";
    const axis = vertical ? (swapped ? "y" : "x") : swapped ? "x" : "y";
    return `${axis.toUpperCase()}: ${Number(point[axis].toFixed(2))} ${unitLabel($coordinateSettings)}`;
  }
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
        {formatLabel(position, true)}
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
        {formatLabel(position, false)}
      </text>
    {/if}
  {/each}
</svg>
