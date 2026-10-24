<script lang="ts">
  import type { Component } from "svelte";
  import { ChevronDown } from "@lucide/svelte";

  interface Props {
    title: string;
    collapsed?: boolean;
    icon?: Component;
    onToggle: () => void;
    children?: import("svelte").Snippet;
  }

  let { title, collapsed = true, icon, onToggle, children }: Props = $props();
</script>

<div class="mb-3">
  <button
    type="button"
    onclick={onToggle}
    class="flex w-full items-center justify-between rounded-lg border border-border bg-base px-3 py-2 text-sm font-semibold text-heading transition hover:bg-body/10"
    aria-expanded={!collapsed}
  >
    <span class="flex items-center gap-2">
      {#if icon}
        {@const Icon = icon}
        <Icon class="size-4 text-body" />
      {/if}
      {title}
    </span>
    <ChevronDown
      class={[
        "size-4 text-body transition-transform duration-200",
        collapsed && "-rotate-90",
      ]}
    />
  </button>

  {#if !collapsed}
    {@render children?.()}
  {/if}
</div>
