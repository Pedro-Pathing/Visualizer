<script lang="ts">
  import type { Shape } from "../../types";
  import type { PointAddress } from "../../model/commands";
  import { POINT_RADIUS } from "../../config/defaults";
  import { polylinePath } from "./svgPath";
  import { SELECTED_PATH_SCALE } from "./selection";

  interface Props {
    shapes: Shape[];
    selectedId?: string | null;
    onShapeDown: (shapeId: string, event: PointerEvent) => void;
    onVertexDown: (address: PointAddress, event: PointerEvent) => void;
  }

  let {
    shapes,
    selectedId = null,
    onShapeDown,
    onVertexDown,
  }: Props = $props();

  /** Vertices and their numbers, which only the selected obstacle shows. */
  const LABEL_SIZE = 1.1;

  /** The selected obstacle draws last, so it wins overlapping clicks. */
  let ordered = $derived(
    shapes
      .map((shape, shapeIndex) => ({ shape, shapeIndex }))
      .sort(
        (a, b) =>
          Number(a.shape.id === selectedId) - Number(b.shape.id === selectedId),
      ),
  );
  let selected = $derived(ordered.find(({ shape }) => shape.id === selectedId));
</script>

{#each ordered as { shape, shapeIndex } (shape.id)}
  {#if shape.vertices.length >= 3}
    <path
      id={`shape-${shapeIndex}`}
      d={polylinePath(shape.vertices, true)}
      fill={shape.color}
      fill-opacity={0.4}
      stroke={shape.color}
      stroke-width={0.5 * (shape.id === selectedId ? SELECTED_PATH_SCALE : 1)}
      role="button"
      tabindex="-1"
      aria-label={shape.name || `Obstacle ${shapeIndex + 1}`}
      onpointerdown={(event) => onShapeDown(shape.id, event)}
    />
  {/if}
{/each}

{#if selected}
  {@const { shape, shapeIndex } = selected}
  {#each shape.vertices as vertex, vertexIndex (vertexIndex)}
    <g
      id={`obstacle-${shapeIndex}-${vertexIndex}`}
      class="cursor-grab"
      role="button"
      tabindex="-1"
      aria-label={`Obstacle ${shapeIndex + 1} vertex ${vertexIndex + 1}`}
      onpointerdown={(event) =>
        onVertexDown(
          { kind: "vertex", shapeId: shape.id, index: vertexIndex },
          event,
        )}
    >
      <circle
        cx={vertex.x}
        cy={vertex.y}
        r={POINT_RADIUS * SELECTED_PATH_SCALE}
        fill={shape.fillColor}
      />
      <text
        transform={`translate(${vertex.x} ${vertex.y}) scale(1 -1)`}
        font-size={LABEL_SIZE * SELECTED_PATH_SCALE}
        text-anchor="middle"
        dy="0.35em"
        pointer-events="none"
        class="fill-surface-dark font-sans select-none">{vertexIndex + 1}</text
      >
    </g>
  {/each}
{/if}
