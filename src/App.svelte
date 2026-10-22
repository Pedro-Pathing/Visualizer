<script lang="ts">
  import { onMount } from "svelte";
  import Navbar from "./lib/Navbar.svelte";
  import SaveDialog from "./lib/components/SaveDialog.svelte";
  import ProgressDialog from "./lib/components/ProgressDialog.svelte";
  import PanelDivider from "./lib/components/PanelDivider.svelte";
  import MobileBlocked from "./lib/components/MobileBlocked.svelte";
  import LeftRail from "./lib/components/LeftRail.svelte";
  import RightRail from "./lib/components/RightRail.svelte";
  import ToastHost from "./lib/components/ui/ToastHost.svelte";
  import FieldPanel from "./view/FieldPanel.svelte";
  import { fieldMapSource } from "./view/fieldMap";
  import { installShortcuts } from "./lib/shortcuts";
  import { PROJECT_VERSION, createDefaultProject, robotConfigOf } from "./io";
  import { DEFAULT_SETTINGS, FIELD_SIZE } from "./config";
  import { currentFilePath } from "./stores";
  import { basename, pathStem } from "./utils/filename";
  import { atomicSegments } from "./utils/pathTraversal";
  import { ProjectStore, provideProject } from "./state/project.svelte";
  import { EditorState, provideEditor } from "./state/editor.svelte";
  import { Playback, providePlayback } from "./state/playback.svelte";
  import { Prefs } from "./state/prefs.svelte";
  import { Overlays } from "./state/overlays.svelte";
  import { PanelLayout } from "./state/layout.svelte";
  import { ProjectFiles } from "./state/files.svelte";
  import { GifExport } from "./state/gifExport.svelte";

  const project = new ProjectStore(
    createDefaultProject(robotConfigOf(DEFAULT_SETTINGS)),
  );
  const prefs = new Prefs(project);
  const overlays = new Overlays(project, () => prefs.settings);
  const playback = new Playback(project, overlays, () => prefs.settings);
  const editor = new EditorState(project);
  const layout = new PanelLayout(prefs);
  const files = new ProjectFiles(project, prefs, overlays);
  const gif = new GifExport(project, prefs, overlays);
  provideProject(project);
  provideEditor(editor);
  providePlayback(playback);
  files.autosaveSession();

  let fieldElement = $state<HTMLDivElement>();
  let fieldPixels = $state(FIELD_SIZE);

  let collisionCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const { lineId } of playback.collisions) {
      if (lineId) counts[lineId] = (counts[lineId] ?? 0) + 1;
    }
    return counts;
  });

  /** Only trust the browser's own report of a phone or tablet. */
  function isMobileDevice() {
    if (typeof navigator === "undefined") return false;
    const hint = (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
      .userAgentData?.mobile;
    return (
      hint === true ||
      /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk/i.test(navigator.userAgent)
    );
  }
  let isMobileBlocked = $state(isMobileDevice());

  onMount(async () => {
    await prefs.load();
    files.start();
    layout.restore(prefs.value);
  });

  onMount(() => {
    const updateMobile = () => (isMobileBlocked = isMobileDevice());
    window.addEventListener("resize", updateMobile);
    window.addEventListener("orientationchange", updateMobile);
    return () => {
      window.removeEventListener("resize", updateMobile);
      window.removeEventListener("orientationchange", updateMobile);
    };
  });

  onMount(() =>
    installShortcuts([
      { keys: ["mod+s"], run: () => (files.showSaveDialog = true) },
      { keys: ["mod+z"], run: () => project.undo() },
      { keys: ["mod+shift+z", "ctrl+y"], run: () => project.redo() },
      { keys: ["w"], run: () => editor.addPath() },
      { keys: ["a"], run: () => editor.addControlPoint() },
      { keys: ["s"], run: () => editor.removeControlPoint() },
      { keys: ["k"], run: () => playback.toggle() },
      { keys: ["Delete"], run: () => editor.deleteSelectedPoint() },
      {
        keys: ["space"],
        run: () =>
          editor.tool === "select"
            ? playback.toggle()
            : editor.setTool(editor.tool),
      },
    ]),
  );
</script>

<svelte:window
  onmousemove={(event) => layout.moveResize(event)}
  onmouseup={() => layout.endResize()}
  onblur={() => layout.endResize()}
/>

{#if isMobileBlocked}
  <MobileBlocked />
{:else}
  <Navbar
    currentProject={() => files.current()}
    applyProject={(doc) => files.open(doc)}
    bind:prefs={prefs.value}
    saveProject={() => files.save()}
    saveFileAs={() => files.saveAs()}
    renameCurrentFile={() => files.rename()}
    loadFile={(event: Event) => files.upload(event.target as HTMLInputElement)}
    optimizeAllLines={() => editor.optimizeAll(prefs.settings)}
    optimizingAll={editor.optimizing}
    {fieldElement}
    exportPathAsGif={() => gif.run(fieldMapSource(prefs.settings), fieldPixels)}
    leftPanelHidden={layout.leftHidden}
    rightPanelHidden={layout.rightHidden}
    onToggleLeftPanel={() => layout.toggle("left")}
    onToggleRightPanel={() => layout.toggle("right")}
  />

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

  <ToastHost />

  <div class="ui-shell w-screen h-screen pt-[5.1rem] px-3 pb-3">
    <div
      class="desktop-grid h-full"
      style={`--left-panel-width: ${layout.leftHidden ? "0px" : `${layout.leftWidth}px`}; --right-panel-width: ${layout.rightHidden ? "0px" : `${layout.rightWidth}px`}; --center-width: ${layout.centerWidth}px;`}
    >
      <LeftRail
        hidden={layout.leftHidden}
        fileName={basename($currentFilePath) || "untitled_path.pp"}
        version={`v${PROJECT_VERSION}`}
        lineCount={atomicSegments(project.doc.lines).length}
        pathPreviewItems={editor.pathListItems}
        selectedPathIds={editor.selectedPathIds}
        primarySelectedId={editor.primarySelectedId}
        groupingBlockedReason={editor.groupingBlockedReason}
        canUngroup={editor.selectedPath?.kind === "compound"}
        {collisionCounts}
        onToggleVisibility={() => layout.toggle("left")}
        onSelectPath={(id, modifiers) => editor.selectFromList(id, modifiers)}
        onGroup={() => editor.groupSelected()}
        onUngroup={() => editor.ungroupSelected()}
        onReorderPath={(dragged, target, position) =>
          editor.reorderPath(dragged, target, position)}
      />

      <PanelDivider
        side="left"
        hidden={layout.leftHidden}
        onResizeStart={(side, event) => layout.beginResize(side, event)}
        onRestore={() => layout.show("left")}
      />

      <FieldPanel
        settings={prefs.settings}
        {overlays}
        bind:element={fieldElement}
        bind:pixels={fieldPixels}
      />

      <PanelDivider
        side="right"
        hidden={layout.rightHidden}
        onResizeStart={(side, event) => layout.beginResize(side, event)}
        onRestore={() => layout.show("right")}
      />

      <RightRail
        hidden={layout.rightHidden}
        settings={prefs.settings}
        onToggleVisibility={() => layout.toggle("right")}
      />
    </div>
  </div>
{/if}
