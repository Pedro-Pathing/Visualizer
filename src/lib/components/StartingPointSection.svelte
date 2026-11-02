<script lang="ts">
  import CoordinateField from "./CoordinateField.svelte";
  import { Lock, LockOpen } from "@lucide/svelte";
  import type { StartPose } from "../../types";
  import { updateStartPoint } from "../../model/commands";
  import { useProject } from "../../state/project.svelte";
  import IconButton from "./ui/IconButton.svelte";
  import { fieldClass, labelClass } from "./ui/styles";

  const project = useProject();
  let startPoint = $derived(project.doc.startPoint);

  function update(patch: Partial<StartPose>, field?: string) {
    project.apply(updateStartPoint(patch), {
      coalesce: field && `start.${field}`,
    });
  }
</script>

<div class="grid grid-cols-[1fr_1fr_auto] items-end gap-2 px-1">
  <label class="col-span-2 flex flex-col gap-1">
    <span class={labelClass}>Name</span>
    <input
      class={fieldClass}
      value={startPoint.name ?? ""}
      placeholder="start"
      disabled={startPoint.locked}
      oninput={(event) => update({ name: event.currentTarget.value }, "name")}
    />
  </label>
  <IconButton
    label={startPoint.locked ? "Unlock the start" : "Lock the start"}
    active={startPoint.locked}
    onclick={() => update({ locked: !startPoint.locked })}
  >
    {#if startPoint.locked}<Lock />{:else}<LockOpen />{/if}
  </IconButton>

  <label class="flex flex-col gap-1">
    <span class={labelClass}>X</span>
    <CoordinateField
      class={fieldClass}
      point={startPoint}
      axis="x"
      disabled={startPoint.locked}
      onpoint={(point) => update({ x: point.x, y: point.y }, "x")}
    />
  </label>
  <label class="flex flex-col gap-1">
    <span class={labelClass}>Y</span>
    <CoordinateField
      class={fieldClass}
      point={startPoint}
      axis="y"
      disabled={startPoint.locked}
      onpoint={(point) => update({ x: point.x, y: point.y }, "y")}
    />
  </label>
</div>
