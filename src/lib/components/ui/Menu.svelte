<script lang="ts">
  import type { Snippet } from "svelte";
  import { ChevronDown } from "@lucide/svelte";
  import MenuList from "./MenuList.svelte";
  import type { MenuEntry } from "./menu";

  interface Props {
    label: string;
    entries: MenuEntry[];
    align?: "start" | "end";
    icon?: Snippet;
  }

  let { label, entries, align = "start", icon }: Props = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();

  function onWindowPointerDown(event: PointerEvent) {
    if (open && !root?.contains(event.target as Node)) open = false;
  }
</script>

<svelte:window
  onpointerdown={onWindowPointerDown}
  onkeydown={(event) => {
    if (open && event.key === "Escape") open = false;
  }}
/>

<div class="relative" bind:this={root}>
  <button
    type="button"
    class={[
      "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&_svg]:size-4",
      open
        ? "bg-body/10 text-heading"
        : "text-body hover:bg-body/10 hover:text-heading",
    ]}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    {@render icon?.()}
    {label}
    <ChevronDown class="size-3.5! opacity-60" />
  </button>
  {#if open}
    <MenuList
      {entries}
      onPick={() => (open = false)}
      class={[
        "absolute top-full z-50 mt-1",
        align === "end" ? "right-0" : "left-0",
      ].join(" ")}
    />
  {/if}
</div>
