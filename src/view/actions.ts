import { get } from "svelte/store";
import type { Settings } from "../types";
import type { MenuItem } from "../lib/components/ui/menu";
import { formatKeys, type KeySpec, type Shortcut } from "../lib/shortcuts";
import { showToast } from "../lib/toast";
import { currentFilePath } from "../stores";
import { downloadBlob } from "../utils/download";
import { exportElementAsPng } from "../utils/exportImage";
import { pathStem } from "../utils/filename";
import type { Dialogs } from "../state/dialogs.svelte";
import type { EditorState } from "../state/editor.svelte";
import type { ProjectFiles } from "../state/files.svelte";
import type { GifExport } from "../state/gifExport.svelte";
import type { PanelLayout } from "../state/layout.svelte";
import type { Playback } from "../state/playback.svelte";
import type { Prefs } from "../state/prefs.svelte";
import type { ProjectStore } from "../state/project.svelte";
import { fieldMapSource } from "./fieldMap";
import {
  cycleGrid,
  toggleProtractor,
  toggleRuler,
  toggleSnap,
} from "./viewOptions";

export type CodeFormat = "java" | "kotlin" | "points";

/** Something the user can do, reachable from the palette and maybe a shortcut. */
export interface Action {
  id: string;
  title: string;
  group: string;
  keys?: KeySpec[];
  /** Hidden from the palette, and its shortcut ignored, while false. */
  when?: () => boolean;
  run: () => void;
}

export interface ActionDeps {
  project: ProjectStore;
  editor: EditorState;
  playback: Playback;
  prefs: Prefs;
  files: ProjectFiles;
  gif: GifExport;
  layout: PanelLayout;
  dialogs: Dialogs;
  field: () => { element?: HTMLDivElement; pixels: number };
  exportCode: (format: CodeFormat) => void;
}

type Flag = keyof NonNullable<Settings["experimentalFeatures"]>;

