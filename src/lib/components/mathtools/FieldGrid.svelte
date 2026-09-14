<script lang="ts">
  import { gridSize, fieldFrame } from "../../../stores";
  import { docBounds, toCanonical } from "../../../utils/frame";
  import type * as d3 from "d3";

  interface Props {
    x: d3.ScaleLinear<number, number>;
    y: d3.ScaleLinear<number, number>;
  }

  let { x, y }: Props = $props();

  let spacing = $derived(Math.max(1, $gridSize || 12));
  let bounds = $derived(docBounds($fieldFrame));

  /**
   * Positions stepping outward from the document origin, so a line lands on it
   * whatever the origin is, with the field edges always included.
   */
  function lattice(min: number, max: number): number[] {
    const positions: number[] = [];
    for (
      let pos = Math.ceil(min / spacing) * spacing;
      pos <= max;
      pos += spacing
    ) {
      positions.push(Math.round(pos * 1e6) / 1e6);
    }
    if (positions[0] !== min) positions.unshift(min);
    if (positions[positions.length - 1] !== max) positions.push(max);
    return positions;
  }

  /**
   * A grid line spans the field at a constant document-frame coordinate, which
   * need not be constant on screen once the axes are rotated. The line's first
   * endpoint doubles as the anchor for its label.
   */
  function gridLine(axis: "x" | "y", position: number) {
    const [from, to] =
      axis === "x"
        ? [
            { x: position, y: bounds.minY },
            { x: position, y: bounds.maxY },
          ]
        : [
            { x: bounds.minX, y: position },
            { x: bounds.maxX, y: position },
          ];
    const a = toCanonical(from, $fieldFrame);
    const b = toCanonical(to, $fieldFrame);
    return { x1: x(a.x), y1: y(a.y), x2: x(b.x), y2: y(b.y) };
  }

  let axes = $derived([
    {
      axis: "x" as const,
      positions: lattice(bounds.minX, bounds.maxX),
      min: bounds.minX,
      max: bounds.maxX,
      labelDx: 0,
      labelDy: 15,
      anchor: "middle",
    },
    {
      axis: "y" as const,
      positions: lattice(bounds.minY, bounds.maxY),
      min: bounds.minY,
      max: bounds.maxY,
      labelDx: -5,
      labelDy: 4,
      anchor: "end",
    },
  ]);

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

  function showsLabel(
    index: number,
    position: number,
    min: number,
    max: number,
  ): boolean {
    return (
      index % labelInterval === 0 ||
      position === 0 ||
      position === min ||
      position === max
    );
  }
</script>

<svg class="absolute top-0 left-0 w-full h-full pointer-events-none z-20">
  {#each axes as ax (ax.axis)}
    <!-- Keyed by index: a shifted lattice can repeat a position at the edges. -->
    {#each ax.positions as position, i (i)}
      {@const line = gridLine(ax.axis, position)}
      <line
        x1={line.x1}
        y1={line.y1}
        x2={line.x2}
        y2={line.y2}
        stroke={i % 2 === 0 ? "#6b7280" : "#9ca3af"}
        stroke-width={i % 2 === 0 ? "1.5" : "0.5"}
        opacity="0.3"
      />
      {#if showsLabel(i, position, ax.min, ax.max)}
        <text
          x={line.x1 + ax.labelDx}
          y={line.y1 + ax.labelDy}
          class="fill-gray-600 dark:fill-gray-400 {labelFontSize}"
          text-anchor={ax.anchor}
        >
          {position}"
        </text>
      {/if}
    {/each}
  {/each}
</svg>
