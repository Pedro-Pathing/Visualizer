<script lang="ts">
  import { protractorLockToRobot } from "../../../stores";
  import { FIELD_SIZE } from "../../../config";
  import { clamp } from "../../../utils/math";
  import type { Axis } from "../../../view/viewport";

  interface Props {
    x: Axis;
    y: Axis;
    fieldElement: HTMLDivElement;
    robotXY: { x: number; y: number };
  }

  let { x, y, fieldElement, robotXY }: Props = $props();

  const MIN_PROTRACTOR_RADIUS = 30;
  const MAX_PROTRACTOR_RADIUS = 150;

  let protractorPos = $state({ x: 72, y: 72 });
  let radiusAngle = $state(0);
  let dragging: "move" | "rotate" | "resize" | null = null;
  let rotateStart = 0;
  let radius = $state(60);
  let resizeAngle = $state(-60);

  // Lock to the robot when enabled, otherwise use the dragged position
  let center = $derived(
    $protractorLockToRobot
      ? { x: x.invert(robotXY.x), y: y.invert(robotXY.y) }
      : protractorPos,
  );

  let normalizedAngle = $derived(
    Math.round(radiusAngle < 0 ? 360 + radiusAngle : radiusAngle),
  );
  let resizeHandleRadians = $derived((resizeAngle * Math.PI) / 180);
  let resizeHandlePosition = $derived({
    x: Math.cos(resizeHandleRadians) * radius,
    y: -Math.sin(resizeHandleRadians) * radius,
  });

  function localMouse(event: MouseEvent) {
    const rect = fieldElement.getBoundingClientRect();
    return { mx: event.clientX - rect.left, my: event.clientY - rect.top };
  }

  function handleMouseDown(
    event: MouseEvent,
    type: "move" | "rotate" | "resize",
  ) {
    event.stopPropagation();

    if (type === "move") {
      if (!$protractorLockToRobot) dragging = "move";
      return;
    }

    if (type === "rotate") {
      dragging = "rotate";
      const { mx, my } = localMouse(event);
      rotateStart =
        Math.atan2(my - y(center.y), mx - x(center.x)) * (180 / Math.PI) -
        radiusAngle;
      return;
    }

    dragging = "resize";
  }

  function handleMouseMove(event: MouseEvent) {
    if (!dragging) return;

    const { mx, my } = localMouse(event);
    const centerX = x(center.x);
    const centerY = y(center.y);

    if (dragging === "move") {
      protractorPos = {
        x: clamp(x.invert(mx), 0, FIELD_SIZE),
        y: clamp(y.invert(my), 0, FIELD_SIZE),
      };
      return;
    }

    if (dragging === "rotate") {
      const angle = Math.atan2(my - centerY, mx - centerX) * (180 / Math.PI);
      radiusAngle = angle - rotateStart;
      return;
    }

    const distance = Math.hypot(mx - centerX, my - centerY);
    radius = clamp(distance, MIN_PROTRACTOR_RADIUS, MAX_PROTRACTOR_RADIUS);
    // keep resize angle updated for handle position
    resizeAngle = Math.atan2(centerY - my, mx - centerX) * (180 / Math.PI);
  }

  function handleMouseUp() {
    dragging = null;
  }
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={handleMouseUp} />

<svg class="absolute top-0 left-0 w-full h-full z-40 pointer-events-none">
  <g transform="translate({x(center.x)}, {y(center.y)})">
    <!-- Full circle protractor -->
    <circle
      cx="0"
      cy="0"
      r={radius}
      fill="rgba(59, 130, 246, 0.15)"
      stroke="#3b82f6"
      stroke-width="2"
      class="pointer-events-auto"
    />

    <!-- Degree marks every 10 degrees -->
    {#each Array(36) as _, i (i)}
      {@const angle = (i * 10 * Math.PI) / 180}
      {@const r1 = radius - 10}
      {@const x1 = Math.cos(angle) * r1}
      {@const y1 = -Math.sin(angle) * r1}
      {@const x2 = Math.cos(angle) * radius}
      {@const y2 = -Math.sin(angle) * radius}
      <line
        {x1}
        {y1}
        {x2}
        {y2}
        stroke="#3b82f6"
        stroke-width={i % 3 === 0 ? "2" : "1"}
      />
      {#if i % 3 === 0}
        {@const r3 = radius - 32}
        <text
          x={Math.cos(angle) * r3}
          y={-Math.sin(angle) * r3 + 4}
          class="field-label text-xs font-semibold"
          text-anchor="middle"
        >
          {i * 10}°
        </text>
      {/if}
    {/each}

    <!-- Cardinal direction line (0°) - fixed -->
    <line
      x1="0"
      y1="0"
      x2={radius + 5}
      y2="0"
      stroke="#d1d5db"
      stroke-width="2"
      opacity="0.5"
    />
    <text
      x={radius + 15}
      y="4"
      class="field-label text-sm font-bold opacity-70"
      text-anchor="middle">0°</text
    >

    <!-- Rotating radius line -->
    <g transform="rotate({radiusAngle})">
      <line
        x1="0"
        y1="0"
        x2={radius + 5}
        y2="0"
        stroke="#ef4444"
        stroke-width="3"
      />

      <!-- Rotation handle on edge -->
      <circle
        cx={radius}
        cy="0"
        r="10"
        fill="#10b981"
        stroke="#059669"
        stroke-width="2"
        class="cursor-grab pointer-events-auto"
        role="button"
        tabindex="0"
        aria-label="Drag to rotate radius line"
        onmousedown={(e) => handleMouseDown(e, "rotate")}
      />
      <text
        x={radius}
        y="4"
        class="fill-white text-xs font-bold pointer-events-none"
        text-anchor="middle">↻</text
      >
    </g>

    <!-- Angle display -->
    <text
      x="0"
      y={-radius - 18}
      class="field-label text-base font-bold"
      text-anchor="middle"
    >
      {360 - normalizedAngle}°
    </text>

    <!-- Resize Handle -->
    <g>
      <circle
        cx={resizeHandlePosition.x}
        cy={resizeHandlePosition.y}
        r="10"
        fill="#f97316"
        stroke="#ea580c"
        stroke-width="2"
        class="cursor-nwse-resize pointer-events-auto"
        role="button"
        tabindex="0"
        aria-label="Drag to resize protractor"
        onmousedown={(e) => handleMouseDown(e, "resize")}
      />
      <text
        x={resizeHandlePosition.x}
        y={resizeHandlePosition.y + 4}
        class="fill-white text-xs font-bold pointer-events-none"
        text-anchor="middle"
      >
        ↔
      </text>
    </g>

    <!-- Center move handle / lock indicator -->
    <circle
      cx="0"
      cy="0"
      r="8"
      fill={$protractorLockToRobot ? "#fbbf24" : "#3b82f6"}
      stroke={$protractorLockToRobot ? "#f59e0b" : "#1d4ed8"}
      stroke-width="2"
      class={$protractorLockToRobot
        ? "cursor-pointer pointer-events-auto"
        : "cursor-move pointer-events-auto"}
      role="button"
      tabindex="0"
      aria-label={$protractorLockToRobot
        ? "Click to unlock from robot"
        : "Drag to move protractor"}
      onmousedown={(e) => {
        if ($protractorLockToRobot) {
          // Locked: center click does nothing; unlock via navbar toggle only
          e.stopPropagation();
          return;
        }
        handleMouseDown(e, "move");
      }}
    />
  </g>
</svg>
