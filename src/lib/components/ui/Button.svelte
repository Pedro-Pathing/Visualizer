<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
  }

  let {
    variant = "secondary",
    size = "md",
    class: className = "",
    type = "button",
    children,
    ...rest
  }: Props = $props();

  const variants = {
    primary: "bg-primary text-accent-foreground hover:opacity-85",
    secondary: "border border-border bg-surface text-heading hover:bg-body/10",
    ghost: "text-body hover:bg-body/10 hover:text-heading",
    danger: "bg-danger text-accent-foreground hover:opacity-85",
  };
  const sizes = {
    sm: "h-7 gap-1.5 px-2.5 text-xs",
    md: "h-8 gap-2 px-3 text-sm",
  };
</script>

<button
  {type}
  class={[
    "inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40",
    sizes[size],
    variants[variant],
    className,
  ]}
  {...rest}
>
  {@render children?.()}
</button>
