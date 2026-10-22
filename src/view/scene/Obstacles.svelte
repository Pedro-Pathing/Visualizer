<script lang="ts">
  import type { Shape } from "../../types";
  import type { PointAddress } from "../../model/commands";
  import { POINT_RADIUS } from "../../config/defaults";
  import { polylinePath } from "./svgPath";

  interface Props {
    shapes: Shape[];
    onVertexDown: (address: PointAddress, event: PointerEvent) => void;
  }

  let { shapes, onVertexDown }: Props = $props();
</script>

{#each shapes as shape, shapeIndex (shape.id)}
  {#if shape.vertices.length >= 3}
    <path
      id={`shape-${shapeIndex}`}
      d={polylinePath(shape.vertices, true)}
      fill={shape.color}
      stroke={shape.color}
      stroke-width={0.8}
      opacity={0.4}
      pointer-events="none"
    />
  {/if}
{/each}

{#each shapes as shape, shapeIndex (shape.id)}
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
      <circle cx={vertex.x} cy={vertex.y} r={POINT_RADIUS} fill={shape.fillColor} />
      <text
        transform={`translate(${vertex.x} ${vertex.y - 0.15}) scale(1 -1)`}
        font-size={1.55}
        text-anchor="middle"
        dominant-baseline="central"
        fill="white"
        pointer-events="none"
        class="font-sans select-none">{vertexIndex + 1}</text
      >
    </g>
  {/each}
{/each}
