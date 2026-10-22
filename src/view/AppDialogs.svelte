<script lang="ts">
  import { currentFilePath } from "../stores";
  import { pathStem } from "../utils/filename";
  import { useProject } from "../state/project.svelte";
  import type { Dialogs } from "../state/dialogs.svelte";
  import type { ProjectFiles } from "../state/files.svelte";
  import type { GifExport } from "../state/gifExport.svelte";
  import type { Prefs } from "../state/prefs.svelte";
  import FileManager from "../lib/FileManager.svelte";
  import ExportCodeDialog from "../lib/components/ExportCodeDialog.svelte";
  import SettingsDialog from "../lib/components/SettingsDialog.svelte";
  import SaveDialog from "../lib/components/SaveDialog.svelte";
  import ProgressDialog from "../lib/components/ProgressDialog.svelte";
  import ToastHost from "../lib/components/ui/ToastHost.svelte";
  import CommandPalette from "./CommandPalette.svelte";
  import type { Action, CodeFormat } from "./actions";

  interface Props {
    dialogs: Dialogs;
    files: ProjectFiles;
    gif: GifExport;
    prefs: Prefs;
    actions: Action[];
  }

  let { dialogs, files, gif, prefs, actions }: Props = $props();

  const project = useProject();
  let exportDialog = $state<ExportCodeDialog>();

  export function exportCode(format: CodeFormat) {
    dialogs.fileManager = false;
    void exportDialog?.openWithFormat(format);
  }
</script>

{#if dialogs.fileManager}
  <FileManager
    bind:isOpen={dialogs.fileManager}
    currentProject={() => files.current()}
    applyProject={(doc) => files.open(doc)}
  />
{/if}

<ExportCodeDialog
  bind:this={exportDialog}
  bind:isOpen={dialogs.exportCode}
  startPoint={project.doc.startPoint}
  lines={project.doc.lines}
  sequence={project.doc.sequence}
/>

<SettingsDialog bind:isOpen={dialogs.settings} bind:prefs={prefs.value} />

<SaveDialog
  bind:isOpen={files.showSaveDialog}
  isSaving={files.isSaving}
  fileName={pathStem($currentFilePath) || "my_path"}
  onSave={(name) => files.saveNamed(name)}
/>

<ProgressDialog
  isOpen={gif.running}
  progress={gif.progress}
  statusMessage={gif.status}
  onCancel={() => gif.cancel()}
/>

<CommandPalette {actions} bind:open={dialogs.palette} />

<ToastHost />
