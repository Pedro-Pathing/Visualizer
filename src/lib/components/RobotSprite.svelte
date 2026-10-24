<script lang="ts">
  import type { BasePoint, Settings } from "../../types";

  interface Props {
    xy: BasePoint;
    heading: number;
    widthPx: number;
    heightPx: number;
    settings: Settings;
    alt?: string;
    zIndex?: number;
    arrowZIndex?: number;
    opacity?: number;
    arrowId?: string;
    onImageSettled?: () => void;
  }

  let {
    xy,
    heading,
    widthPx,
    heightPx,
    settings,
    alt = "Robot",
    zIndex = 20,
    arrowZIndex = 21,
    opacity = 1,
    arrowId = "arrowhead-main",
    onImageSettled = () => {},
  }: Props = $props();

  const DEFAULT_ROBOT_IMAGE = "/robot.png";

  let arrowLength = $derived(settings.headingArrowLength || 50);
  let arrowColor = $derived(settings.headingArrowColor || "#ffffff");
  let arrowRadians = $derived((-heading * Math.PI) / 180);
</script>

<img
  src={settings.robotImage || DEFAULT_ROBOT_IMAGE}
  {alt}
  style={`position: absolute; top: ${xy.y}px;
left: ${xy.x}px; transform: translate(-50%, -50%) rotate(${heading}deg); z-index: ${zIndex}; width: ${widthPx}px; height: ${heightPx}px;user-select: none; -webkit-user-select: none; -moz-user-select: none;-ms-user-select: none;
pointer-events: none; opacity: ${opacity};`}
  draggable="false"
  onload={onImageSettled}
  onerror={(e) => {
    console.error("Failed to load robot image:", settings.robotImage);
    onImageSettled();
    (e.currentTarget as HTMLImageElement).src = DEFAULT_ROBOT_IMAGE;
  }}
  ondragstart={(e) => e.preventDefault()}
  onselectstart={(e) => e.preventDefault()}
/>

{#if settings.showHeadingArrow}
  <svg
    style={`position: absolute; top: ${xy.y}px; left: ${xy.x}px; z-index: ${arrowZIndex}; pointer-events: none; overflow: visible; opacity: ${opacity};`}
    width="1"
    height="1"
  >
    <defs>
      <marker
        id={arrowId}
        markerWidth="10"
        markerHeight="10"
        refX="6.5"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 7 3, 0 6" fill={arrowColor} />
      </marker>
    </defs>
    <line
      x1="0"
      y1="0"
      x2={arrowLength * Math.cos(arrowRadians)}
      y2={arrowLength * -Math.sin(arrowRadians)}
      stroke={arrowColor}
      stroke-width={settings.headingArrowThickness || 3}
      marker-end="url(#{arrowId})"
    />
  </svg>
{/if}
