<script lang="ts">
  import type { Path, StartPose } from "../../types";
  import { LINE_WIDTH } from "../../config/defaults";
  import { segmentStroke } from "../../lib/scene/stroke";
  import { flattenToAtomicSegments } from "../../utils/pathTraversal";
  import { strokePath } from "./svgPath";
  import { SELECTED_PATH_SCALE } from "./selection";

  interface Props {
    startPoint: StartPose;
    lines: Path[];
    idPrefix: string;
    /** Draws every segment in this colour instead of its own. */
    color?: string;
    opacity?: number;
    /** Draw locked segments dashed and dimmer. */
    honorLocked?: boolean;
    /** The selected segment, drawn wider and on top. */
    selectedId?: string | null;
    onSegmentDown?: (lineId: string, event: PointerEvent) => void;
  }

  let {
    startPoint,
    lines,
    idPrefix,
    color,
    opacity = 1,
    honorLocked = true,
    selectedId = null,
    onSegmentDown,
  }: Props = $props();

  let segments = $derived(
    flattenToAtomicSegments(startPoint, lines)
      .map((segment) => ({
        segment,
        d: strokePath(segmentStroke(segment.curve)),
      }))
      .sort(
        (a, b) =>
          Number(a.segment.line.id === selectedId) -
          Number(b.segment.line.id === selectedId),
      ),
  );
</script>

{#each segments as { segment, d } (segment.line.id)}
  {@const locked = honorLocked && Boolean(segment.line.locked)}
  <path
    id={`${idPrefix}-${segment.index + 1}`}
    {d}
    fill="none"
    stroke={color || segment.line.color}
    stroke-width={LINE_WIDTH *
      (segment.line.id === selectedId ? SELECTED_PATH_SCALE : 1)}
    stroke-dasharray={locked ? "2 2" : undefined}
    opacity={opacity * (locked ? 0.7 : 1)}
    pointer-events="none"
  />
  {#if onSegmentDown}
    <!-- A wider invisible copy, so the thin stroke is easy to click. -->
    <path
      {d}
      fill="none"
      stroke="transparent"
      stroke-width={LINE_WIDTH * 4}
      class="cursor-pointer"
      role="button"
      tabindex="-1"
      aria-label={segment.line.name || `Path ${segment.index + 1}`}
      onpointerdown={(event) => onSegmentDown(segment.line.id, event)}
    />
  {/if}
{/each}
