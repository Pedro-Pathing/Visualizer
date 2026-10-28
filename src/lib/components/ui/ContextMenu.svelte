<script lang="ts">
  import MenuList from "./MenuList.svelte";
  import type { MenuEntry } from "./menu";

  interface Props {
    /** Viewport coordinates of the click that opened it. */
    x: number;
    y: number;
    entries: MenuEntry[];
    onClose: () => void;
  }

  let { x, y, entries, onClose }: Props = $props();

  let menu = $state<HTMLElement>();
  let width = $state(0);
  let height = $state(0);
  // Flip toward the click when the menu would run off the window.
  let left = $derived(Math.min(x, window.innerWidth - width - 8));
  let top = $derived(Math.min(y, window.innerHeight - height - 8));
</script>

<svelte:window
  onpointerdown={(event) => {
    if (!menu?.contains(event.target as Node)) onClose();
  }}
  onkeydown={(event) => {
    if (event.key === "Escape") onClose();
  }}
  onblur={onClose}
/>

<div
  bind:this={menu}
  bind:clientWidth={width}
  bind:clientHeight={height}
  class="fixed z-1000"
  style={`left: ${left}px; top: ${top}px;`}
>
  <MenuList {entries} onPick={onClose} />
</div>
