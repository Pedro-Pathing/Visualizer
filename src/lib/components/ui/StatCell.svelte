<script lang="ts">
  interface Props {
    label: string;
    /** Roomier padding for cells that hold controls rather than a bare value. */
    roomy?: boolean;
    valueClass?: string;
    children?: import("svelte").Snippet;
  }

  let {
    label,
    roomy = false,
    valueClass = "font-medium text-heading tabular-nums",
    children,
  }: Props = $props();
</script>

<div
  class={[
    "rounded-lg border border-border bg-base/60 px-2.5",
    roomy ? "py-2 leading-tight" : "py-1.5",
  ]}
>
  <div class="text-body">{label}</div>
  <div class={valueClass}>{@render children?.()}</div>
</div>
