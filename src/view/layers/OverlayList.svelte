<script lang="ts">
  import { activePaths, currentFilePath } from "../../stores";
  import * as browserFileStore from "../../utils/browserFileStore";
  import { isProjectFileName } from "../../utils/filename";
  import { MAX_OVERLAYS, type Overlays } from "../../state/overlays.svelte";
  import { checkboxClass } from "../../lib/components/ui/styles";

  interface Props {
    overlays: Overlays;
  }

  let { overlays }: Props = $props();

  let files: browserFileStore.FileInfo[] = $state([]);

  // Saving can add a file, so the list reloads whenever the open file changes.
  $effect(() => {
    void $currentFilePath;
    browserFileStore
      .listFiles()
      .then(
        (all) => (files = all.filter((file) => isProjectFileName(file.name))),
      )
      .catch((error) => console.error("Couldn't list saved files:", error));
  });

  function toggle(filePath: string, on: boolean) {
    activePaths.update((paths) =>
      on ? [...paths, filePath] : paths.filter((path) => path !== filePath),
    );
  }

  let full = $derived($activePaths.length >= MAX_OVERLAYS);
</script>

<div class="flex flex-col gap-px">
  {#if overlays.active}
    <p class="px-2 pb-1 text-xs text-body">
      Showing overlays in place of the open project.
    </p>
  {/if}
  {#each files as file (file.path)}
    {@const on = $activePaths.includes(file.path)}
    {@const color = overlays.items.find(
      (item) => item.filePath === file.path,
    )?.color}
    <label
      class={[
        "flex h-7 items-center gap-2 rounded-md px-2 text-sm transition hover:bg-body/8",
        on ? "text-heading" : "text-body",
        !on && full && "opacity-50",
      ]}
      title={!on && full ? `Up to ${MAX_OVERLAYS} overlays at once` : undefined}
    >
      <input
        type="checkbox"
        class={checkboxClass}
        checked={on}
        disabled={!on && full}
        onchange={(event) => toggle(file.path, event.currentTarget.checked)}
      />
      <span class="truncate">{file.name}</span>
      {#if color}
        <span
          class="ml-auto size-2.5 shrink-0 rounded-full"
          style={`background: ${color}`}
        ></span>
      {/if}
    </label>
  {/each}
  {#if files.length === 0}
    <p class="px-2 py-1 text-xs text-body">Saved projects show up here.</p>
  {/if}
</div>
