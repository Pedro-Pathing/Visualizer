<script lang="ts">
  import { FIELD_IMAGE_OVERHANG, FIELD_SIZE } from "../../config/defaults";

  interface Props {
    src: string;
    fieldMapName: string | undefined;
    onSettled?: () => void;
  }

  let { src, fieldMapName, onSettled = () => {} }: Props = $props();

  const FALLBACK_FIELD_MAP = "/fields/decode.webp";
  // The parent clips to the floor; the image's edge tiles run under the walls.
  const inset = `${(-FIELD_IMAGE_OVERHANG / FIELD_SIZE) * 100}%`;
  const extent = `${((FIELD_SIZE + 2 * FIELD_IMAGE_OVERHANG) / FIELD_SIZE) * 100}%`;
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
