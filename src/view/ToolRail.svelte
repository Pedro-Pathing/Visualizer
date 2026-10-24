<script lang="ts">
  import { Crosshair, MousePointer2, PenTool, Plus } from "@lucide/svelte";
  import IconButton from "../lib/components/ui/IconButton.svelte";
  import { surfaceClass } from "../lib/components/ui/styles";
  import { useEditor } from "../state/editor.svelte";

  const editor = useEditor();
</script>

<div
  class={[surfaceClass, "flex flex-col gap-0.5 bg-surface/90 p-1"]}
  role="toolbar"
  aria-label="Tools"
  aria-orientation="vertical"
>
  <IconButton
    label="Select (Esc)"
    active={editor.tool === "select"}
    onclick={() => editor.setTool("select")}
  >
    <MousePointer2 />
  </IconButton>
  <IconButton
    label="Pen: draw a path (P)"
    active={editor.tool === "pen"}
    onclick={() => editor.setTool("pen")}
  >
    <PenTool />
  </IconButton>
  <IconButton
    label="Pick a coordinate (C)"
    active={editor.tool === "coordinate"}
    onclick={() => editor.setTool("coordinate")}
  >
    <Crosshair />
  </IconButton>
  <div class="mx-1.5 my-0.5 h-px bg-border"></div>
  <IconButton label="Add path (W)" onclick={() => editor.addPath()}>
    <Plus />
  </IconButton>
</div>
