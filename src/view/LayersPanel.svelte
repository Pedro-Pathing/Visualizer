<script lang="ts">
  import { PanelLeft, Plus, RotateCcw } from "@lucide/svelte";
  import type { Settings } from "../types";
  import { getDefaultShapes } from "../config/defaults";
  import { createTriangle } from "../utils";
  import { atomicSegments } from "../utils/pathTraversal";
  import { setShapes } from "../model/commands";
  import { useEditor } from "../state/editor.svelte";
  import { useProject } from "../state/project.svelte";
  import { usePlayback } from "../state/playback.svelte";
  import type { Overlays } from "../state/overlays.svelte";
  import IconButton from "../lib/components/ui/IconButton.svelte";
  import PanelSection from "../lib/components/ui/PanelSection.svelte";
  import { surfaceClass } from "../lib/components/ui/styles";
  import PathTree from "./layers/PathTree.svelte";
  import ObstacleList from "./layers/ObstacleList.svelte";
  import OverlayList from "./layers/OverlayList.svelte";

  interface Props {
    settings: Settings;
    overlays: Overlays;
    hidden?: boolean;
    onHide: () => void;
  }

  let { settings, overlays, hidden = false, onHide }: Props = $props();

  const project = useProject();
  const editor = useEditor();
  const playback = usePlayback();

  let overlaysOpen = $state(false);

  function addObstacle() {
    const shape = createTriangle();
    project.apply(setShapes([...project.doc.shapes, shape]));
    editor.selectShape(shape.id);
  }

  function resetObstacles() {
    project.apply(setShapes(getDefaultShapes(settings.fieldMap)));
  }
</script>

<aside
  class={[
    surfaceClass,
    "flex min-h-0 flex-col gap-1 overflow-hidden p-2",
    hidden && "pointer-events-none invisible",
  ]}
  aria-label="Layers"
>
  <div class="flex items-center justify-between px-1 pb-1">
    <h2 class="text-sm font-semibold text-heading">Layers</h2>
    <IconButton label="Hide layers" size="sm" onclick={onHide}>
      <PanelLeft />
    </IconButton>
  </div>

  <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
    <PanelSection
      title="Paths"
      count={atomicSegments(project.doc.lines).length}
    >
      {#snippet actions()}
        <IconButton label="Add path" size="sm" onclick={() => editor.addPath()}>
          <Plus />
        </IconButton>
      {/snippet}
      <PathTree />
    </PanelSection>

    {#if settings.experimentalFeatures?.obstacles}
      <PanelSection title="Obstacles" count={project.doc.shapes.length}>
        {#snippet actions()}
          <IconButton
            label="Reset obstacles to field default"
            size="sm"
            onclick={resetObstacles}
          >
            <RotateCcw />
          </IconButton>
          <IconButton label="Add obstacle" size="sm" onclick={addObstacle}>
            <Plus />
          </IconButton>
        {/snippet}
        <ObstacleList />
      </PanelSection>
    {/if}

    <PanelSection
      title="Overlays"
      count={overlays.items.length || undefined}
      bind:open={overlaysOpen}
    >
      <OverlayList {overlays} />
    </PanelSection>

    <PanelSection title="Robot">
      {@const pose = playback.robotPose}
      {@const readouts = [
        { label: "X", value: pose.x.toFixed(1), unit: "in" },
        { label: "Y", value: pose.y.toFixed(1), unit: "in" },
        { label: "Heading", value: pose.heading.toFixed(0), unit: "°" },
        { label: "t", value: pose.t?.toFixed(3) ?? "–", unit: "" },
      ]}
      <dl class="grid grid-cols-2 gap-1.5 px-1" aria-label="Robot pose">
        {#each readouts as { label, value, unit } (label)}
          <div
                  class="flex flex-col gap-0.5 rounded-lg border border-border bg-base/60 px-2.5 py-1.5"
          >
            <dt
                    class="text-[10px] font-medium tracking-wide text-body uppercase"
            >
              {label}
            </dt>
            <dd
                    class="flex items-baseline gap-1 font-mono text-sm text-heading tabular-nums"
            >
              {value}
              {#if unit}<span class="text-[10px] text-body">{unit}</span>{/if}
            </dd>
          </div>
        {/each}
      </dl>
      <div
              class="mx-1 mt-1.5 h-1 overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-label="Progress along the current segment"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={pose.t ?? 0}
      >
        <div
                class="h-full rounded-full bg-primary"
                style={`width: ${(pose.t ?? 0) * 100}%`}
        ></div>
      </div>
    </PanelSection>

  </div>
</aside>
