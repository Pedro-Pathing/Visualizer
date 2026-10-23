<script lang="ts">
  import PiecewiseHeadingEditor from "./PiecewiseHeadingEditor.svelte";
  import Toggle from "./ui/Toggle.svelte";
  import { fieldClass, labelClass } from "./ui/styles";
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

  const headingTypes: Array<{
    value: HeadingType;
    label: string;
    hint: string;
  }> = [
    {
      value: "constant",
      label: "Constant",
      hint: "The robot keeps the same heading for the whole path.",
    },
    {
      value: "linear",
      label: "Linear",
      hint: "The heading turns evenly from a start angle to an end angle.",
    },
    {
      value: "tangential",
      label: "Tangential",
      hint: "The heading follows the direction of the path.",
    },
    {
      value: "piecewise",
      label: "Piecewise",
      hint: "The path is split into stretches that each use their own rule.",
    },
  ];

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
    if (type === heading.type) return;
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

  const degreeFieldClass = [fieldClass, "font-mono"];
</script>

<div class="flex w-full flex-col gap-2">
  <div
    class="grid grid-cols-4 gap-0.5 rounded-lg border border-border bg-base p-0.5"
    role="group"
    aria-label="Heading type"
  >
    {#each headingTypes as option (option.value)}
      <button
        type="button"
        class={[
          "min-w-0 truncate rounded-md px-1 py-1 text-xs font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50",
          heading.type === option.value
            ? "bg-primary/15 text-primary"
            : "text-body hover:bg-body/10 hover:text-heading",
        ]}
        title={option.hint}
        aria-pressed={heading.type === option.value}
        disabled={locked}
        onclick={() => changeHeadingType(option.value)}
      >
        {option.label}
      </button>
    {/each}
  </div>

  {#if heading.type === "linear"}
    <div class="grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1">
        <span class={labelClass}>Start (deg)</span>
        <input
          class={degreeFieldClass}
          type="number"
          step="1"
          min="-180"
          max="180"
          value={heading.startDeg}
          oninput={(e) => update({ startDeg: degreesFrom(e.currentTarget) })}
          title="The heading the robot starts this path at"
          disabled={locked}
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class={labelClass}>End (deg)</span>
        <input
          class={degreeFieldClass}
          type="number"
          step="1"
          min="-180"
          max="180"
          value={heading.endDeg}
          oninput={(e) => update({ endDeg: degreesFrom(e.currentTarget) })}
          title="The heading the robot ends this path at"
          disabled={locked}
        />
      </label>
    </div>
  {:else if heading.type === "constant"}
    <label class="flex flex-col gap-1">
      <span class={labelClass}>Heading (deg)</span>
      <input
        class={degreeFieldClass}
        type="number"
        step="1"
        min="-180"
        max="180"
        value={heading.degrees || 0}
        oninput={(e) => update({ degrees: degreesFrom(e.currentTarget) })}
        onblur={(e) => {
          if (Number.isNaN(parseFloat(e.currentTarget.value))) {
            e.currentTarget.value = "0";
          }
        }}
        title="The heading the robot keeps throughout this path"
        disabled={locked}
      />
    </label>
  {:else if heading.type === "tangential"}
    <Toggle
      label="Reverse"
      description="Face backward along the path."
      checked={heading.reverse}
      disabled={locked}
      onchange={(e) => update({ reverse: e.currentTarget.checked })}
    />
  {:else if heading.type === "piecewise"}
    <PiecewiseHeadingEditor
      config={heading.piecewiseHeading}
      {locked}
      onConfigChange={(piecewiseHeading) => update({ piecewiseHeading })}
    />
  {/if}
</div>