export function createActions(deps: ActionDeps): Action[] {
  const { project, editor, playback, prefs, files, gif, layout, dialogs } =
    deps;
  const flag = (name: Flag) =>
    Boolean(prefs.settings.experimentalFeatures?.[name]);
  const toggleFlag = (name: Flag) => {
    prefs.value.experimentalFeatures = {
      ...prefs.value.experimentalFeatures,
      [name]: !flag(name),
    };
  };
  const drawing = () => editor.tool !== "select";

  async function exportFieldImage() {
    const { element } = deps.field();
    if (!element) return;
    try {
      const blob = await exportElementAsPng(element, { scale: 2 });
      const name = pathStem(get(currentFilePath)) || "field";
      downloadBlob(blob, `${name}_field.png`);
      showToast("Exported field as image", "success");
    } catch (error) {
      console.error("Field image export failed:", error);
      showToast("Couldn't export the field as an image.", "error");
    }
  }

  const actions: Action[] = [
    {
      id: "file.new",
      group: "File",
      title: "New project",
      run: () => files.newProject(),
    },
    {
      id: "file.open",
      group: "File",
      title: "Open…",
      keys: ["mod+o"],
      run: () => (dialogs.fileManager = true),
    },
    {
      id: "file.import",
      group: "File",
      title: "Open from computer…",
      run: () => files.openFromDisk(),
    },
    {
      id: "file.save",
      group: "File",
      title: "Save",
      keys: ["mod+s"],
      run: () =>
        get(currentFilePath)
          ? void files.save()
          : (files.showSaveDialog = true),
    },
    {
      id: "file.saveAs",
      group: "File",
      title: "Save to computer…",
      keys: ["mod+shift+s"],
      run: () => void files.saveAs(),
    },
    {
      id: "file.rename",
      group: "File",
      title: "Rename…",
      when: () => Boolean(get(currentFilePath)),
      run: () => void files.rename(),
    },

    {
      id: "edit.undo",
      group: "Edit",
      title: "Undo",
      keys: ["mod+z"],
      when: () => project.canUndo,
      run: () => project.undo(),
    },
    {
      id: "edit.redo",
      group: "Edit",
      title: "Redo",
      keys: ["mod+shift+z", "ctrl+y"],
      when: () => project.canRedo,
      run: () => project.redo(),
    },
    {
      id: "edit.addPath",
      group: "Edit",
      title: "Add path",
      keys: ["w"],
      run: () => editor.addPath(),
    },
    {
      id: "edit.addControlPoint",
      group: "Edit",
      title: "Add control point",
      keys: ["a"],
      run: () => editor.addControlPoint(),
    },
    {
      id: "edit.removeControlPoint",
      group: "Edit",
      title: "Remove last control point",
      keys: ["s"],
      run: () => editor.removeControlPoint(),
    },
    {
      id: "edit.deletePoint",
      group: "Edit",
      title: "Delete selected point",
      keys: ["Delete", "Backspace"],
      when: () => editor.selectedLine !== null,
      run: () => editor.deleteSelectedPoint(),
    },
    {
      id: "edit.group",
      group: "Edit",
      title: "Group selected paths",
      keys: ["mod+g"],
      when: () => editor.groupingBlockedReason === null,
      run: () => editor.groupSelected(),
    },
    {
      id: "edit.ungroup",
      group: "Edit",
      title: "Ungroup",
      keys: ["mod+shift+g"],
      when: () => editor.selectedPath?.kind === "compound",
      run: () => editor.ungroupSelected(),
    },
    {
      id: "edit.deselect",
      group: "Edit",
      title: "Deselect",
      keys: ["Escape"],
      when: () => !drawing(),
      run: () => editor.clearSelection(),
    },

    {
      id: "tool.exit",
      group: "Tools",
      title: "Back to select tool",
      keys: ["space", "Escape"],
      when: drawing,
      run: () => editor.setTool(editor.tool),
    },
    {
      id: "tool.pen",
      group: "Tools",
      title: "Pen tool",
      keys: ["p"],
      run: () => editor.setTool("pen"),
    },
    {
      id: "tool.coordinate",
      group: "Tools",
      title: "Coordinate picker",
      keys: ["c"],
      run: () => editor.setTool("coordinate"),
    },

    {
      id: "playback.toggle",
      group: "Playback",
      title: "Play / pause",
      keys: ["space", "k"],
      run: () => playback.toggle(),
    },
    {
      id: "playback.restart",
      group: "Playback",
      title: "Back to start",
      keys: ["Home"],
      run: () => playback.seek(0),
    },

    {
      id: "view.grid",
      group: "View",
      title: "Cycle grid size",
      keys: ["g"],
      run: cycleGrid,
    },
    {
      id: "view.snap",
      group: "View",
      title: "Toggle snap to grid",
      run: toggleSnap,
    },
    {
      id: "view.ruler",
      group: "View",
      title: "Toggle ruler",
      keys: ["r"],
      run: toggleRuler,
    },
    {
      id: "view.protractor",
      group: "View",
      title: "Toggle protractor",
      run: toggleProtractor,
    },
    {
      id: "view.leftPanel",
      group: "View",
      title: "Toggle layers panel",
      keys: ["mod+["],
      run: () => layout.toggle("left"),
    },
    {
      id: "view.rightPanel",
      group: "View",
      title: "Toggle inspector",
      keys: ["mod+]"],
      run: () => layout.toggle("right"),
    },
    {
      id: "app.settings",
      group: "View",
      title: "Settings",
      keys: ["mod+,"],
      run: () => (dialogs.settings = true),
    },

    {
      id: "export.java",
      group: "Export",
      title: "Export Java code",
      run: () => deps.exportCode("java"),
    },
    {
      id: "export.kotlin",
      group: "Export",
      title: "Export Kotlin code",
      run: () => deps.exportCode("kotlin"),
    },
    {
      id: "export.points",
      group: "Export",
      title: "Export points array",
      run: () => deps.exportCode("points"),
    },
    {
      id: "export.image",
      group: "Export",
      title: "Export field as image",
      run: () => void exportFieldImage(),
    },
    {
      id: "export.gif",
      group: "Export",
      title: "Export animation as GIF",
      when: () => !gif.running,
      run: () =>
        void gif.run(fieldMapSource(prefs.settings), deps.field().pixels),
    },

    {
      id: "experimental.optimize",
      group: "Experimental",
      title: "Optimize all paths",
      when: () => flag("optimize") && !editor.optimizing,
      run: () => void editor.optimizeAll(prefs.settings),
    },
    {
      id: "experimental.curveThrough",
      group: "Experimental",
      title: "Replace paths with one through-curve",
      when: () => flag("curveThrough"),
      run: () => editor.curveThroughAll(prefs.settings),
    },
    {
      id: "experimental.toggleOptimize",
      group: "Experimental",
      title: "Toggle the optimizer",
      run: () => toggleFlag("optimize"),
    },
    {
      id: "experimental.toggleCurveThrough",
      group: "Experimental",
      title: "Toggle through-curves",
      run: () => toggleFlag("curveThrough"),
    },
    {
      id: "experimental.toggleObstacles",
      group: "Experimental",
      title: "Toggle obstacles and collision checks",
      run: () => toggleFlag("obstacles"),
    },
  ];

  return [
    {
      id: "app.palette",
      group: "View",
      title: "Command palette",
      keys: ["mod+k"],
      run: () => (dialogs.palette = !dialogs.palette),
    },
    ...actions,
  ];
}

/** The actions as shortcuts; only the palette's works while a dialog is open. */
export function shortcutsFor(actions: Action[], deps: ActionDeps): Shortcut[] {
  const idle = () =>
    !deps.dialogs.anyOpen && !deps.files.showSaveDialog && !deps.gif.running;
  return actions.map((action) => ({
    keys: action.keys,
    run: action.run,
    when: () =>
      (action.id === "app.palette" || idle()) && (action.when?.() ?? true),
  }));
}

/** Look an action up by id; a missing id is a programming error. */
export function actionById(actions: Action[], id: string): Action {
  const action = actions.find((candidate) => candidate.id === id);
  if (!action) throw new Error(`Unknown action: ${id}`);
  return action;
}

/** A menu row for an action, disabled while it's unavailable. */
export function menuItem(action: Action, label = action.title): MenuItem {
  return {
    label,
    hint: action.keys?.[0] && formatKeys(action.keys[0]),
    disabled: !(action.when?.() ?? true),
    run: action.run,
  };
}
