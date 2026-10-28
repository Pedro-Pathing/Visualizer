<script lang="ts">
  import type { CompoundPath, Heading, Path } from "../../types";
  import { updatePathById } from "../../model/commands";
  import { atomicSegments } from "../../utils/pathTraversal";
  import { useEditor } from "../../state/editor.svelte";
  import { useProject } from "../../state/project.svelte";
  import Button from "../../lib/components/ui/Button.svelte";
  import Toggle from "../../lib/components/ui/Toggle.svelte";
  import { fieldClass, labelClass } from "../../lib/components/ui/styles";
  import HeadingControls from "../../lib/components/HeadingControls.svelte";

  interface Props {
    group: CompoundPath;
  }

  let { group }: Props = $props();

  const project = useProject();
  const editor = useEditor();

  function edit(field: string, update: (path: Path) => Path) {
    project.apply(updatePathById(group.id, update), {
      coalesce: `${group.id}.${field}`,
    });
  }

  function setHeading(heading: Heading | undefined) {
    edit("heading", (path) =>
      path.kind === "compound" ? { ...path, heading } : path,
    );
  }
</script>

<div class="flex flex-col gap-3">
  <label class="flex flex-col gap-1">
    <span class={labelClass}>Name</span>
    <input
      class={fieldClass}
      value={group.name || ""}
      placeholder="Group"
      oninput={(event) =>
        edit("name", (path) => ({ ...path, name: event.currentTarget.value }))}
    />
  </label>

  <p class="text-xs text-body">
    {group.segments.length} direct children, {atomicSegments(group.segments)
      .length}
    paths in all.
  </p>

  <Toggle
    label="Override nested path headings"
    description={group.heading
      ? "Every path inside follows this heading."
      : "Each path inside keeps its own heading."}
    checked={Boolean(group.heading)}
    onchange={(event) =>
      setHeading(
        event.currentTarget.checked
          ? { type: "tangential", reverse: false }
          : undefined,
      )}
  />

  {#if group.heading}
    <div class="flex flex-wrap items-center gap-2 text-sm text-body">
      <HeadingControls heading={group.heading} onChange={setHeading} />
    </div>
  {/if}

  <div>
    <Button size="sm" onclick={() => editor.ungroupSelected()}>Ungroup</Button>
  </div>
</div>
