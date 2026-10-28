<script lang="ts">
  import {
    Angle,
    Grid3x3,
    Lock,
    LockOpen,
    Magnet,
    Ruler,
  } from "@lucide/svelte";
  import IconButton from "../lib/components/ui/IconButton.svelte";
  import { surfaceClass } from "../lib/components/ui/styles";
  import {
    gridSize,
    protractorLockToRobot,
    showGrid,
    showProtractor,
    showRuler,
    snapToGrid,
  } from "../stores";
  import {
    cycleGrid,
    toggleProtractor,
    toggleProtractorLock,
    toggleRuler,
    toggleSnap,
  } from "./viewOptions";
</script>

<div
  class={[surfaceClass, "flex flex-col items-center gap-0.5 bg-surface/90 p-1"]}
  role="toolbar"
  aria-label="Field view"
  aria-orientation="vertical"
>
  <IconButton
    label={$showGrid ? `Grid: ${$gridSize}" (G for the next size)` : "Grid (G)"}
    active={$showGrid}
    onclick={cycleGrid}
    class="relative"
  >
    <Grid3x3 />
    {#if $showGrid}
      <span
        class="absolute -right-0.5 -bottom-0.5 rounded bg-surface px-0.5 font-mono text-[9px] leading-none tabular-nums"
        >{$gridSize}</span
      >
    {/if}
  </IconButton>
  {#if $showGrid}
    <IconButton
      label={$snapToGrid ? "Snapping to the grid" : "Snap to the grid"}
      active={$snapToGrid}
      onclick={toggleSnap}
    >
      <Magnet />
    </IconButton>
  {/if}
  <IconButton label="Ruler (R)" active={$showRuler} onclick={toggleRuler}>
    <Ruler />
  </IconButton>
  <IconButton
    label="Protractor"
    active={$showProtractor}
    onclick={toggleProtractor}
  >
    <Angle />
  </IconButton>
  {#if $showProtractor}
    <IconButton
      label={$protractorLockToRobot
        ? "Protractor follows the robot"
        : "Protractor stays put"}
      active={$protractorLockToRobot}
      onclick={toggleProtractorLock}
    >
      {#if $protractorLockToRobot}<Lock />{:else}<LockOpen />{/if}
    </IconButton>
  {/if}
</div>
