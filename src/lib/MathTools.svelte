<script lang="ts">
  import { showRuler, showProtractor, showGrid } from '../stores';
  import type * as d3 from 'd3';

  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
  export let twoElement: HTMLDivElement;

  let rulerStart = { x: 20, y: 72 };
  let rulerEnd = { x: 80, y: 72 };
  let rulerDragging: 'start' | 'end' | null = null;

  let protractorPos = { x: 72, y: 72 };
  let protractorRotation = 0;
  let protractorDragging: 'move' | 'rotate' | null = null;
  let protractorRotateStart = 0;

  function handleMouseDown(event: MouseEvent, type: string) {
    event.stopPropagation();
    if (type === 'ruler-start') {
      rulerDragging = 'start';
    } else if (type === 'ruler-end') {
      rulerDragging = 'end';
    } else if (type === 'protractor-move') {
      protractorDragging = 'move';
    } else if (type === 'protractor-rotate') {
      protractorDragging = 'rotate';
      const rect = twoElement.getBoundingClientRect();
      const centerX = x(protractorPos.x);
      const centerY = y(protractorPos.y);
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      protractorRotateStart = Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI) - protractorRotation;
    }
  }

  function handleMouseMove(event: MouseEvent) {
    if (!twoElement) return;

    const rect = twoElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const inchX = x.invert(mouseX);
    const inchY = y.invert(mouseY);

    if (rulerDragging === 'start') {
      rulerStart = { x: inchX, y: inchY };
    } else if (rulerDragging === 'end') {
      rulerEnd = { x: inchX, y: inchY };
    } else if (protractorDragging === 'move') {
      protractorPos = { x: inchX, y: inchY };
    } else if (protractorDragging === 'rotate') {
      const centerX = x(protractorPos.x);
      const centerY = y(protractorPos.y);
      const angle = Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI);
      protractorRotation = angle - protractorRotateStart;
    }
  }

  function handleMouseUp() {
    rulerDragging = null;
    protractorDragging = null;
  }

  $: rulerLength = Math.sqrt(
    Math.pow(rulerEnd.x - rulerStart.x, 2) +
    Math.pow(rulerEnd.y - rulerStart.y, 2)
  );
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

{#if $showGrid}
  <svg class="absolute top-0 left-0 w-full h-full pointer-events-none z-20">
    <!-- Vertical grid lines every 12 inches -->
    {#each Array(13) as _, i}
      <line
        x1={x(i * 12)}
        y1={y(0)}
        x2={x(i * 12)}
        y2={y(144)}
        stroke={i % 2 === 0 ? "#6b7280" : "#9ca3af"}
        stroke-width={i % 2 === 0 ? "1.5" : "0.5"}
        opacity="0.3"
      />
      <text
        x={x(i * 12)}
        y={y(0) + 15}
        class="fill-gray-600 dark:fill-gray-400 text-xs"
        text-anchor="middle"
      >
        {i * 12}"
      </text>
    {/each}

    <!-- Horizontal grid lines every 12 inches -->
    {#each Array(13) as _, i}
      <line
        x1={x(0)}
        y1={y(i * 12)}
        x2={x(144)}
        y2={y(i * 12)}
        stroke={i % 2 === 0 ? "#6b7280" : "#9ca3af"}
        stroke-width={i % 2 === 0 ? "1.5" : "0.5"}
        opacity="0.3"
      />
      <text
        x={x(0) + 5}
        y={y(i * 12) - 5}
        class="fill-gray-600 dark:fill-gray-400 text-xs"
      >
        {i * 12}"
      </text>
    {/each}
  </svg>
{/if}

{#if $showRuler}
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
      on:mousedown={(e) => handleMouseDown(e, 'ruler-start')}
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
      on:mousedown={(e) => handleMouseDown(e, 'ruler-end')}
    />

    <!-- Length label -->
    <text
      x={(x(rulerStart.x) + x(rulerEnd.x)) / 2}
      y={(y(rulerStart.y) + y(rulerEnd.y)) / 2 - 10}
      class="fill-blue-600 dark:fill-blue-400 font-semibold pointer-events-none"
      text-anchor="middle"
    >
      {rulerLength.toFixed(2)}"
    </text>
  </svg>
{/if}

{#if $showProtractor}
  <svg class="absolute top-0 left-0 w-full h-full z-40 pointer-events-none">
    <g transform="translate({x(protractorPos.x)}, {y(protractorPos.y)}) rotate({protractorRotation})">
      <!-- Full circle protractor -->
      <circle
        cx="0"
        cy="0"
        r="60"
        fill="rgba(59, 130, 246, 0.15)"
        stroke="#3b82f6"
        stroke-width="2"
        class="pointer-events-auto"
      />

      <!-- Degree marks every 10 degrees -->
      {#each Array(36) as _, i}
        {@const angle = (i * 10) * Math.PI / 180}
        {@const x1 = Math.cos(angle) * 50}
        {@const y1 = -Math.sin(angle) * 50}
        {@const x2 = Math.cos(angle) * 60}
        {@const y2 = -Math.sin(angle) * 60}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#3b82f6"
          stroke-width={i % 3 === 0 ? "2" : "1"}
        />
        {#if i % 3 === 0}
          <text
            x={Math.cos(angle) * 70}
            y={-Math.sin(angle) * 70 + 4}
            class="fill-blue-600 dark:fill-blue-400 text-xs font-semibold"
            text-anchor="middle"
          >
            {i * 10}°
          </text>
        {/if}
      {/each}

      <!-- Cardinal direction lines -->
      <line x1="0" y1="0" x2="65" y2="0" stroke="#ef4444" stroke-width="3" />
      <text x="75" y="4" class="fill-red-600 dark:fill-red-400 text-sm font-bold" text-anchor="middle">0°</text>

      <!-- Rotation handle on edge -->
      <circle
        cx="60"
        cy="0"
        r="10"
        fill="#10b981"
        stroke="#059669"
        stroke-width="2"
        class="cursor-grab pointer-events-auto"
        role="button"
        tabindex="0"
        aria-label="Drag to rotate protractor"
        on:mousedown={(e) => handleMouseDown(e, 'protractor-rotate')}
      />
      <text x="60" y="4" class="fill-white text-xs font-bold pointer-events-none" text-anchor="middle">↻</text>

      <!-- Center move handle -->
      <circle
        cx="0"
        cy="0"
        r="8"
        fill="#3b82f6"
        stroke="#1d4ed8"
        stroke-width="2"
        class="cursor-move pointer-events-auto"
        role="button"
        tabindex="0"
        aria-label="Drag to move protractor"
        on:mousedown={(e) => handleMouseDown(e, 'protractor-move')}
      />
    </g>
  </svg>
{/if}
