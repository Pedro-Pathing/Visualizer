<script lang="ts">
  import { PanelLeft, Plus } from "@lucide/svelte";
  import type { Settings } from "../types";
  import { createTriangle } from "../utils";
  import { atomicSegments } from "../utils/pathTraversal";
  import { setShapes } from "../model/commands";
  import { useEditor } from "../state/editor.svelte";
  import { useProject } from "../state/project.svelte";
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

  let overlaysOpen = $state(false);

  function addObstacle() {
    const shape = createTriangle();
    project.apply(setShapes([...project.doc.shapes, shape]));
    editor.selectShape(shape.id);
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
      <PathTree />
    </PanelSection>

    {#if settings.experimentalFeatures?.obstacles}
      <PanelSection title="Obstacles" count={project.doc.shapes.length}>
        {#snippet actions()}
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
  </div>
</aside>
