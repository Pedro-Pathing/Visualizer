<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import PiecewiseHeadingEditor from "./PiecewiseHeadingEditor.svelte";
  import { createDefaultPiecewiseHeadingInterpolation } from "../../utils/headingInterpolation";
  import { fieldFrame } from "../../stores";
  import { headingToCanonical, headingToDocFrame } from "../../utils/frame";
  import type {
    Heading,
    HeadingType,
    PiecewiseHeadingInterpolation,
  } from "../../types";

  interface Props {
    heading: Heading;
    locked?: boolean;
  }

  let { heading = $bindable(), locked = false }: Props = $props();
  const dispatch = createEventDispatcher();

  type AngleField = "startDeg" | "endDeg" | "degrees";

  const showAngle = (field: AngleField) =>
    headingToDocFrame((heading as HeadingDraft)[field] ?? 0, $fieldFrame);

  function setAngle(field: AngleField, value: number) {
    const draft: HeadingDraft = heading;
    draft[field] = headingToCanonical(value, $fieldFrame);
  }

  /**
   * A mutable editing view of a Heading.
   */
  type HeadingDraft = {
    type: HeadingType;
    startDeg?: number;
    endDeg?: number;
    degrees?: number;
    reverse?: boolean;
    piecewiseHeading?: PiecewiseHeadingInterpolation;
  };

  function changeHeadingType(next: HeadingType) {
    const draft: HeadingDraft = heading;
    draft.type = next;

    // Initialize missing properties based on the selected heading type
    if (next === "constant" && draft.degrees === undefined) {
      draft.degrees = 0;
    } else if (next === "linear") {
      if (draft.startDeg === undefined) draft.startDeg = 0;
      if (draft.endDeg === undefined) draft.endDeg = 0;
    } else if (next === "tangential") {
      if (draft.reverse === undefined) draft.reverse = false;
    } else if (next === "piecewise") {
      if (!draft.piecewiseHeading) {
        draft.piecewiseHeading = createDefaultPiecewiseHeadingInterpolation();
      }
    }
    dispatch("change");
  }

  function setPiecewiseHeading(
    next: PiecewiseHeadingInterpolation,
    commit: boolean,
  ) {
    const draft: HeadingDraft = heading;
    draft.piecewiseHeading = next;
    dispatch("change");
    if (commit) dispatch("commit");
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
      value={showAngle("startDeg")}
      oninput={(event) => {
        setAngle("startDeg", Number(event.currentTarget.value));
        dispatch("change");
      }}
      onblur={() => dispatch("commit")}
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
      value={showAngle("endDeg")}
      oninput={(event) => {
        setAngle("endDeg", Number(event.currentTarget.value));
        dispatch("change");
      }}
      onblur={() => dispatch("commit")}
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
      value={showAngle("degrees")}
      oninput={(e) => {
        const value = parseFloat(e.currentTarget.value);
        if (!isNaN(value)) {
          setAngle("degrees", value);
        } else {
          // If empty or invalid, set to 0
          setAngle("degrees", 0);
          e.currentTarget.value = "0";
        }
        dispatch("change");
      }}
      onblur={(e) => {
        if (
          e.currentTarget.value === "" ||
          isNaN(parseFloat(e.currentTarget.value))
        ) {
          setAngle("degrees", 0);
          e.currentTarget.value = "0";
        }
        dispatch("commit");
      }}
      title="The constant heading the robot maintains throughout this line (in degrees)"
      disabled={locked}
    />
  </div>
{:else if heading.type === "tangential"}
  <p class="text-sm font-extralight">Reverse:</p>
  <input
    type="checkbox"
    bind:checked={heading.reverse}
    onchange={() => dispatch("change")}
    onblur={() => dispatch("commit")}
    title="Reverse the direction the robot faces along the tangential path"
    disabled={locked}
  />
{:else if heading.type === "piecewise"}
  <!-- Takes a full row of the wrapping flex container the parents lay out. -->
  <div class="w-full">
    <PiecewiseHeadingEditor
      config={heading.piecewiseHeading}
      {locked}
      onConfigChange={setPiecewiseHeading}
    />
  </div>
{/if}
