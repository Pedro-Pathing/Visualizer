<script lang="ts">
  import {
    FIELD_INCHES,
    fieldImageLayout,
    type CoordinateSettings,
  } from "../../utils/coordinates";

  interface Props {
    src: string;
    settings: CoordinateSettings;
    fieldMapName: string | undefined;
    onSettled?: () => void;
  }

  let { src, settings, fieldMapName, onSettled = () => {} }: Props = $props();

  const FALLBACK_FIELD_MAP = "/fields/decode.webp";
  // Calibrate seam spacing in physical inches; the parent keeps the field boundary fixed.
  const layout = $derived(fieldImageLayout(settings));
  const inset = $derived(`${(layout.offset / FIELD_INCHES) * 100}%`);
  const extent = $derived(`${(layout.size / FIELD_INCHES) * 100}%`);
</script>

<img
  {src}
  alt="Field"
  class="pointer-events-none absolute z-10 max-w-none select-none"
  style={`left: ${inset}; top: ${inset}; width: ${extent}; height: ${extent}; -webkit-user-drag: none;`}
  draggable="false"
  onload={onSettled}
  onerror={(event) => {
    console.error("Failed to load field map:", fieldMapName);
    onSettled();
    (event.currentTarget as HTMLImageElement).src = FALLBACK_FIELD_MAP;
  }}
/>
