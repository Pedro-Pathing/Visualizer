<script lang="ts">
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
    <input
      type="color"
      class="size-6 cursor-pointer rounded border border-border bg-base p-0 disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={`Custom ${label.toLowerCase()}`}
      {value}
      {disabled}
      oninput={(event) => onchange(event.currentTarget.value)}
    />
  </div>
</div>
