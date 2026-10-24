<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {
    /** Shown as the tooltip and read by screen readers. */
    label: string;
    active?: boolean;
    size?: "sm" | "md";
  }

  let {
    label,
    active = false,
    size = "md",
    class: className = "",
    type = "button",
    children,
    ...rest
  }: Props = $props();
</script>

<button
  {type}
  title={label}
  aria-label={label}
  aria-pressed={active || undefined}
  class={[
    "inline-flex shrink-0 items-center justify-center rounded-lg transition outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4",
    size === "sm" ? "size-7" : "size-8",
    active
      ? "bg-primary/10 text-primary"
      : "text-body hover:bg-body/10 hover:text-heading",
    className,
  ]}
  {...rest}
>
  {@render children?.()}
</button>
