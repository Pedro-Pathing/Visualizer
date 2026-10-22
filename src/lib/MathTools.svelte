<script lang="ts">
  import { showRuler, showProtractor, showGrid } from "../stores";
  import type { Axis } from "../view/viewport";
  import FieldGrid from "./components/mathtools/FieldGrid.svelte";
  import RulerOverlay from "./components/mathtools/RulerOverlay.svelte";
  import ProtractorOverlay from "./components/mathtools/ProtractorOverlay.svelte";

  interface Props {
    x: Axis;
    y: Axis;
    fieldElement: HTMLDivElement | undefined;
    robotXY: { x: number; y: number };
  }

  let { x, y, fieldElement, robotXY }: Props = $props();
</script>

{#if $showGrid}
  <FieldGrid {x} {y} />
{/if}

{#if $showRuler && fieldElement}
  <RulerOverlay {x} {y} {fieldElement} />
{/if}

{#if $showProtractor && fieldElement}
  <ProtractorOverlay {x} {y} {fieldElement} {robotXY} />
{/if}
