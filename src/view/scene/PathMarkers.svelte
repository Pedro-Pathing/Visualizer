<script lang="ts">
  import type { Path, StartPose } from "../../types";
  import type { PointAddress } from "../../model/commands";
  import { POINT_RADIUS } from "../../config/defaults";
  import { atomicSegments } from "../../utils/pathTraversal";
  import { SELECTION_COLOR } from "./colors";

  interface Props {
    startPoint: StartPose;
    lines: Path[];
    idPrefix: string;
    /** Draws every marker in this colour instead of its segment's. */
    color?: string;
    radiusScale?: number;
    labelSize?: number;
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
    labelSize = 1.55,
    opacity = 1,
    selection = null,
    onPointDown,
  }: Props = $props();

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
  <text
    transform={`translate(${x} ${y - 0.15}) scale(1 -1)`}
    font-size={size}
    text-anchor="middle"
    dominant-baseline="central"
    fill="white"
    pointer-events="none"
    class="font-sans select-none">{text}</text
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
        {#if isSelectedLine}
          {@const isSelectedPoint = selection?.index === pointIndex}
          <circle
            cx={point.x}
            cy={point.y}
            r={radius * 1.45}
            fill="none"
            stroke={isSelectedPoint ? "#ffffff" : SELECTION_COLOR}
            stroke-width={isSelectedPoint ? 0.45 : 0.25}
          />
          {#if isSelectedPoint}
            <circle
              cx={point.x}
              cy={point.y}
              r={POINT_RADIUS * 1.7}
              fill="none"
              stroke={SELECTION_COLOR}
              stroke-width={0.35}
              opacity={0.95}
            />
          {/if}
        {/if}
        <circle
          cx={point.x}
          cy={point.y}
          r={radius}
          fill={color || line.color}
          stroke={selection
            ? isSelectedLine
              ? SELECTION_COLOR
              : line.color
            : "none"}
          stroke-width={isSelectedLine ? 0.7 : 0.25}
        />
        {#if pointIndex > 0}
          {@render label(`${pointIndex}`, point.x, point.y, labelSize)}
        {/if}
      </g>
    {/each}
  {/each}
</g>
