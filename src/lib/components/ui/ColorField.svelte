<script lang="ts">
  import { Pipette } from "@lucide/svelte";
  import { labelClass } from "./styles";

  interface Props {
    label: string;
    value: string;
    /** Quick picks shown as swatches beside the free-form picker. */
    presets: string[];
    disabled?: boolean;
    onchange: (color: string) => void;
  }

  let { label, value, presets, disabled = false, onchange }: Props = $props();
</script>

<div class="flex flex-col gap-1">
  <span class={labelClass}>{label}</span>
  <div class="flex flex-wrap items-center gap-1.5">
    {#each presets as color (color)}
      <button
        type="button"
        class={[
          "size-5 rounded-full border border-border transition disabled:cursor-not-allowed disabled:opacity-50",
          value.toLowerCase() === color.toLowerCase() &&
            "ring-2 ring-primary ring-offset-1 ring-offset-base",
        ]}
        style={`background-color: ${color}`}
        aria-label={`${label} ${color}`}
        {disabled}
        onclick={() => onchange(color)}
      ></button>
    {/each}
    <!-- The native picker is hidden; the label's icon opens it. -->
    <label
      class={[
        "relative flex size-6 items-center justify-center rounded-md border border-border text-body transition focus-within:ring-2 focus-within:ring-primary",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:border-primary/50 hover:text-heading",
      ]}
      title={`Pick a custom ${label.toLowerCase()}`}
    >
      <Pipette class="size-3.5" />
      <input
        type="color"
        class="absolute inset-0 size-full cursor-[inherit] opacity-0"
        aria-label={`Custom ${label.toLowerCase()}`}
        {value}
        {disabled}
        oninput={(event) => onchange(event.currentTarget.value)}
      />
    </label>
  </div>
</div>
