<script lang="ts">
  import { onMount } from "svelte";
  import PanelDivider from "./lib/components/PanelDivider.svelte";
  import MobileBlocked from "./lib/components/MobileBlocked.svelte";
  import TopBar from "./view/TopBar.svelte";
  import LayersPanel from "./view/LayersPanel.svelte";
  import FieldPanel from "./view/FieldPanel.svelte";
  import Inspector from "./view/Inspector.svelte";
  import AppDialogs from "./view/AppDialogs.svelte";
  import { createActions, shortcutsFor, type ActionDeps } from "./view/actions";
  import { installShortcuts } from "./lib/shortcuts";
  import { createDefaultProject, robotConfigOf } from "./io";
  import { DEFAULT_SETTINGS, FIELD_SIZE } from "./config";
  import { ProjectStore, provideProject } from "./state/project.svelte";
  import { EditorState, provideEditor } from "./state/editor.svelte";
  import { Playback, providePlayback } from "./state/playback.svelte";
  import { Prefs } from "./state/prefs.svelte";
  import { Overlays } from "./state/overlays.svelte";
  import { PanelLayout } from "./state/layout.svelte";
  import { ProjectFiles } from "./state/files.svelte";
  import { GifExport } from "./state/gifExport.svelte";
  import { Dialogs } from "./state/dialogs.svelte";

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
  const dialogs = new Dialogs();
  provideProject(project);
  provideEditor(editor);
  providePlayback(playback);
  files.autosaveSession();

  let fieldElement = $state<HTMLDivElement>();
  let fieldPixels = $state(FIELD_SIZE);
  let appDialogs = $state<AppDialogs>();

  const deps: ActionDeps = {
    project,
    editor,
    playback,
    prefs,
    files,
    gif,
    layout,
    dialogs,
    field: () => ({ element: fieldElement, pixels: fieldPixels }),
    exportCode: (format) => appDialogs?.exportCode(format),
  };
  const actions = createActions(deps);

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

  onMount(() => installShortcuts(shortcutsFor(actions, deps)));
</script>

<svelte:window
  onmousemove={(event) => layout.moveResize(event)}
  onmouseup={() => layout.endResize()}
  onblur={() => layout.endResize()}
/>

{#if isMobileBlocked}
  <MobileBlocked />
{:else}
  <TopBar {actions} />
  <AppDialogs bind:this={appDialogs} {dialogs} {files} {gif} {prefs} {actions} />

  <div class="h-screen w-screen px-3 pt-17 pb-3">
    <div
      class="desktop-grid h-full"
      style={`--left-panel-width: ${layout.leftHidden ? "0px" : `${layout.leftWidth}px`}; --right-panel-width: ${layout.rightHidden ? "0px" : `${layout.rightWidth}px`};`}
    >
      <LayersPanel
        settings={prefs.settings}
        {overlays}
        hidden={layout.leftHidden}
        onHide={() => layout.toggle("left")}
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

      <Inspector
        {prefs}
        hidden={layout.rightHidden}
        onHide={() => layout.toggle("right")}
      />
    </div>
  </div>
{/if}
