<script lang="ts">
  import { FIELD_SIZE } from "../../../config";
  import { clamp } from "../../../utils/math";
  import type { Axis } from "../../../view/viewport";

  interface Props {
    x: Axis;
    y: Axis;
    fieldElement: HTMLDivElement;
  }

  let { x, y, fieldElement }: Props = $props();

  let rulerStart = $state({ x: 20, y: 72 });
  let rulerEnd = $state({ x: 80, y: 72 });
  let dragging: "start" | "end" | null = null;

  let rulerLength = $derived(
    Math.hypot(rulerEnd.x - rulerStart.x, rulerEnd.y - rulerStart.y),
  );

  function handleMouseDown(event: MouseEvent, which: "start" | "end") {
    event.stopPropagation();
    dragging = which;
  }

  function handleMouseMove(event: MouseEvent) {
    if (!dragging) return;

    const rect = fieldElement.getBoundingClientRect();
    const point = {
      x: clamp(x.invert(event.clientX - rect.left), 0, FIELD_SIZE),
      y: clamp(y.invert(event.clientY - rect.top), 0, FIELD_SIZE),
    };

    if (dragging === "start") rulerStart = point;
    else rulerEnd = point;
  }

  function handleMouseUp() {
    dragging = null;
  }
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={handleMouseUp} />

<svg class="absolute top-0 left-0 w-full h-full z-40 pointer-events-none">
  <!-- Ruler line -->
  <line
    x1={x(rulerStart.x)}
    y1={y(rulerStart.y)}
    x2={x(rulerEnd.x)}
    y2={y(rulerEnd.y)}
    stroke="#3b82f6"
    stroke-width="3"
    class="pointer-events-none"
  />

  <!-- Start handle -->
  <circle
    cx={x(rulerStart.x)}
    cy={y(rulerStart.y)}
    r="8"
    fill="#3b82f6"
    class="cursor-move pointer-events-auto"
    role="button"
    tabindex="0"
    aria-label="Ruler start point"
    onmousedown={(e) => handleMouseDown(e, "start")}
  />

  <!-- End handle -->
  <circle
    cx={x(rulerEnd.x)}
    cy={y(rulerEnd.y)}
    r="8"
    fill="#3b82f6"
    class="cursor-move pointer-events-auto"
    role="button"
    tabindex="0"
    aria-label="Ruler end point"
    onmousedown={(e) => handleMouseDown(e, "end")}
  />

  <!-- Length label -->
  <text
    x={(x(rulerStart.x) + x(rulerEnd.x)) / 2}
    y={(y(rulerStart.y) + y(rulerEnd.y)) / 2 - 10}
    class="field-label pointer-events-none font-semibold"
    text-anchor="middle"
  >
    {rulerLength.toFixed(2)}"
  </text>
</svg>
