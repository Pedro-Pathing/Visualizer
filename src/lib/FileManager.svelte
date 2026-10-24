<script lang="ts">
  import { onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import {
    FolderOpen,
    LoaderCircle,
    Plus,
    TriangleAlert,
    X,
  } from "@lucide/svelte";
  import type { FileInfo } from "../types";
  import * as browserFileStore from "../utils/browserFileStore";
  import { currentFilePath } from "../stores";
  import { useProject } from "../state/project.svelte";
  import {
    createDefaultProject,
    parseProject,
    serializeProject,
    type ProjectDoc,
  } from "../io";
  import { downloadJson } from "../utils/download";
  import {
    OPENABLE_EXTENSIONS,
    PROJECT_EXTENSION,
    stripProjectExtension,
  } from "../utils/filename";
  import {
    canPickExistingFile,
    isPickerCancel,
    overwritePickedFile,
  } from "./files/localFiles";
  import { showToast } from "./toast";
  import { confirmDialog } from "./dialog";
  import { askFileName } from "./files/fileNames";
  import Button from "./components/ui/Button.svelte";
  import IconButton from "./components/ui/IconButton.svelte";
  import FileListItem from "./components/FileListItem.svelte";
  import FileActionsPanel from "./components/FileActionsPanel.svelte";

  interface Props {
    isOpen?: boolean;
    currentProject: () => ProjectDoc;
    applyProject: (doc: ProjectDoc) => void;
    fieldMap: string;
  }

  let {
    isOpen = $bindable(false),
    currentProject,
    applyProject,
    fieldMap,
  }: Props = $props();

  const project = useProject();
  let files: FileInfo[] = $state([]);
  let loading = $state(false);
  let errorMessage = $state("");

  let selectedFile = $derived(
    files.find((file) => file.path === $currentFilePath) ?? null,
  );

  function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function extension(fileName: string): string {
    return fileName.match(/\.[^/.]+$/)?.[0].toLowerCase() ?? "";
  }

  async function loadDirectory() {
    loading = true;
    await refreshDirectory();
    loading = false;
  }

  async function refreshDirectory() {
    try {
      const stored = await browserFileStore.listFiles();
      files = stored
        .filter((file) => OPENABLE_EXTENSIONS.includes(extension(file.name)))
        .map((file) => ({ ...file, modified: new Date(file.modified) }));
      errorMessage = "";
    } catch (error) {
      errorMessage = `Failed to load files: ${getErrorMessage(error)}`;
      files = [];
    }
  }

  async function syncActiveProjectToStorage() {
    if (!$currentFilePath) return;
    await browserFileStore.writeFile(
      $currentFilePath,
      serializeProject(currentProject()),
    );
    project.markSaved();
  }

  /** Read and normalize a stored path file. Reports errors and returns null. */
  async function readPathFile(file: FileInfo): Promise<ProjectDoc | null> {
    let content: string;
    try {
      content = await browserFileStore.readFile(file.path);
    } catch (error) {
      showToast(`Error loading file: ${getErrorMessage(error)}`, "error");
      return null;
    }

    const result = parseProject(content, currentProject().robot);
    if (!result.ok) {
      showToast(result.error, "error");
      return null;
    }
    result.warnings.forEach((warning) => showToast(warning, "warning"));
    return result.doc;
  }

  /** Store `doc` under `stem`, adding a number if taken, and open it. */
  async function saveAsNewFile(doc: ProjectDoc, stem: string): Promise<string> {
    let name = `${stem}${PROJECT_EXTENSION}`;
    for (let n = 1; await browserFileStore.fileExists(name); n++) {
      name = `${stem}${n}${PROJECT_EXTENSION}`;
    }
    await browserFileStore.writeFile(name, serializeProject(doc));
    await refreshDirectory();
    applyProject(doc);
    currentFilePath.set(name);
    return name;
  }

  async function loadFile(file: FileInfo) {
    const doc = await readPathFile(file);
    if (!doc) return;
    applyProject(doc);
    currentFilePath.set(file.path);
    showToast(`Loaded: ${file.name}`, "success");
  }

  async function createNewFile() {
    const name = await askFileName({
      title: "New path file",
      value: "",
      confirmLabel: "Create",
    });
    if (!name) return;

    try {
      if (
        (await browserFileStore.fileExists(name)) &&
        !(await confirmDialog({
          title: `Overwrite ${name}?`,
          message: "A file with this name already exists.",
          confirmLabel: "Overwrite",
          danger: true,
        }))
      ) {
        return;
      }

      const doc = createDefaultProject(currentProject().robot, fieldMap);
      await browserFileStore.writeFile(name, serializeProject(doc));
      await refreshDirectory();
      applyProject(doc);
      currentFilePath.set(name);
      showToast(`Created: ${name}`, "success");
    } catch (error) {
      showToast(`Failed to create file: ${getErrorMessage(error)}`, "error");
    }
  }

  async function renameFile(file: FileInfo) {
    const name = await askFileName({
      title: "Rename file",
      value: stripProjectExtension(file.name),
      confirmLabel: "Rename",
      isTaken: (candidate) =>
        candidate !== file.path && files.some((f) => f.path === candidate),
    });
    if (!name || name === file.path) return;

    try {
      // The open file is renamed with its in-memory state so unsaved edits survive.
      const isOpenFile = $currentFilePath === file.path;
      const result = await browserFileStore.renameFile(file.path, name);
      if (!result.success) {
        showToast(`Failed to rename "${file.name}"`, "error");
        return;
      }
      if (isOpenFile) {
        await browserFileStore.writeFile(
          name,
          serializeProject(currentProject()),
        );
        currentFilePath.set(name);
        project.markSaved();
      }
      await refreshDirectory();
      showToast(`Renamed to: ${name}`, "success");
    } catch (error) {
      showToast(`Failed to rename: ${getErrorMessage(error)}`, "error");
    }
  }

  async function deleteFile(file: FileInfo) {
    const confirmed = await confirmDialog({
      title: `Delete ${file.name}?`,
      message: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) return;

    try {
      const deleted = await browserFileStore.deleteFile(file.path);
      if (deleted && $currentFilePath === file.path) currentFilePath.set(null);
      await refreshDirectory();
      if (deleted) showToast(`Deleted: ${file.name}`, "success");
      else showToast(`Could not delete ${file.name}: file not found`, "error");
    } catch (error) {
      showToast(`Failed to delete file: ${getErrorMessage(error)}`, "error");
    }
  }

  async function duplicateFile() {
    if (!selectedFile) return;
    const doc = await readPathFile(selectedFile);
    if (!doc) return;

    try {
      const name = await saveAsNewFile(
        doc,
        `${stripProjectExtension(selectedFile.name)}_copy`,
      );
      showToast(`Duplicated: ${name}`, "success");
    } catch (error) {
      showToast(`Failed to duplicate file: ${getErrorMessage(error)}`, "error");
    }
  }

  async function saveCurrentToFile() {
    if (!selectedFile) return;
    try {
      await browserFileStore.writeFile(
        selectedFile.path,
        serializeProject(currentProject()),
      );
      await refreshDirectory();
      project.markSaved();
      showToast(`Saved: ${selectedFile.name}`, "success");
    } catch (error) {
      showToast(`Failed to save file: ${getErrorMessage(error)}`, "error");
    }
  }

  function downloadCurrentToDisk() {
    try {
      const name = selectedFile?.name || `path${PROJECT_EXTENSION}`;
      downloadJson(serializeProject(currentProject(), { pretty: true }), name);
      showToast(`Downloaded: ${name}`, "success");
    } catch (error) {
      showToast(`Failed to download file: ${getErrorMessage(error)}`, "error");
    }
  }

  async function pickAndOverwriteLocalFile() {
    if (!canPickExistingFile()) {
      showToast(
        "This browser can't overwrite local files. Use Download instead.",
        "warning",
      );
      return;
    }

    try {
      const name = await overwritePickedFile(
        serializeProject(currentProject(), { pretty: true }),
      );
      showToast(`Saved to local file: ${name}`, "success");
    } catch (error) {
      if (isPickerCancel(error)) return;
      showToast(
        `Failed to write local file: ${getErrorMessage(error)}`,
        "error",
      );
    }
  }

  onMount(() => {
    syncActiveProjectToStorage()
      .catch((error) => {
        console.error(
          "Failed to sync active project before opening files:",
          error,
        );
      })
      .finally(() => loadDirectory());
  });
</script>

{#if isOpen}
  <!-- The backdrop only catches clicks; the close button is the keyboard path. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    transition:fade|global={{ duration: 200, easing: cubicInOut }}
    class="fixed inset-0 z-1010 bg-black/30"
    onclick={() => (isOpen = false)}
  ></div>

  <aside
    transition:fly|global={{
      duration: 300,
      easing: cubicInOut,
      x: -320,
      opacity: 1,
    }}
    class="fixed inset-y-2 left-2 z-1010 flex w-80 flex-col overflow-hidden rounded-2xl border border-border bg-surface text-body shadow-xl md:w-96"
    aria-label="Files"
  >
    <div class="flex shrink-0 flex-col gap-2 p-3">
      <div class="flex items-center gap-2">
        <h2 class="text-sm font-semibold text-heading">Files</h2>
        {#if files.length > 0}
          <span class="font-mono text-xs tabular-nums text-body"
            >{files.length}</span
          >
        {/if}
        <IconButton
          label="Close files"
          size="sm"
          class="ml-auto"
          onclick={() => (isOpen = false)}
        >
          <X />
        </IconButton>
      </div>

      {#if errorMessage && files.length > 0}
        <p
          class="rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-xs text-danger"
        >
          {errorMessage}
        </p>
      {/if}

      <Button size="sm" class="w-full" onclick={createNewFile}>
        <Plus class="size-3.5" />
        New path file
      </Button>
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
      {#if loading}
        <div class="flex flex-col items-center gap-2 py-10 text-xs text-body">
          <LoaderCircle class="size-5 animate-spin text-primary" />
          Loading files…
        </div>
      {:else if errorMessage && files.length === 0}
        <div
          class="flex flex-col items-center gap-2 px-3 py-10 text-center text-xs text-body"
        >
          <TriangleAlert class="size-6 text-danger" />
          {errorMessage}
        </div>
      {:else if files.length === 0}
        <div class="flex flex-col items-center gap-3 py-10 text-xs text-body">
          <FolderOpen class="size-6 opacity-60" />
          No files yet.
          <Button variant="primary" size="sm" onclick={createNewFile}>
            Create first file
          </Button>
        </div>
      {:else}
        <div class="flex flex-col gap-px">
          {#each files as file (file.path)}
            <FileListItem
              {file}
              isPrimary={selectedFile?.path === file.path}
              onActivate={loadFile}
              onRename={renameFile}
              onDelete={deleteFile}
            />
          {/each}
        </div>
      {/if}
    </div>

    <FileActionsPanel
      {selectedFile}
      onRename={renameFile}
      onDelete={deleteFile}
      onDuplicate={duplicateFile}
      onOverwrite={saveCurrentToFile}
      onNew={createNewFile}
      onDownload={downloadCurrentToDisk}
      onSaveToLocalFile={pickAndOverwriteLocalFile}
    />
  </aside>
{/if}
