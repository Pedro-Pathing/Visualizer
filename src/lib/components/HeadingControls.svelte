<script lang="ts">
  import PiecewiseHeadingEditor from "./PiecewiseHeadingEditor.svelte";
  import { createDefaultPiecewiseHeadingInterpolation } from "../../utils/headingInterpolation";
  import type {
    Heading,
    HeadingType,
    PiecewiseHeadingInterpolation,
  } from "../../types";

  interface Props {
    heading: Heading;
    locked?: boolean;
    onChange: (heading: Heading) => void;
  }

  let { heading, locked = false, onChange }: Props = $props();

  /**
   * Every field any heading type uses. Switching type keeps the others, so
   * switching back restores what was entered.
   */
  type HeadingFields = {
    type: HeadingType;
    startDeg?: number;
    endDeg?: number;
    degrees?: number;
    reverse?: boolean;
    piecewiseHeading?: PiecewiseHeadingInterpolation;
  };

  function update(patch: Partial<HeadingFields>) {
    onChange({ ...(heading as HeadingFields), ...patch } as Heading);
  }

  function changeHeadingType(type: HeadingType) {
    const current = heading as HeadingFields;
    update({
      type,
      degrees: current.degrees ?? 0,
      startDeg: current.startDeg ?? 0,
      endDeg: current.endDeg ?? 0,
      reverse: current.reverse ?? false,
      piecewiseHeading:
        current.piecewiseHeading ??
        createDefaultPiecewiseHeadingInterpolation(),
    });
  }

  function degreesFrom(input: HTMLInputElement): number {
    const value = parseFloat(input.value);
    return Number.isNaN(value) ? 0 : value;
  }
</script>

<select
  value={heading.type}
  onchange={(event) =>
    changeHeadingType(event.currentTarget.value as HeadingType)}
  class=" rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28 text-sm"
  title="The heading style of the robot.
With constant heading, the robot maintains the same heading throughout the line.
With linear heading, heading changes linearly between given start and end angles.
With tangential heading, the heading follows the direction of the line.
With piecewise heading, the line is split into stretches that each use their own rule."
  disabled={locked}
>
  <option value="constant">Constant</option>
  <option value="linear">Linear</option>
  <option value="tangential">Tangential</option>
  <option value="piecewise">Piecewise</option>
</select>

{#if heading.type === "linear"}
  <div class="flex items-center gap-1">
    <span class="text-xs text-neutral-600 dark:text-neutral-400">Start:</span>
    <input
      class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
      step="1"
      type="number"
      min="-180"
      max="180"
      value={heading.startDeg}
      oninput={(e) => update({ startDeg: degreesFrom(e.currentTarget) })}
      title="The heading the robot starts this line at (in degrees)"
      disabled={locked}
    />
    <span class="text-xs text-neutral-600 dark:text-neutral-400 ml-1">End:</span
    >
    <input
      class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
      step="1"
      type="number"
      min="-180"
      max="180"
      value={heading.endDeg}
      oninput={(e) => update({ endDeg: degreesFrom(e.currentTarget) })}
      title="The heading the robot ends this line at (in degrees)"
      disabled={locked}
    />
  </div>
{:else if heading.type === "constant"}
  <div class="flex items-center gap-1">
    <span class="text-xs text-neutral-600 dark:text-neutral-400">Deg:</span>
    <input
      class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
      step="1"
      type="number"
      min="-180"
      max="180"
      value={heading.degrees || 0}
      oninput={(e) => update({ degrees: degreesFrom(e.currentTarget) })}
      onblur={(e) => {
        if (Number.isNaN(parseFloat(e.currentTarget.value))) {
          e.currentTarget.value = "0";
        }
      }}
      title="The constant heading the robot maintains throughout this line (in degrees)"
      disabled={locked}
    />
  </div>
{:else if heading.type === "tangential"}
  <p class="text-sm font-extralight">Reverse:</p>
  <input
    type="checkbox"
    checked={heading.reverse}
    onchange={(e) => update({ reverse: e.currentTarget.checked })}
    title="Reverse the direction the robot faces along the tangential path"
    disabled={locked}
  />
{:else if heading.type === "piecewise"}
  <!-- Takes a full row of the wrapping flex container the parents lay out. -->
  <div class="w-full">
    <PiecewiseHeadingEditor
      config={heading.piecewiseHeading}
      {locked}
      onConfigChange={(piecewiseHeading) => update({ piecewiseHeading })}
    />
  </div>
{/if}
