<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  interface Props extends Omit<HTMLInputAttributes, "type"> {
    label: string;
    description?: string;
    checked?: boolean;
  }

  let {
    label,
    description = "",
    checked = $bindable(false),
    class: className = "",
    ...rest
  }: Props = $props();
</script>

<label
  class={[
    "flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-base px-3 py-2 transition hover:border-primary/50 has-checked:border-primary has-disabled:cursor-not-allowed has-disabled:opacity-50",
    className,
  ]}
>
  <input
    type="checkbox"
    bind:checked
    class="mt-0.5 size-4 shrink-0 accent-primary"
    {...rest}
  />
  <span class="min-w-0">
    <span class="block text-sm font-medium text-heading">{label}</span>
    {#if description}
      <span class="block text-xs text-body">{description}</span>
    {/if}
  </span>
</label>
