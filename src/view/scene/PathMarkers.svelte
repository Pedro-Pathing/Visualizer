<script lang="ts">
  import type { Path, StartPose } from "../../types";
  import type { PointAddress } from "../../model/commands";
  import { POINT_RADIUS } from "../../config/defaults";
  import { atomicSegments } from "../../utils/pathTraversal";
  import { SELECTED_PATH_SCALE, SELECTED_POINT_SCALE } from "./selection";

  interface Props {
    startPoint: StartPose;
    lines: Path[];
    idPrefix: string;
    /** Draws every marker in this colour instead of its segment's. */
    color?: string;
    radiusScale?: number;
    opacity?: number;
    /** The selected point; turns on selection styling. */
    selection?: { lineId: string | null; index: number } | null;
    onPointDown?: (
      address: PointAddress,
      locked: boolean,
      event: PointerEvent,
    ) => void;
  }

  let {
    startPoint,
    lines,
    idPrefix,
    color,
    radiusScale = 1,
    opacity = 1,
    selection = null,
    onPointDown,
  }: Props = $props();

  /** Point numbers, which only the selected path shows. */
  const LABEL_SIZE = 1.2;

  let radius = $derived(POINT_RADIUS * radiusScale);
  let segments = $derived(atomicSegments(lines));
  /** The selected segment's markers draw last, so they win overlapping clicks. */
  let ordered = $derived(
    segments
      .map((line, index) => ({ line, index }))
      .sort(
        (a, b) =>
          Number(a.line.id === selection?.lineId) -
          Number(b.line.id === selection?.lineId),
      ),
  );
</script>

{#snippet label(text: string, x: number, y: number, size: number)}
  <!-- Dropping the baseline by half the digit height centers the digit itself. -->
  <text
    transform={`translate(${x} ${y}) scale(1 -1)`}
    font-size={size}
    text-anchor="middle"
    dy="0.35em"
    pointer-events="none"
    class="fill-surface-dark font-sans select-none">{text}</text
  >
{/snippet}

<g {opacity}>
  <circle
    id={`${idPrefix}-0-0`}
    cx={startPoint.x}
    cy={startPoint.y}
    r={radius}
    fill={color || segments[0]?.color || "#888"}
    class={onPointDown && !startPoint.locked ? "cursor-grab" : ""}
    role="button"
    tabindex="-1"
    aria-label="Start point"
    onpointerdown={(event) =>
      onPointDown?.({ kind: "start" }, Boolean(startPoint.locked), event)}
  />

  {#each ordered as { line, index } (line.id)}
    {@const isSelectedLine = selection?.lineId === line.id}
    {#each [line.endPoint, ...(line.throughPoints ?? line.controlPoints)] as point, pointIndex (pointIndex)}
      {@const locked = Boolean(line.locked) || Boolean(point.locked)}
      {@const id = `${idPrefix}-${index + 1}-${pointIndex}`}
      {@const scale = isSelectedLine
        ? selection?.index === pointIndex
          ? SELECTED_POINT_SCALE
          : SELECTED_PATH_SCALE
        : 1}
      <g
        {id}
        class={onPointDown && !locked ? "cursor-grab" : ""}
        role="button"
        tabindex="-1"
        aria-label={pointIndex === 0
          ? `Path ${index + 1} end point`
          : `Path ${index + 1} point ${pointIndex}`}
        onpointerdown={(event) =>
          onPointDown?.(
            { kind: "path", lineId: line.id, index: pointIndex },
            locked,
            event,
          )}
      >
        <circle
          cx={point.x}
          cy={point.y}
          r={radius * scale}
          fill={color || line.color}
        />
        {#if pointIndex > 0 && isSelectedLine}
          {@render label(`${pointIndex}`, point.x, point.y, LABEL_SIZE * scale)}
        {/if}
      </g>
    {/each}
  {/each}
</g>
