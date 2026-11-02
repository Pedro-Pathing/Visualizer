<script lang="ts">
  import type { BasePoint } from "../../types";
  import { coordinateSettings } from "../../stores";
  import {
    editCoordinate,
    toDisplay,
    inchesPerUnit,
    FIELD_INCHES,
  } from "../../utils/coordinates";
  import type { HTMLInputAttributes } from "svelte/elements";

  type Props = Omit<HTMLInputAttributes, "value" | "oninput"> & {
    point: BasePoint;
    axis: "x" | "y";
    onpoint?: (point: BasePoint) => void;
  };
  let {
    point = $bindable(),
    axis,
    onpoint,
    step = 0.1,
    ...attributes
  }: Props = $props();
  let value = $derived(
    Number(toDisplay(point, $coordinateSettings)[axis].toFixed(6)),
  );
  let scale = $derived(inchesPerUnit($coordinateSettings));
  let centered = $derived(
    $coordinateSettings.coordinateSystem !== "pedro" &&
      !!$coordinateSettings.coordinateSystem,
  );
</script>

<input
  {...attributes}
  type="number"
  {value}
  min={centered ? -FIELD_INCHES / 2 / scale : 0}
  max={(centered ? FIELD_INCHES / 2 : FIELD_INCHES) / scale}
  step={Number(step) / scale}
  oninput={(event) => {
    if (event.currentTarget.value === "") return;
    const next = editCoordinate(
      point,
      axis,
      event.currentTarget.valueAsNumber,
      $coordinateSettings,
    );
    if (onpoint) onpoint(next);
    else Object.assign(point, next);
  }}
/>
