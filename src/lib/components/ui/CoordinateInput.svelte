<script lang="ts">
  import type { BasePoint } from "../../../types";
  import { fieldFrame } from "../../../stores";
  import {
    docBounds,
    setDocCoordinate,
    toDocFrame,
  } from "../../../utils/frame";

  interface Props {
    /** A canonical point. The input shows and accepts document-frame values. */
    point: BasePoint;
    axis: "x" | "y";
    /** Receives the canonical point with `axis` moved to the entered value. */
    onChange: (next: BasePoint) => void;
    step?: number;
    disabled?: boolean;
    title?: string;
    class?: string;
    /** Off for targets that may legitimately sit outside the field. */
    bounded?: boolean;
  }

  let {
    point,
    axis,
    onChange,
    step = 0.1,
    disabled = false,
    title,
    class: className = "",
    bounded = true,
  }: Props = $props();

  let bounds = $derived(docBounds($fieldFrame));
  let value = $derived(toDocFrame(point, $fieldFrame)[axis]);
  let min = $derived(
    !bounded ? undefined : axis === "x" ? bounds.minX : bounds.minY,
  );
  let max = $derived(
    !bounded ? undefined : axis === "x" ? bounds.maxX : bounds.maxY,
  );
</script>

<input
  type="number"
  {value}
  {step}
  {min}
  {max}
  {disabled}
  {title}
  class={className}
  onchange={(event) =>
    onChange(
      setDocCoordinate(
        point,
        axis,
        Number(event.currentTarget.value),
        $fieldFrame,
      ),
    )}
/>
