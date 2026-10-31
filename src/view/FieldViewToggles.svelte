<script lang="ts">
  import {
    Angle,
    Grid3x3,
    Lock,
    FileUp,
    Box,
    RotateCcw,
    Upload,
    LockOpen,
    Magnet,
    Ruler,
  } from "@lucide/svelte";
  import IconButton from "../lib/components/ui/IconButton.svelte";
  import { surfaceClass } from "../lib/components/ui/styles";
  import {
    gridSize,
    protractorLockToRobot,
    show3D,
    showGrid,
    showProtractor,
    showRuler,
    snapToGrid,
    robotModelUrl,
  } from "../stores";
  import {
    cycleGrid,
    toggle3D,
    toggleProtractor,
    toggleProtractorLock,
    toggleRuler,
    toggleSnap,
  } from "./viewOptions";
    let fileInput: HTMLInputElement;
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
  <IconButton label="3D view" active={$show3D} onclick= {toggle3D}>
  <Box/>
  </IconButton>
    {#if $show3D}
        <input
      bind:this={fileInput}
      type="file"
      hidden
      accept=".glb"
      onchange={(e) => {
        const file = e.currentTarget.files?.[0];
        if (file) {
          if ($robotModelUrl) 
          {
            URL.revokeObjectURL($robotModelUrl);
          }
          robotModelUrl.set(URL.createObjectURL(file));
        }
        e.currentTarget.value = "";
      }}
    />
    <IconButton
      label="Upload robot model (.glb)"
      onclick={() => fileInput.click()}
      >
      <FileUp/>
    </IconButton>
    {#if $robotModelUrl}
      <IconButton
        label="Reset robot model"
        onclick={() => {
          URL.revokeObjectURL($robotModelUrl);
          robotModelUrl.set("");
        }}
      >
        <RotateCcw/>
      </IconButton>
    {/if}
  {/if}
</div>
