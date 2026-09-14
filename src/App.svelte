<script lang="ts">
  import { run } from "svelte/legacy";

  import type {
    Path,
    BasePoint,
    Settings,
    PathListItem,
    SequenceItem,
    SequencePathItem,
    Shape,
    StartPose,
  } from "./types";
  import * as d3 from "d3";
  import {
    snapToGrid,
    gridSize,
    currentFilePath,
    isUnsaved,
    showGrid,
    dualPathMode,
    secondFilePath,
    activePaths,
    fieldFrame,
  } from "./stores";
  import Two from "two.js";
  import type { Path as TwoPath } from "two.js/src/path";
  import type { Line as PathLine } from "two.js/src/shapes/line";
  import ControlTab from "./lib/ControlTab.svelte";
  import Navbar from "./lib/Navbar.svelte";
  import MathTools from "./lib/MathTools.svelte";
  import SaveDialog from "./lib/components/SaveDialog.svelte";
  import DualPathSaveDialog from "./lib/components/DualPathSaveDialog.svelte";
  import ProgressDialog from "./lib/components/ProgressDialog.svelte";
  import RobotSprite from "./lib/components/RobotSprite.svelte";
  import PanelDivider from "./lib/components/PanelDivider.svelte";
  import FieldToolbar from "./lib/components/FieldToolbar.svelte";
  import MobileBlocked from "./lib/components/MobileBlocked.svelte";
  import LeftRail from "./lib/components/LeftRail.svelte";
  import FieldMapImage from "./lib/components/FieldMapImage.svelte";
  import FieldLoadingOverlay from "./lib/components/FieldLoadingOverlay.svelte";
  import ToastHost from "./lib/components/ui/ToastHost.svelte";
  import _ from "lodash";
  import hotkeys from "hotkeys-js";
  import { createAnimationController } from "./utils/animation";
  import { createPerfSampler, sampleNodeCounts } from "./utils/perf";
  import { exportAsGif } from "./utils/gifExporter";
  import { downloadBlob } from "./utils/download";
  import {
    PROJECT_VERSION,
    buildProject,
    newerVersionWarning,
  } from "./utils/project";
  import { showToast } from "./lib/toast";
  import { basename, pathStem } from "./utils/filename";
  import { buildPathElements } from "./lib/scene/paths";
  import { fitStrokeToLines } from "./lib/pen/strokeFitting";
  import {
    PointRegistry,
    pointKey,
    snapPointToGrid,
  } from "./lib/canvas/pointRefs";
  import {
    PANEL_DIVIDER_WIDTH,
    clampPanelWidth,
    getCenterWidth,
    getLeftPanelMinWidth,
    getMinCenterWidthForSquare,
    getRightPanelMinWidth,
    getTotalAvailableWidth,
  } from "./lib/panels/panelLayout";
  import {
    GIF_EXPORT_FPS,
    GIF_EXPORT_QUALITY,
    GIF_EXPORT_SCALE,
    computeGifDuration,
    createImageLoader,
    createRobotDrawer,
    drawPathLayer,
    formatGifProgressStatus,
    pathLayerLineWidth,
    resolveGifFileName,
  } from "./lib/export/gifExport";
  import {
    applyOptimizedWaypoints,
    buildOptimizationPayload,
    runOptimization,
  } from "./lib/optimizer/optimizer";
  import {
    clamp,
    clampFieldCoordinate,
    distanceBetweenPoints,
  } from "./utils/math";
  import {
    buildPathPointMarkers,
    buildSelectedPointRing,
    buildObstacleVertexMarkers,
  } from "./lib/scene/points";
  import {
    buildClosedPolygon,
    buildGhostPath,
    buildOnionLayer,
    selectVisibleOnionLayers,
  } from "./lib/scene/polygons";
  import { renderFieldPoints, type FieldPoint } from "./utils/fieldPoints";
  import {
    calculateVisualizationPathTime,
    getAnimationDuration,
    calculateRobotState,
    generateGhostPathPoints,
    generateOnionLayers,
    getRandomColor,
    normalizePaths,
    makePathId,
    createSegment,
    downloadTrajectory,
    loadTrajectoryFromFile,
    updateRobotImageDisplay,
    atomicSegments,
    findSegmentById,
    findPathById,
    groupPaths,
    groupingProblem,
    segmentStartById,
    ungroupPath,
    movePath,
    reorderSequenceToMatch,
    hydrateProjectDoc,
  } from "./utils";
  import { get } from "svelte/store";
  import { frameForSettings, toDocFrame } from "./utils/frame";
  import {
    POINT_RADIUS,
    LINE_WIDTH,
    DEFAULT_ROBOT_WIDTH,
    DEFAULT_ROBOT_HEIGHT,
    DEFAULT_SETTINGS,
    FIELD_SIZE,
    getDefaultStartPoint,
    getDefaultPaths,
    getDefaultShapes,
  } from "./config";
  import {
    loadSettings,
    saveSettings,
    normalizeLegacyFieldMap,
  } from "./utils/settingsPersistence";
  import {
    loadSessionSnapshot,
    saveSessionSnapshot,
    type SessionSnapshot,
  } from "./lib/session/sessionSnapshot";
  import * as browserFileStore from "./utils/browserFileStore";
  import { onDestroy, onMount, tick } from "svelte";
  import { debounce } from "lodash";
  import { createHistory, type AppState } from "./utils/history";
  // Browser-only build: file operations use the browser file store and
  // localStorage. Electron-specific APIs have been removed.

  // Canvas state
  let two = $state<Two>()!;
  let twoElement = $state<HTMLDivElement>()!;
  let fieldPointsCanvas = $state<HTMLCanvasElement>()!;
  let width = $state(0);
  let height = $state(0);
  let leftPanelWidth = $state(DEFAULT_SETTINGS.leftPanelWidth || 370);
  let rightPanelWidth = $state(DEFAULT_SETTINGS.rightPanelWidth || 620);
  let leftPanelHidden = $state(false);
  let rightPanelHidden = $state(false);
  let panelResizeState:
    | { side: "left"; startX: number; startWidth: number }
    | { side: "right"; startX: number; startWidth: number }
    | null = null;
  let robotXY: BasePoint = $state({ x: 0, y: 0 });
  let robotHeading: number = $state(0);
  let robotT: number | null = $state(null);
  // Animation state
  let percent: number = $state(0);
  let playing = $state(false);
  // Save dialog state
  let showSaveDialog = $state(false);
  let showDualPathSaveDialog = $state(false);
  let isSaving = $state(false);
  // GIF export state
  let exportingGif = $state(false);
  let gifExportProgress = $state(0);
  let gifExportStatus = $state("Preparing...");
  let cancelGifExport = $state(false);
  // Path data
  let settings: Settings = $state({ ...DEFAULT_SETTINGS });
  // Undo and file loads replace `settings` wholesale, so publish only when the
  // frame actually differs: a new-but-equal Frame would invalidate every
  // derived bound and redraw the grid for nothing.
  $effect(() => {
    const next = frameForSettings(settings);
    const current = get(fieldFrame);
    if (
      next.axes !== current.axes ||
      next.center.x !== current.center.x ||
      next.center.y !== current.center.y
    ) {
      fieldFrame.set(next);
    }
  });
  let startPoint: StartPose = $state(getDefaultStartPoint());
  const initialLines = normalizePaths(getDefaultPaths());
  let lines: Path[] = $state(initialLines);
  let fieldPoints: FieldPoint[] = $state([]);

  function detectMobileDevice() {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return false;
    }
    const userAgent = navigator.userAgent || "";
    // Prefer the standard, high-confidence signal when it's available.
    const mobileHint =
      "userAgentData" in navigator
        ? ((navigator as Navigator & { userAgentData?: { mobile?: boolean } })
            .userAgentData?.mobile ?? false)
        : false;

    // Only treat a device as mobile when the user agent itself reports it.
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk/i.test(
      userAgent,
    );

    return mobileHint || uaMobile;
  }

  let sequence: SequenceItem[] = $state(
    atomicSegments(initialLines).map((ln) => ({
      kind: "path",
      lineId: ln.id,
    })),
  );
  let selectedPathIds: string[] = $state(
    initialLines[0] ? [initialLines[0].id] : [],
  );
  let primarySelectedId = $derived(
    selectedPathIds[selectedPathIds.length - 1] ?? null,
  );
  let selectedPath = $derived(findPathById(lines, primarySelectedId));
  /** Only a drivable segment can have its points edited. */
  let selectedLineId = $derived(
    selectedPath?.kind === "atomic" ? selectedPath.id : null,
  );
  let selectedPointIndex = $state(0);
  let selectedLineIndex = $derived(
    lines.findIndex((line) => line.id === selectedLineId),
  );

  let displayOrderIds = $derived.by(() => {
    const out: string[] = [];
    const walk = (nodes: Path[]) => {
      for (const node of nodes) {
        out.push(node.id);
        if (node.kind === "compound") walk(node.segments);
      }
    };
    walk(lines);
    return out;
  });

  function selectPathFromList(
    id: string,
    modifiers: { additive?: boolean; range?: boolean } = {},
  ) {
    if (modifiers.range && primarySelectedId) {
      const from = displayOrderIds.indexOf(primarySelectedId);
      const to = displayOrderIds.indexOf(id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        const span = displayOrderIds.slice(lo, hi + 1);
        // Keep the clicked path primary so the inspector follows the cursor.
        selectedPathIds = [...span.filter((entry) => entry !== id), id];
        return;
      }
    }

    if (modifiers.additive) {
      selectedPathIds = selectedPathIds.includes(id)
        ? selectedPathIds.filter((entry) => entry !== id)
        : [...selectedPathIds, id];
      return;
    }

    selectedPathIds = [id];
  }

  let groupingBlockedReason = $derived(groupingProblem(lines, selectedPathIds));

  function groupSelectedPaths() {
    if (groupingBlockedReason) return;
    const next = groupPaths(lines, selectedPathIds);
    if (next === lines) return;
    lines = next;
    // Select the group that was just created.
    const created = next.find(
      (path) =>
        path.kind === "compound" &&
        !selectedPathIds.includes(path.id) &&
        path.segments.some((child) => selectedPathIds.includes(child.id)),
    );
    selectedPathIds = created ? [created.id] : selectedPathIds;
    recordChange();
  }

  function ungroupSelectedPath() {
    const target = selectedPath;
    if (!target || target.kind !== "compound") return;
    const childIds = target.segments.map((child) => child.id);
    lines = ungroupPath(lines, target.id);
    selectedPathIds = childIds;
    recordChange();
  }
  let penToolEnabled = $state(false);
  let penStroke: BasePoint[] = $state([]);
  let penIsDrawing = $state(false);
  let fieldMapLoaded = $state(false);
  let robotImageLoaded = $state(false);
  let lastFieldMapSrc = $state("");
  let lastRobotImageSrc = $state("");
  let isMobileBlocked = $state(false);
  // Match the smallest of width/height so the field image and grid stay aligned
  let effectiveSize = $derived(
    Math.min(width || FIELD_SIZE, height || FIELD_SIZE),
  );
  let fieldStageWidth = $state(FIELD_SIZE);
  let fieldStageHeight = $state(FIELD_SIZE);

  if (typeof window !== "undefined") {
    // Initial detection
    isMobileBlocked = detectMobileDevice();
  }

  // Re-evaluate on viewport changes which can indicate mobile/orientation changes
  onMount(() => {
    const updateMobile = () => {
      try {
        isMobileBlocked = detectMobileDevice();
      } catch (e) {
        /* ignore */
      }
    };
    window.addEventListener("resize", updateMobile);
    window.addEventListener("orientationchange", updateMobile);

    return () => {
      window.removeEventListener("resize", updateMobile);
      window.removeEventListener("orientationchange", updateMobile);
    };
  });

  let shapes: Shape[] = $state(getDefaultShapes());
  let optimizingLineIds: Record<string, boolean> = {};
  let optimizingAll = $state(false);

  // Second path data (for alliance coordination) - DEPRECATED, use additionalPaths
  let secondStartPoint: StartPose | null = $state(null);
  let secondLines: Path[] = $state([]);
  let secondSequence: SequenceItem[] = $state([]);
  let secondShapes: Shape[] = $state([]);

  // Multiple paths data (new system - supports up to 4 paths total)
  interface AdditionalPathData {
    filePath: string;
    startPoint: StartPose | null;
    lines: Path[];
    sequence: SequenceItem[];
    shapes: Shape[];
    settings: Settings;
    color?: string; // Optional custom color for this path
  }
  let additionalPaths: AdditionalPathData[] = $state([]);

  const formatPathPoint = (value: number) =>
    Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);

  const history = createHistory();
  const { canUndoStore, canRedoStore } = history;

  function commitPenStroke() {
    const selectedLine = findSegmentById(lines, selectedLineId);
    const startAnchor = selectedLine?.endPoint || undefined;
    const fitted = fitStrokeToLines(
      penStroke,
      Number(settings?.penToolMaxPaths ?? DEFAULT_SETTINGS.penToolMaxPaths),
      startAnchor,
    );
    penStroke = [];
    penIsDrawing = false;

    if (!fitted) return;

    const newLines = fitted.lines;
    if (newLines.length === 0) return;

    if (selectedLine?.id) {
      const insertAt = lines.findIndex((line) => line.id === selectedLine.id);
      const nextLines = [...lines];
      nextLines.splice(
        insertAt >= 0 ? insertAt + 1 : nextLines.length,
        0,
        ...newLines,
      );
      lines = normalizePaths(nextLines);

      const nextSequence = [...sequence];
      const seqIndex = sequence.findIndex(
        (item) => item.kind === "path" && item.lineId === selectedLine.id,
      );
      nextSequence.splice(
        seqIndex >= 0 ? seqIndex + 1 : nextSequence.length,
        0,
        ...newLines.map((line) => ({
          kind: "path" as const,
          lineId: line.id,
        })),
      );
      sequence = nextSequence;

      selectedPathIds = [newLines[newLines.length - 1].id];
      selectedPointIndex = 0;
    } else {
      startPoint = fitted.startPoint;
      lines = normalizePaths(newLines);
      sequence = atomicSegments(lines).map((line) => ({
        kind: "path",
        lineId: line.id,
      }));
      selectedPathIds = lines[0] ? [lines[0].id] : [];
      selectedPointIndex = 0;
    }

    selectedPointIndex = 0;
    recordChange();
    two?.update();
  }

  function togglePenTool() {
    penToolEnabled = !penToolEnabled;
    if (!penToolEnabled) {
      penStroke = [];
      penIsDrawing = false;
    }
  }

  function beginPanelResize(side: "left" | "right", event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    panelResizeState = {
      side,
      startX: event.clientX,
      startWidth: side === "left" ? leftPanelWidth : rightPanelWidth,
    };

    if (typeof document !== "undefined") {
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    }
  }

  function endPanelResize() {
    panelResizeState = null;

    if (typeof document !== "undefined") {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  }

  function handlePanelResize(event: MouseEvent) {
    if (!panelResizeState) return;

    const availableWidth = Math.max(0, window.innerWidth - 24);
    if (panelResizeState.side === "left") {
      const rightPanelMinWidth = Math.max(
        0,
        Number(
          settings?.rightPanelMinWidth ?? DEFAULT_SETTINGS.rightPanelMinWidth,
        ),
      );
      const otherWidth = rightPanelHidden
        ? 0
        : Math.max(rightPanelWidth, rightPanelMinWidth);
      const desiredWidth =
        panelResizeState.startWidth + (event.clientX - panelResizeState.startX);
      leftPanelHidden = false;
      leftPanelWidth = clampPanelWidth(
        "left",
        desiredWidth,
        availableWidth,
        otherWidth,
        settings,
      );
      settings.leftPanelWidth = leftPanelWidth;
    } else {
      const leftPanelMinWidth = getLeftPanelMinWidth(settings);
      const otherWidth = leftPanelHidden
        ? 0
        : Math.max(leftPanelWidth, leftPanelMinWidth);
      const desiredWidth =
        panelResizeState.startWidth - (event.clientX - panelResizeState.startX);
      rightPanelHidden = false;
      rightPanelWidth = clampPanelWidth(
        "right",
        desiredWidth,
        availableWidth,
        otherWidth,
        settings,
      );
      settings.rightPanelWidth = rightPanelWidth;
    }
  }

  /** Drag-and-drop reordering from the Path List. */
  function reorderPath(
    draggedId: string,
    targetId: string,
    position: "before" | "after",
  ) {
    const next = movePath(lines, draggedId, targetId, position);
    if (next === lines) return;
    lines = next;
    // Playback follows the sequence, so it has to track the new order.
    sequence = reorderSequenceToMatch(lines, sequence);
    recordChange();
  }

  function toggleLeftPanelVisibility() {
    leftPanelHidden = !leftPanelHidden;
  }

  function toggleRightPanelVisibility() {
    rightPanelHidden = !rightPanelHidden;
  }

  function gridSnapOptions() {
    return {
      snapToGrid: $snapToGrid,
      showGrid: $showGrid,
      gridSize: $gridSize,
      frame: $fieldFrame,
    };
  }

  function getMouseFieldPoint(evt: MouseEvent): BasePoint | null {
    if (!two?.renderer?.domElement) return null;
    const rect = two.renderer.domElement.getBoundingClientRect();
    return {
      x: clampFieldCoordinate(x.invert(evt.clientX - rect.left)),
      y: clampFieldCoordinate(y.invert(evt.clientY - rect.top)),
    };
  }

  function buildProjectData(overrides: Record<string, unknown> = {}) {
    return buildProject(
      {
        startPoint,
        lines,
        shapes,
        sequence,
        fieldPoints,
        activePaths: $activePaths,
        settings,
      },
      overrides,
    );
  }

  function getAppState(): AppState {
    return {
      startPoint,
      lines,
      shapes,
      sequence,
      settings,
      fieldPoints,
    };
  }

  function recordChange() {
    history.record(getAppState());
  }

  function undoAction() {
    const prev = history.undo();
    if (prev) {
      startPoint = prev.startPoint;
      lines = prev.lines;
      shapes = prev.shapes;
      sequence = prev.sequence;
      settings = prev.settings;
      fieldPoints = prev.fieldPoints;
      isUnsaved.set(true);
      two?.update();
    }

    // undoAction completes; no file-picker behavior here
  }

  function redoAction() {
    const next = history.redo();
    if (next) {
      startPoint = next.startPoint;
      lines = next.lines;
      shapes = next.shapes;
      sequence = next.sequence;
      settings = next.settings;
      fieldPoints = next.fieldPoints;
      isUnsaved.set(true);
      two?.update();
    }
  }

  // Animation controller
  let loopAnimation = $state(true);
  let animationController =
    $state<ReturnType<typeof createAnimationController>>()!;

  async function loadAdditionalPaths(paths: string[]) {
    const newAdditionalPaths: AdditionalPathData[] = [];

    // Multi-path mode is isolated - turn off old dual path mode
    if (paths.length > 0) {
      dualPathMode.set(false);
      secondStartPoint = null;
      secondLines = [];
      secondShapes = [];
      secondSequence = [];
      secondFilePath.set(null);
    }

    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A"]; // Red, Teal, Blue, Salmon

    for (let i = 0; i < Math.min(paths.length, 4); i++) {
      const filePath = paths[i];
      try {
        const content = await browserFileStore.readFile(filePath);
        const data = JSON.parse(content);

        if (data.startPoint && data.lines) {
          const doc = hydrateProjectDoc(data);
          newAdditionalPaths.push({
            filePath,
            startPoint: doc.startPoint,
            lines: doc.lines,
            shapes: doc.shapes,
            sequence: doc.sequence,
            settings: doc.settings || { ...DEFAULT_SETTINGS },
            color: colors[i],
          });
        }
      } catch (error) {
        console.error(`Failed to load additional path ${filePath}:`, error);
      }
    }

    additionalPaths = newAdditionalPaths;
  }

  function buildSessionSnapshot(): SessionSnapshot {
    return {
      startPoint,
      lines,
      sequence,
      shapes,
      settings,
      currentFilePath: $currentFilePath,
      secondFilePath: $secondFilePath,
      secondStartPoint,
      secondLines,
      secondSequence,
      secondShapes,
      activePaths: $activePaths,
      timestamp: new Date().toISOString(),
    };
  }

  function restoreSessionSnapshot(): boolean {
    const snapshot = loadSessionSnapshot();
    if (!snapshot) return false;

    startPoint = snapshot.startPoint;
    lines = snapshot.lines;
    sequence = snapshot.sequence;
    shapes = snapshot.shapes;
    settings = snapshot.settings;

    currentFilePath.set(snapshot.currentFilePath);
    secondFilePath.set(snapshot.secondFilePath);

    secondStartPoint = snapshot.secondStartPoint;
    secondLines = snapshot.secondLines;
    secondSequence = snapshot.secondSequence;
    secondShapes = snapshot.secondShapes;

    activePaths.set(snapshot.activePaths);
    isUnsaved.set(true);

    return true;
  }

  let secondRobotXY: BasePoint = $state({ x: 0, y: 0 });
  let secondRobotHeading: number = $state(0);
  const GHOST_COLOR = "#a78bfa"; // Light purple/lavender
  const SECOND_PATH_COLOR = "#fca5a5"; // Light red/pink for the second robot

  let isLoaded = $state(false);

  // Allow the app to stabilize before tracking changes
  onMount(() => {
    if (isMobileBlocked) return;

    setTimeout(() => {
      isLoaded = true;
      recordChange();
    }, 500);
  });
  onMount(async () => {
    if (isMobileBlocked) return;

    // Load saved settings
    const savedSettings = await loadSettings();
    settings = normalizeLegacyFieldMap({ ...savedSettings });

    const restored = restoreSessionSnapshot();
    if (restored) {
      console.info("Recovered previous unsaved session.");
    }

    // robotWidth/robotHeight derive from settings, so loading settings is enough.
    // Apply the saved panel widths, then clamp them to the current viewport.
    // This is the only place saved widths are restored — the reactive clamp
    // above deliberately never grows a panel back on its own.
    leftPanelWidth = Number(
      settings?.leftPanelWidth ?? DEFAULT_SETTINGS.leftPanelWidth ?? 370,
    );
    rightPanelWidth = Number(
      settings?.rightPanelWidth ?? DEFAULT_SETTINGS.rightPanelWidth ?? 620,
    );
    clampAllPanels();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", clampAllPanels);
    }
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", clampAllPanels);
    }
  });
  // Debounced save function
  const debouncedSaveSettings = debounce(async (settingsToSave: Settings) => {
    await saveSettings(settingsToSave);
  }, 1000);
  // Save after 1 second of inactivity

  function clampAllPanels() {
    if (typeof window === "undefined") return;
    const availableWidth = Math.max(0, window.innerWidth - 24);
    const rightPanelMinWidth = getRightPanelMinWidth(settings);
    const otherForLeft = rightPanelHidden
      ? 0
      : Math.max(rightPanelWidth, rightPanelMinWidth);
    leftPanelWidth = clampPanelWidth(
      "left",
      leftPanelWidth,
      availableWidth,
      otherForLeft,
      settings,
    );
    const leftPanelMinWidth = getLeftPanelMinWidth(settings);
    const otherForRight = leftPanelHidden
      ? 0
      : Math.max(leftPanelWidth, leftPanelMinWidth);
    rightPanelWidth = clampPanelWidth(
      "right",
      rightPanelWidth,
      availableWidth,
      otherForRight,
      settings,
    );
    settings.leftPanelWidth = leftPanelWidth;
    settings.rightPanelWidth = rightPanelWidth;
  }

  const debouncedSaveSession = debounce(saveSessionSnapshot, 750);

  onDestroy(() => {
    debouncedSaveSession.cancel();
    debouncedSaveSettings.cancel();
    endPanelResize();
  });

  // Initialize animation controller
  onMount(() => {
    if (isMobileBlocked) return;

    animationController = createAnimationController(
      animationDuration,
      (newPercent) => {
        percent = newPercent;
      },
      () => {
        // Animation completed callback
        console.log("Animation completed");
        playing = false;
      },
    );
  });

  // Save Function
  // Save the current project into the browser-backed store (or download)
  async function saveProject() {
    try {
      await saveFile();
    } catch (e) {
      console.error("Failed to save project:", e);
      alert("Failed to save file.");
    }
  }

  // Save an additional path back to its file
  async function saveAdditionalPath(pathIdx: number) {
    const pathData = additionalPaths[pathIdx];
    if (!pathData || !pathData.filePath) return;

    try {
      const fileData = JSON.stringify(
        buildProjectData({
          startPoint: pathData.startPoint,
          lines: pathData.lines,
          shapes: pathData.shapes,
          sequence: pathData.sequence,
          settings: pathData.settings,
        }),
      );

      await browserFileStore.writeFile(pathData.filePath, fileData);
      console.log(`Auto-saved additional path: ${pathData.filePath}`);
    } catch (error) {
      console.error(
        `Failed to save additional path ${pathData.filePath}:`,
        error,
      );
      throw error;
    }
  }

  async function saveAllAdditionalPaths() {
    if ($activePaths.length === 0) return;

    for (let pathIdx = 0; pathIdx < additionalPaths.length; pathIdx += 1) {
      await saveAdditionalPath(pathIdx);
    }
  }

  // Keyboard shortcut for save
  onMount(() => {
    hotkeys("cmd+s, ctrl+s", function (event) {
      event.preventDefault();
      if ($activePaths.length > 0) {
        // Multiple paths mode - save all modified paths
        showDualPathSaveDialog = true;
      } else if ($dualPathMode && secondStartPoint && secondLines.length > 0) {
        showDualPathSaveDialog = true;
      } else {
        showSaveDialog = true;
      }
    });

    return () => hotkeys.unbind("cmd+s, ctrl+s");
  });

  // Export path animation as GIF
  async function exportPathAsGif() {
    if (!twoElement || !two) {
      alert("Canvas not ready. Please try again.");
      return;
    }

    // Two.js can render as canvas or SVG; exporter supports both.
    const rendererElement = two.renderer.domElement;
    if (!rendererElement) {
      alert("Unable to access renderer for export.");
      return;
    }

    // Check if we have paths to export
    const hasActivePaths = $activePaths.length > 0;
    const hasDualPath =
      $dualPathMode && secondStartPoint && secondLines.length > 0;
    const hasSinglePath = lines.length > 0;

    if (!hasActivePaths && !hasDualPath && !hasSinglePath) {
      alert("No paths to export. Please create a path first.");
      return;
    }

    try {
      exportingGif = true;
      cancelGifExport = false;
      gifExportProgress = 0;
      gifExportStatus = "Calculating animation duration...";

      const scale = GIF_EXPORT_SCALE;
      const loadImage = createImageLoader();

      const fieldImage = await loadImage(fieldMapSrc).catch(async () => {
        return loadImage("/fields/decode.webp");
      });
      const robotImage = await loadImage(
        settings.robotImage || "/robot.png",
      ).catch(async () => {
        return loadImage("/robot.png");
      });

      const drawRobot = createRobotDrawer(
        robotImage,
        x(robotWidth),
        x(robotHeight),
        scale,
      );

      const totalDuration = computeGifDuration({
        hasActivePaths,
        hasDualPath: Boolean(hasDualPath),
        additionalPaths,
        startPoint,
        lines,
        sequence,
        settings,
        secondStartPoint,
        secondLines,
        secondSequence,
      });

      if (totalDuration <= 0) {
        alert("Path duration is too short to export.");
        exportingGif = false;
        return;
      }

      gifExportStatus = "Preparing animation...";

      // Stop any playing animation and reset to start
      const wasPlaying = playing;
      pause();
      percent = 0;
      animationController.reset();
      two.update(); // Make sure Two.js renders the initial state
      await tick(); // Allow UI to update

      gifExportStatus = "Capturing frames...";

      // Export as GIF with manual frame control.
      //
      // Instead of snapshotting the live Two.js SVG into an <img> every frame
      // (async, slow, and prone to capturing a partially-rendered/blank scene
      // that flashes), we pre-render the static content — the field background
      // plus every visible path line — onto a single offscreen canvas once,
      // then blit it each frame and paint the moving robot on top. Paths are
      // therefore always present and stable, and the export runs much faster.
      const durationMs = totalDuration * 1000;

      // Output dimensions, matched to what the encoder will use.
      const sourceWidth =
        rendererElement instanceof HTMLCanvasElement
          ? rendererElement.width
          : rendererElement.clientWidth ||
            rendererElement.viewBox?.baseVal?.width;
      const sourceHeight =
        rendererElement instanceof HTMLCanvasElement
          ? rendererElement.height
          : rendererElement.clientHeight ||
            rendererElement.viewBox?.baseVal?.height;
      const outWidth = Math.max(1, Math.floor(sourceWidth * scale));
      const outHeight = Math.max(1, Math.floor(sourceHeight * scale));

      // Pre-render the static layer once (field + all path lines).
      const baseLayerCanvas = document.createElement("canvas");
      baseLayerCanvas.width = outWidth;
      baseLayerCanvas.height = outHeight;
      const baseCtx = baseLayerCanvas.getContext("2d");
      if (!baseCtx) {
        throw new Error("Failed to get canvas context");
      }
      baseCtx.drawImage(fieldImage, 0, 0, outWidth, outHeight);

      const toX = (inch: number) => x(inch) * scale;
      const toY = (inch: number) => y(inch) * scale;
      const pathLineWidth = pathLayerLineWidth(toX);

      if ($activePaths.length === 0) {
        // Main path is visible (single or dual-path mode).
        drawPathLayer(baseCtx, {
          startPoint,
          paths: lines,
          toX,
          toY,
          lineWidth: pathLineWidth,
          opacity: settings.pathOpacity ?? 1,
        });

        if ($dualPathMode && secondStartPoint && secondLines.length > 0) {
          drawPathLayer(baseCtx, {
            startPoint: secondStartPoint,
            paths: secondLines,
            toX,
            toY,
            lineWidth: pathLineWidth,
            color: SECOND_PATH_COLOR,
            opacity: settings.pathOpacity ?? 1,
          });
        }
      } else {
        // Multi-path mode: draw only the additional paths.
        additionalPaths.forEach((pathData) => {
          if (!pathData.startPoint || pathData.lines.length === 0) return;
          drawPathLayer(baseCtx, {
            startPoint: pathData.startPoint,
            paths: pathData.lines,
            toX,
            toY,
            lineWidth: pathLineWidth,
            color: pathData.color,
            honorLocked: false,
            opacity: pathData.settings.pathOpacity ?? settings.pathOpacity ?? 1,
          });
        });
      }

      const blob = await exportAsGif({
        source: rendererElement as HTMLCanvasElement | SVGSVGElement,
        width: outWidth,
        height: outHeight,
        duration: durationMs,
        fps: GIF_EXPORT_FPS,
        quality: GIF_EXPORT_QUALITY,
        scale,
        shouldCancel: () => cancelGifExport,
        onDrawFrame: (ctx) => {
          // Static field + paths layer, already rendered and cached.
          ctx.drawImage(baseLayerCanvas, 0, 0, outWidth, outHeight);

          // Foreground robots.
          if ($activePaths.length === 0) {
            drawRobot(ctx, robotXY, robotHeading, 1);
            if ($dualPathMode && secondStartPoint && secondLines.length > 0) {
              drawRobot(ctx, secondRobotXY, secondRobotHeading, 0.8);
            }
            return;
          }

          additionalRobotStates.forEach((robotState, idx) => {
            const opacity = Math.max(0.2, 1 - idx * 0.15);
            drawRobot(ctx, robotState.xy, robotState.heading, opacity);
          });
        },
        onProgress: (progress) => {
          gifExportProgress = progress;
          gifExportStatus = formatGifProgressStatus(progress);
        },
        onFrameAdvance: async (frameIndex, totalFrames) => {
          // Calculate the percentage for this frame
          const framePercent =
            totalFrames > 1 ? (frameIndex / (totalFrames - 1)) * 100 : 0;

          // Update the animation to this frame
          percent = framePercent;
          animationController.seekToPercent(framePercent);

          // Allow reactivity (robot positions) to settle before painting.
          await tick();
        },
      });

      // Reset animation
      percent = 0;
      animationController.reset();

      // Resume playing if it was playing before
      if (wasPlaying) {
        play();
      }

      gifExportStatus = "Saving file...";

      // Download the GIF
      const fileName = resolveGifFileName(
        $currentFilePath,
        hasActivePaths,
        Boolean(hasDualPath),
      );

      downloadBlob(blob, `${fileName}.gif`);

      exportingGif = false;
      gifExportProgress = 0;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("GIF export error:", errorMsg);

      // Don't show alert if user cancelled
      if (!errorMsg.includes("cancelled")) {
        alert("Failed to export GIF: " + errorMsg);
      }

      cancelGifExport = false;
      exportingGif = false;
      gifExportProgress = 0;
      pause();
    }
  }
  const robotPerf = createPerfSampler("robot-state");

  // Precompute per-additional-path time predictions and their animation
  // scaling ONCE per edit (keyed by the additionalPaths array reference)
  // instead of rebuilding the full path timeline on every animation frame.
  type AdditionalPathEntry = {
    prediction: ReturnType<typeof calculateVisualizationPathTime>;
    completionPercent: number;
  };
  let additionalPathCache = $state(
    new Map<AdditionalPathData, AdditionalPathEntry | null>(),
  );
  let additionalPathCacheKey: AdditionalPathData[] | null = $state(null);

  // Calculate robot states for all additional paths (cheap: uses the cached
  // per-path predictions above, only evaluating positions for the current %).

  // Event markers removed: no runtime visualization created

  /**
   * Render the Two.js scene at most once per animation frame.
   *
   * Previously this reactive immediately cleared and rebuilt the entire scene
   * on every reactive change. During a drag, mousemove fires several times per
   * frame, so the scene (all paths, points, shapes, onion layers) was rebuilt
   * and re-rendered synchronously each event — a major source of jank. Coalescing
   * the clear/re-add/update into a single requestAnimationFrame keeps the scene
   * fully up to date while doing the heavy SVG work only once per frame.
   */
  let sceneRenderScheduled = false;
  const sceneRenderPerf = createPerfSampler("scene-render");
  function flushScene() {
    sceneRenderScheduled = false;
    if (!two) {
      return;
    }
    const t0 = performance.now();
    sampleNodeCounts("scene", twoElement);

    two.renderer.domElement.style["z-index"] = "30";
    two.renderer.domElement.style["position"] = "absolute";
    two.renderer.domElement.style["top"] = "0px";
    two.renderer.domElement.style["left"] = "0px";
    two.renderer.domElement.style["width"] = "100%";
    two.renderer.domElement.style["height"] = "100%";

    two.clear();

    two.add(...shapeElements);
    if (ghostPathElement) {
      two.add(ghostPathElement);
    }
    if (secondGhostPathElement) {
      two.add(secondGhostPathElement);
    }
    if (additionalGhostPathElements.length > 0) {
      two.add(...additionalGhostPathElements);
    }
    if (onionLayerElements.length > 0) {
      two.add(...onionLayerElements);
    }
    if (secondOnionLayerElements.length > 0) {
      two.add(...secondOnionLayerElements);
    }
    if (penGhostPath.length > 0) {
      two.add(...penGhostPath);
    }
    two.add(...path);
    if ($dualPathMode && secondPath.length > 0) {
      two.add(...secondPath);
    }
    // Add all additional paths
    if ($activePaths.length > 0) {
      additionalPathElements.forEach((pathElements) => {
        if (pathElements.length > 0) {
          two.add(...pathElements);
        }
      });
    }
    two.add(...points);

    two.update();
    sceneRenderPerf.sample(t0);
  }
  function scheduleSceneRender() {
    if (sceneRenderScheduled) {
      return;
    }
    sceneRenderScheduled = true;
    requestAnimationFrame(flushScene);
  }
  /**
   * Coalesce the reactive "commit" of a drag into a single per-frame step.
   *
   * Dragging fires several mousemove events per animation frame. Reassigning
   * reactive arrays (lines, secondLines, additionalPaths, shapes) inside the
   * handler triggers a full reactive cascade — path-time recompute, scene
   * rebuild, etc. — for *every* event. We mutate the model immediately (so the
   * data is always current) but only reassign the arrays once per frame, which
   * bounds the heavy work to at most one pass per frame instead of several.
   */
  let dragCommitScheduled = false;
  let pendingDragCommit: (() => void) | null = null;
  const dragCommitPerf = createPerfSampler("drag-commit");
  // Save additional paths a short while after the last drag event, instead of
  // writing the file on every mousemove (which is heavy: JSON.stringify + write).
  const debouncedSaveAdditionalPath = debounce((pathIdx: number) => {
    saveAdditionalPath(pathIdx).catch((err) =>
      console.error("Failed to auto-save additional path:", err),
    );
  }, 400);
  function scheduleDragCommit(commit: () => void) {
    pendingDragCommit = commit;
    if (dragCommitScheduled) {
      return;
    }
    dragCommitScheduled = true;
    requestAnimationFrame(() => {
      dragCommitScheduled = false;
      const fn = pendingDragCommit;
      pendingDragCommit = null;
      if (fn) {
        const t0 = performance.now();
        fn();
        dragCommitPerf.sample(t0);
      }
    });
  }

  async function saveFileAs() {
    const win: any = window as any;
    await saveAllAdditionalPaths();
    const content = JSON.stringify(buildProjectData(), null, 2);

    // Prefer File System Access API if available: opens native Save dialog
    if (win.showSaveFilePicker) {
      try {
        const opts = {
          suggestedName: basename($currentFilePath) || "path.pp",
          types: [
            {
              description: "Path files",
              accept: { "application/json": [".pp", ".json"] },
            },
          ],
        };

        const handle = await win.showSaveFilePicker(opts);
        if (!handle) {
          // User cancelled
          return;
        }

        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();

        // Update app state to reflect saved file
        try {
          currentFilePath.set(
            handle.name || (typeof handle === "string" ? handle : null),
          );
        } catch (e) {
          // ignore
        }
        isUnsaved.set(false);
        alert(`Saved to: ${handle.name || "selected file"}`);
        return;
      } catch (err) {
        console.error("SaveFilePicker error:", err);
        // fall through to download fallback
      }
    }

    // If showSaveFilePicker is not available or failed, try showOpenFilePicker to let user pick an existing file to overwrite
    if (win.showOpenFilePicker) {
      try {
        const [handle] = await win.showOpenFilePicker({
          types: [
            {
              description: "Path files",
              accept: { "application/json": [".pp", ".json"] },
            },
          ],
          multiple: false,
        });

        if (handle) {
          const writable = await handle.createWritable();
          await writable.write(content);
          await writable.close();
          try {
            currentFilePath.set(handle.name || null);
          } catch {
            // Name is cosmetic; the write already succeeded.
          }
          isUnsaved.set(false);
          alert(`Saved to local file: ${handle.name || "selected file"}`);
          return;
        }
      } catch (err) {
        console.error("showOpenFilePicker error:", err);
        // fall through to download fallback
      }
    }

    // Fallback for browsers without File System Access (e.g., Firefox).
    // Automatically save into the app's browser-backed storage to avoid forcing a download.
    try {
      await saveFile();
      alert(
        "Your browser does not support native file dialogs. The project was saved to the app's storage.\n\nOpen the File Manager to download or export the file to your computer.",
      );
    } catch (err) {
      console.error("Failed to save into app storage:", err);
      // As a last resort, download the file
      try {
        downloadTrajectory(startPoint, lines, shapes, sequence, $activePaths);
      } catch (err2) {
        console.error("Save As fallback failed:", err2);
        alert(
          "Failed to save file. Your browser may not support file picker APIs.",
        );
      }
    }
  }

  function play() {
    animationController.play();
    playing = true;
  }

  function pause() {
    animationController.pause();
    playing = false;
  }

  // Handle slider changes
  function handleSeek(newPercent: number) {
    if (animationController) {
      animationController.seekToPercent(newPercent);
    }
  }

  onMount(() => {
    two = new Two({
      fitted: true,
      type: Two.Types.svg,
    }).appendTo(twoElement);

    updateRobotImageDisplay();

    let currentElem: string | null = null;
    let isDown = false;
    let dragOffset = { x: 0, y: 0 }; // Store offset to prevent snapping to center
    const isLockedPathElem = (id: string | null): boolean => {
      const ref = pointRegistry.resolve(id);
      // A path's start point is not lockable through this guard.
      if (!ref || ref.lineId === null) return false;
      return ref.locked;
    };

    const getPreferredPointElemId = (
      clientX: number,
      clientY: number,
    ): string | null => {
      const elements = Array.from(document.elementsFromPoint(clientX, clientY));
      const hits = elements
        .map((element) => (element as HTMLElement).id || "")
        .filter((id) => pointRegistry.resolve(id)?.container === "main");

      if (hits.length === 0) return null;

      // Prefer a point on the segment already selected, so overlapping points
      // do not steal the drag.
      const preferred = hits.find(
        (id) => pointRegistry.resolve(id)?.lineId === selectedLineId,
      );
      return preferred || hits[0];
    };

    two.renderer.domElement.addEventListener("mousemove", (evt: MouseEvent) => {
      const elem = document.elementFromPoint(evt.clientX, evt.clientY);
      const preferredPointElemId = getPreferredPointElemId(
        evt.clientX,
        evt.clientY,
      );

      if (penToolEnabled) {
        two.renderer.domElement.style.cursor = "crosshair";

        if (penIsDrawing) {
          const mousePoint = getMouseFieldPoint(evt);
          if (!mousePoint) return;

          const lastPoint = penStroke[penStroke.length - 1];
          if (
            !lastPoint ||
            distanceBetweenPoints(lastPoint, mousePoint) >= 0.35
          ) {
            penStroke = [...penStroke, mousePoint];
          }
        }

        return;
      }

      if (isDown && currentElem) {
        const hit = pointRegistry.resolve(currentElem);
        const isPathPoint = hit?.container === "main";
        const isShapePoint = hit?.container === "shapes";

        // Skip dragging locked paths
        if (isPathPoint) {
          if (hit && hit.lineId !== null && hit.locked) return;
        }

        // Use simple bounding rect math to match D3 scales which are bound to clientWidth/Height
        const rect = two.renderer.domElement.getBoundingClientRect();
        const xPos = evt.clientX - rect.left;
        const yPos = evt.clientY - rect.top;

        // Apply drag offset (in inches) to the raw mouse position
        const { x: inchX, y: inchY } = snapPointToGrid(
          x.invert(xPos) + dragOffset.x,
          y.invert(yPos) + dragOffset.y,
          gridSnapOptions(),
        );

        const ref = pointRegistry.resolve(currentElem);
        if (!ref || ref.locked) return;

        ref.point.x = inchX;
        ref.point.y = inchY;

        // Coalesce the reactive commit to once per frame so points live-track
        // the mouse while the (heavy) scene recompute happens once per frame
        // instead of on every mousemove.
        if (ref.container === "shapes") {
          scheduleDragCommit(() => {
            shapes = [...shapes];
          });
        } else if (ref.container === "second") {
          scheduleDragCommit(() => {
            secondLines = [...secondLines];
          });
        } else if (ref.container === "additional") {
          scheduleDragCommit(() => {
            additionalPaths = [...additionalPaths];
          });
          // Debounce the auto-save so it fires after the drag settles instead of
          // writing the file on every mousemove.
          debouncedSaveAdditionalPath(Number(ref.scope));
        } else {
          scheduleDragCommit(() => {
            lines = [...lines];
          });
        }
      } else {
        const hovered = preferredPointElemId || elem?.id || null;
        const hoveredRef = pointRegistry.resolve(hovered);
        if (
          (hoveredRef?.container === "main" && !isLockedPathElem(hovered)) ||
          pointRegistry.segmentAt(elem?.id) !== null ||
          hoveredRef?.container === "second" ||
          hoveredRef?.container === "additional" ||
          (settings?.experimentalFeatures?.obstacles &&
            hoveredRef?.container === "shapes")
        ) {
          two.renderer.domElement.style.cursor = "pointer";
          currentElem = preferredPointElemId || elem?.id || null;
        } else {
          two.renderer.domElement.style.cursor = "auto";
          currentElem = null;
        }
      }
    });

    two.renderer.domElement.addEventListener("mousedown", (evt: MouseEvent) => {
      if (penToolEnabled) {
        const mousePoint = getMouseFieldPoint(evt);
        if (!mousePoint) return;

        penStroke = [mousePoint];
        penIsDrawing = true;
        currentElem = null;
        isDown = false;
        return;
      }

      const preferredPointElemId = getPreferredPointElemId(
        evt.clientX,
        evt.clientY,
      );
      if (preferredPointElemId) {
        currentElem = preferredPointElemId;
      }

      if (currentElem && isLockedPathElem(currentElem)) {
        isDown = false;
        return;
      }

      const mousePoint = getMouseFieldPoint(evt);
      if (mousePoint && selectedLine && selectedPoint) {
        const selectedPointX = x(selectedPoint.x);
        const selectedPointY = y(selectedPoint.y);
        const selectedPointRadius = x(POINT_RADIUS) * 1.45;
        const dx =
          evt.clientX -
          (two.renderer.domElement.getBoundingClientRect().left +
            selectedPointX);
        const dy =
          evt.clientY -
          (two.renderer.domElement.getBoundingClientRect().top +
            selectedPointY);
        if (Math.hypot(dx, dy) <= selectedPointRadius) {
          currentElem = pointRegistry.elementIdFor(
            pointKey("main", "point", selectedLineId, selectedPointIndex),
          );
        }
      }

      // Clicking a main-path stroke selects that segment.
      const hitSegment = pointRegistry.segmentAt(currentElem);
      if (hitSegment) {
        if (hitSegment.container === "main") {
          selectLinePoint(hitSegment.lineId, 0);
        }
        isDown = false;
        return;
      }

      const hitPoint = pointRegistry.resolve(currentElem);
      if (hitPoint?.container === "main" && hitPoint.lineId !== null) {
        selectLinePoint(hitPoint.lineId, hitPoint.pointIndex);
      }

      isDown = true;

      if (currentElem) {
        const rect = two.renderer.domElement.getBoundingClientRect();
        const mouseX = x.invert(evt.clientX - rect.left);
        const mouseY = y.invert(evt.clientY - rect.top);

        const ref = pointRegistry.resolve(currentElem);

        dragOffset = {
          x: (ref?.point.x ?? 0) - mouseX,
          y: (ref?.point.y ?? 0) - mouseY,
        };
      }
    });

    two.renderer.domElement.addEventListener("mouseup", () => {
      if (penToolEnabled) {
        if (penIsDrawing) {
          commitPenStroke();
        }
        two.renderer.domElement.style.cursor = "crosshair";
        isDown = false;
        dragOffset = { x: 0, y: 0 };
        return;
      }

      isDown = false;
      dragOffset = { x: 0, y: 0 };
      recordChange();
    });

    // Double-click on the field to create a new path at that position
    two.renderer.domElement.addEventListener("dblclick", (evt: MouseEvent) => {
      if (penToolEnabled) {
        return;
      }

      // Ignore dblclicks on existing points/lines
      const elem = document.elementFromPoint(evt.clientX, evt.clientY);
      const hitRef = pointRegistry.resolve(elem?.id);
      if (
        (hitRef && hitRef.container !== "shapes") ||
        (settings?.experimentalFeatures?.obstacles &&
          hitRef?.container === "shapes") ||
        pointRegistry.segmentAt(elem?.id) !== null
      ) {
        return;
      }

      const rect = two.renderer.domElement.getBoundingClientRect();
      const snapped = snapPointToGrid(
        x.invert(evt.clientX - rect.left),
        y.invert(evt.clientY - rect.top),
        gridSnapOptions(),
      );

      // Clamp to field boundaries
      const inchX = clampFieldCoordinate(snapped.x);
      const inchY = clampFieldCoordinate(snapped.y);

      // Create a new line with endPoint at the clicked position
      const newLine = createSegment(inchX, inchY);

      lines = [...lines, newLine];
      sequence = [...sequence, { kind: "path", lineId: newLine.id }];
      selectedLineIndex = lines.length - 1;
      recordChange();
      two.update();
    });
  });
  onMount(() => {
    const handleSpaceKey = (evt: KeyboardEvent) => {
      if (evt.code === "Space" && document.activeElement === document.body) {
        if (playing) {
          pause();
        } else {
          play();
        }
      }
    };
    document.addEventListener("keydown", handleSpaceKey);
    return () => document.removeEventListener("keydown", handleSpaceKey);
  });
  async function saveFile() {
    try {
      await saveAllAdditionalPaths();
      const content = JSON.stringify(buildProjectData(), null, 2);

      if ($currentFilePath) {
        await browserFileStore.writeFile($currentFilePath, content);
        isUnsaved.set(false);
        // Provide simple feedback
        alert(`Saved to project storage: ${$currentFilePath}`);
      } else {
        // No current project file selected — save into browser cache as a new file
        const defaultName = `path_${Date.now()}.pp`;
        await browserFileStore.writeFile(defaultName, content);
        currentFilePath.set(defaultName);
        isUnsaved.set(false);
        alert(`Saved to project storage as: ${defaultName}`);
      }
    } catch (err) {
      console.error("Failed to save project to storage:", err);
      alert("Failed to save project to browser storage.");
    }
  }

  async function renameCurrentFile() {
    if (!$currentFilePath) return;

    const currentPath = $currentFilePath;
    const requestedName = window.prompt(
      "Rename path file",
      pathStem(currentPath),
    );
    if (requestedName === null) return;

    const trimmedName = requestedName.trim();
    if (!trimmedName) return;

    const newFileName = trimmedName.endsWith(".pp")
      ? trimmedName
      : `${trimmedName}.pp`;
    if (!/^[a-zA-Z0-9_\-. ]+\.pp$/.test(newFileName)) {
      alert(
        "Invalid file name. Use only letters, numbers, underscores, dashes, and spaces.",
      );
      return;
    }
    if (newFileName === currentPath) return;

    try {
      if (await browserFileStore.fileExists(newFileName)) {
        alert(`A file named "${newFileName}" already exists.`);
        return;
      }

      const content = JSON.stringify(buildProjectData(), null, 2);
      await browserFileStore.writeFile(newFileName, content);
      await browserFileStore.deleteFile(currentPath);
      currentFilePath.set(newFileName);
      isUnsaved.set(false);
      window.dispatchEvent(
        new CustomEvent("fileRenamed", {
          detail: { oldPath: currentPath, newPath: newFileName },
        }),
      );
      showToast(`Renamed to: ${newFileName}`, "success");
    } catch (error) {
      console.error("Failed to rename path file:", error);
      alert("Failed to rename the path file.");
    }
  }

  async function loadFile(evt: Event) {
    const elem = evt.target as HTMLInputElement;
    const file = elem.files?.[0];

    if (!file) return;

    const lowerName = file.name.toLowerCase();
    // Check if file is a .pp or .json file
    if (!lowerName.endsWith(".pp") && !lowerName.endsWith(".json")) {
      alert("Please select a .pp or .json file");
      // Reset the file input
      elem.value = "";
      return;
    }

    // Parse and load the uploaded file, then cache it into the browser store.
    loadTrajectoryFromFile(evt, async (data) => {
      const versionWarning = newerVersionWarning(data.version);
      if (versionWarning) showToast(versionWarning, "warning");

      const doc = hydrateProjectDoc(data);
      startPoint = doc.startPoint;
      lines = doc.lines;
      sequence = doc.sequence;
      shapes = doc.shapes;
      fieldPoints = doc.fieldPoints ?? [];
      if (doc.settings) {
        settings = { ...settings, ...doc.settings };
      }

      activePaths.set(doc.activePaths ?? []);

      isUnsaved.set(false);
      recordChange();

      // Cache the uploaded file into the browser-backed store for later access
      try {
        const content = JSON.stringify(data);
        await browserFileStore.writeFile(file.name, content);
        currentFilePath.set(file.name);
      } catch (err) {
        console.warn("Failed to cache uploaded file to store:", err);
      }
    });

    // Reset the file input
    elem.value = "";
  }

  // Electron file-copying logic removed — browser store and upload are used instead.

  // Helper function to load data into app state

  async function optimizeLine(
    lineId: string,
    targetControlPointIndex?: number,
  ) {
    const lineIndex = lines.findIndex((l) => l.id === lineId);
    if (lineIndex === -1) {
      alert("Could not find line to optimize.");
      return;
    }

    if (optimizingLineIds[lineId]) return;
    optimizingLineIds = { ...optimizingLineIds, [lineId]: true };

    try {
      const payload = buildOptimizationPayload(
        lineId,
        startPoint,
        lines,
        shapes,
        settings,
      );
      const result = await runOptimization(payload);
      const newLines = applyOptimizedWaypoints(
        lines,
        lineId,
        result,
        targetControlPointIndex,
      );

      if (newLines) {
        lines = normalizePaths(newLines);
        recordChange();
      }
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Optimization failed.");
    } finally {
      optimizingLineIds = { ...optimizingLineIds, [lineId]: false };
    }
  }

  async function optimizeAllLines() {
    if (optimizingAll) return;
    optimizingAll = true;
    try {
      for (const ln of lines) {
        if (!ln?.id) continue;
        await optimizeLine(ln.id);
      }
    } finally {
      optimizingAll = false;
    }
  }

  function addNewLine() {
    const newLine = createSegment(_.random(36, 108), _.random(36, 108), {
      reverse: true,
    });
    const newLineId = newLine.id;
    lines = [...lines, newLine];
    sequence = [...sequence, { kind: "path", lineId: newLineId }];
    selectedPathIds = [newLineId];
    selectedPointIndex = 0;
    recordChange();
  }

  /** The drivable curve edits apply to: the selection, else the last one. */
  function targetSegment() {
    const leaves = atomicSegments(lines);
    return findSegmentById(lines, selectedLineId) || leaves[leaves.length - 1];
  }

  function addControlPoint() {
    if (lines.length > 0) {
      const targetLine = targetSegment();
      if (!targetLine) return;
      targetLine.controlPoints.push({
        x: _.random(36, 108),
        y: _.random(36, 108),
      });
      lines = [...lines];
      selectedPointIndex = targetLine.controlPoints.length;
      recordChange();
      two?.update();
    }
  }

  function removeControlPoint() {
    if (lines.length > 0) {
      const targetLine = targetSegment();
      if (targetLine && targetLine.controlPoints.length > 0) {
        targetLine.controlPoints.pop();
        lines = [...lines];
        selectedPointIndex = Math.min(
          selectedPointIndex,
          targetLine.controlPoints.length,
        );
        recordChange();
        two?.update();
      }
    }
  }

  /**
   * Insert a path between the selected point and the point immediately before
   * it. The new segment ends at the midpoint of that pair and is spliced in
   * ahead of the selection, so the existing path now starts from it.
   */
  function createPathBetweenSelectedPoints() {
    const selected = findSegmentById(lines, selectedLineId);
    if (!selected?.id) return;

    const selectedSeqIndex = sequence.findIndex(
      (item) => item.kind === "path" && item.lineId === selected.id,
    );

    // The point before the selection: the previous segment's endpoint, or the
    // start pose when the selected path is the first one.
    const previousPoint = segmentStartById(startPoint, lines, selected.id);
    if (!previousPoint) return;

    const anchorPoint = selectedPoint || selected.endPoint;
    const midpointX = (Number(previousPoint.x) + Number(anchorPoint.x)) / 2;
    const midpointY = (Number(previousPoint.y) + Number(anchorPoint.y)) / 2;
    const newLine = createSegment(midpointX, midpointY);
    const newLineId = newLine.id;

    // Splice before the selection so the order runs previous -> new -> selected.
    const insertAt =
      selectedLineIndex >= 0 ? selectedLineIndex : lines.length - 1;
    const nextLines = [...lines];
    nextLines.splice(Math.max(0, insertAt), 0, newLine);
    lines = nextLines;

    const nextSequence = [...sequence];
    nextSequence.splice(
      selectedSeqIndex >= 0 ? selectedSeqIndex : nextSequence.length,
      0,
      { kind: "path", lineId: newLineId },
    );
    sequence = nextSequence;

    selectedPathIds = [newLineId];
    selectedPointIndex = 0;
    recordChange();
  }

  function selectLinePoint(lineId: string | null, pointIndex = 0) {
    const line = findSegmentById(lines, lineId);
    if (!line) return;

    selectedPathIds = [line.id];
    const maxPointIndex = Math.max(0, line.controlPoints.length);
    selectedPointIndex = Math.max(0, Math.min(pointIndex, maxPointIndex));
  }

  // Keyboard shortcuts for quick path editing
  onMount(() => {
    hotkeys("w", function (event) {
      event.preventDefault();
      addNewLine();
    });
    hotkeys("a", function (event) {
      event.preventDefault();
      addControlPoint();
      two.update();
    });
    hotkeys("s", function (event) {
      event.preventDefault();
      removeControlPoint();
      two.update();
    });
    hotkeys("cmd+z, ctrl+z", function (event) {
      event.preventDefault();
      undoAction();
    });
    hotkeys("cmd+shift+z, ctrl+shift+z, ctrl+y", function (event) {
      event.preventDefault();
      redoAction();
    });

    return () => {
      hotkeys.unbind("w");
      hotkeys.unbind("a");
      hotkeys.unbind("s");
      hotkeys.unbind("cmd+z, ctrl+z");
      hotkeys.unbind("cmd+shift+z, ctrl+shift+z, ctrl+y");
    };
  });
  // Auto-export for CI/testing: if the app is loaded with URL hash #export-gif-test, automatically run GIF export once mounted
  onMount(() => {
    if (isMobileBlocked) return;

    if (
      typeof window !== "undefined" &&
      window.location &&
      window.location.hash === "#export-gif-test"
    ) {
      // Delay slightly to allow initial rendering and Two.js to initialize
      setTimeout(async () => {
        try {
          // auto GIF export removed (exportGif deleted)
          console.log("Auto GIF export skipped (exportGif removed)");
        } catch (err) {
          console.error("Auto GIF export failed:", err);
        }
      }, 1500);
    }

    // Handle save dialog event
    const handleSaveDialog = async (event: any) => {
      const { fileName } = event.detail;
      isSaving = true;
      try {
        // Create a full file path with .pp extension if not present
        const fullFileName = fileName.endsWith(".pp")
          ? fileName
          : fileName + ".pp";

        // Call the file manager's save function through the browser file store
        const fileData = JSON.stringify(buildProjectData());

        await browserFileStore.writeFile(fullFileName, fileData);
        currentFilePath.set(fullFileName);
        isUnsaved.set(false);

        // Show success feedback
        showSaveDialog = false;
      } catch (error) {
        console.error("Save failed:", error);
        alert(
          "Failed to save file: " +
            (error instanceof Error ? error.message : String(error)),
        );
      } finally {
        isSaving = false;
      }
    };

    window.addEventListener("save", handleSaveDialog);

    // Handle dual path save dialog event
    const handleDualPathSave = async (event: any) => {
      const { target } = event.detail;
      isSaving = true;
      try {
        await saveAllAdditionalPaths();
        if (target === "first" && $currentFilePath) {
          const fileData = JSON.stringify(buildProjectData());
          await browserFileStore.writeFile($currentFilePath, fileData);
          isUnsaved.set(false);
        } else if (target === "second" && $secondFilePath) {
          const fileData = JSON.stringify(
            buildProjectData({
              startPoint: secondStartPoint,
              lines: secondLines,
              shapes: secondShapes,
              sequence: secondSequence,
            }),
          );
          await browserFileStore.writeFile($secondFilePath, fileData);
        } else if (target === "both") {
          // Save first path
          if ($currentFilePath) {
            const fileData1 = JSON.stringify(buildProjectData());
            await browserFileStore.writeFile($currentFilePath, fileData1);
          }
          // Save second path
          if ($secondFilePath) {
            const fileData2 = JSON.stringify(
              buildProjectData({
                startPoint: secondStartPoint,
                lines: secondLines,
                shapes: secondShapes,
                sequence: secondSequence,
              }),
            );
            await browserFileStore.writeFile($secondFilePath, fileData2);
          }
          isUnsaved.set(false);
        }
        showDualPathSaveDialog = false;
      } catch (error) {
        console.error("Dual path save failed:", error);
        alert(
          "Failed to save: " +
            (error instanceof Error ? error.message : String(error)),
        );
      } finally {
        isSaving = false;
      }
    };

    window.addEventListener("saveDualPath", handleDualPathSave);

    return () => {
      window.removeEventListener("save", handleSaveDialog);
      window.removeEventListener("saveDualPath", handleDualPathSave);
    };
  });
  // Robot state
  let robotWidth = $derived(settings?.rWidth || DEFAULT_ROBOT_WIDTH);
  let robotHeight = $derived(settings?.rHeight || DEFAULT_ROBOT_HEIGHT);
  let fieldMapSrc = $derived(
    settings.fieldMap === "custom"
      ? settings.customFieldImage || "/fields/decode.webp"
      : settings.fieldMap
        ? `/fields/${settings.fieldMap}`
        : "/fields/decode.webp",
  );
  let fieldPixelSize = $derived(
    Math.max(
      1,
      Math.floor(
        Math.min(
          fieldStageWidth || FIELD_SIZE,
          fieldStageHeight || FIELD_SIZE,
        ) - 16,
      ),
    ),
  );
  run(() => {
    if (fieldMapSrc !== lastFieldMapSrc) {
      fieldMapLoaded = false;
      lastFieldMapSrc = fieldMapSrc;
    }
  });
  run(() => {
    if ((settings.robotImage || "/robot.png") !== lastRobotImageSrc) {
      robotImageLoaded = false;
      lastRobotImageSrc = settings.robotImage || "/robot.png";
    }
  });
  let initialAssetsReady = $derived(fieldMapLoaded && robotImageLoaded);
  run(() => {
    // Drop selected paths that no longer exist, falling back to the last one.
    const present = selectedPathIds.filter((id) => findPathById(lines, id));
    if (present.length !== selectedPathIds.length) {
      selectedPathIds =
        present.length > 0
          ? present
          : lines.length > 0
            ? [lines[lines.length - 1].id]
            : [];
    }
  });
  let selectedLine = $derived(
    selectedPath?.kind === "atomic" ? selectedPath : null,
  );
  let selectedPoint = $derived.by(() => {
    const line = selectedLine;
    if (!line || selectedPointIndex < 0) return null;
    return selectedPointIndex === 0
      ? line.endPoint
      : line.controlPoints[selectedPointIndex - 1] || null;
  });
  // Keep panels inside the space left over once the centre stage is square.
  // This only ever shrinks a panel that no longer fits; it must not grow one
  // back toward its saved width, or the left panel would reclaim any space
  // freed by dragging the right panel smaller and the right panel could never
  // take it back. Saved widths are applied once on load instead.
  run(() => {
    const availableForPanels =
      getTotalAvailableWidth() - getMinCenterWidthForSquare();
    const rightMinWidth = getRightPanelMinWidth(settings);
    const leftMinWidth = getLeftPanelMinWidth(settings);

    if (!leftPanelHidden) {
      const rightWidth = rightPanelHidden
        ? 0
        : Math.max(rightPanelWidth, rightMinWidth);
      const maxLeft = Math.max(leftMinWidth, availableForPanels - rightWidth);
      const nextLeft = clamp(leftPanelWidth, leftMinWidth, maxLeft);
      if (nextLeft !== leftPanelWidth) leftPanelWidth = nextLeft;
    }

    if (!rightPanelHidden) {
      const leftWidth = leftPanelHidden ? 0 : leftPanelWidth;
      const maxRight = Math.max(rightMinWidth, availableForPanels - leftWidth);
      const nextRight = clamp(rightPanelWidth, rightMinWidth, maxRight);
      if (nextRight !== rightPanelWidth) rightPanelWidth = nextRight;
    }
  });
  // Reactive center width calculation for the field constraint
  let centerWidth = $derived(
    getCenterWidth(
      leftPanelWidth,
      rightPanelWidth,
      leftPanelHidden,
      rightPanelHidden,
    ),
  );
  // Use the stores for reactivity
  let canUndo = $derived($canUndoStore);
  let canRedo = $derived($canRedoStore);
  let timePrediction = $derived(
    calculateVisualizationPathTime(startPoint, lines, settings, sequence),
  );
  let animationDuration = $derived(
    getAnimationDuration(timePrediction.totalTime / 1000),
  );
  // Second path timeline (for dual path mode)
  let secondTimePrediction = $derived(
    $dualPathMode && secondStartPoint && secondLines.length > 0
      ? calculateVisualizationPathTime(
          secondStartPoint,
          secondLines,
          settings,
          secondSequence,
        )
      : null,
  );
  // Calculate max duration across all paths for playbar scaling
  let effectiveAnimationDuration = $derived(
    (() => {
      // In multi-path mode, only use additional paths for duration
      if ($activePaths.length > 0) {
        let maxTime = 0;
        additionalPaths.forEach((pathData) => {
          if (pathData.startPoint && pathData.lines.length > 0) {
            const pathTime = calculateVisualizationPathTime(
              pathData.startPoint,
              pathData.lines,
              pathData.settings,
              pathData.sequence,
            );
            if (pathTime) {
              maxTime = Math.max(maxTime, pathTime.totalTime);
            }
          }
        });
        return maxTime > 0
          ? getAnimationDuration(maxTime / 1000)
          : animationDuration;
      }

      // In normal/dual mode, check main path and second path
      let maxTime = timePrediction.totalTime;

      if ($dualPathMode && secondTimePrediction) {
        maxTime = Math.max(maxTime, secondTimePrediction.totalTime);
      }

      return getAnimationDuration(maxTime / 1000);
    })(),
  );
  let pathPreviewItems = $derived.by(() => {
    let segmentNumber = 0;
    let groupNumber = 0;

    const build = (nodes: Path[]): PathListItem[] =>
      nodes.map((node) => {
        if (node.kind === "compound") {
          groupNumber += 1;
          return {
            id: node.id,
            name: node.name || `Group ${groupNumber}`,
            kind: "compound" as const,
            children: build(node.segments),
          };
        }
        segmentNumber += 1;
        const shown = toDocFrame(node.endPoint, $fieldFrame);
        return {
          id: node.id,
          name: node.name || `Path ${segmentNumber}`,
          kind: "atomic" as const,
          x: formatPathPoint(shown.x),
          y: formatPathPoint(shown.y),
        };
      });

    return build(lines);
  });
  // Load additional paths when activePaths changes
  $effect.pre(() => {
    loadAdditionalPaths($activePaths);
  });
  /**
   * Converter for X axis from inches to pixels.
   */
  let x = $derived(
    d3
      .scaleLinear()
      .domain([0, FIELD_SIZE])
      .range([0, effectiveSize || FIELD_SIZE]),
  );
  /**
   * Converter for Y axis from inches to pixels.
   */
  let y = $derived(
    d3
      .scaleLinear()
      .domain([0, FIELD_SIZE])
      .range([effectiveSize || FIELD_SIZE, 0]),
  );
  let isMultiPathMode = $derived($activePaths.length > 0);
  let scales = $derived({ x, y });
  let pointSelection = $derived({
    lineId: selectedLineId,
    pointIndex: selectedPointIndex,
  });
  // Points and path strokes are built together so they share one registry:
  // the builders record every element they draw, and hit-testing becomes a
  // lookup instead of a parse of the element id.
  let scene = $derived.by(() => {
    const registry = new PointRegistry();
    // Hide main path when in multi-path mode (isolated visualization)
    const pathElements = isMultiPathMode
      ? []
      : buildPathElements(
          { startPoint, lines, idPrefix: "line" },
          scales,
          settings,
          registry,
        );
    const elements = [
      // Only show main path points when NOT in multi-path mode
      ...(isMultiPathMode
        ? []
        : [
            ...buildPathPointMarkers(startPoint, lines, scales, {
              idPrefix: "point",
              selection: pointSelection,
              registry,
              container: "main",
            }),
            ...buildSelectedPointRing(lines, pointSelection, scales),
          ]),
      // Draggable obstacle vertices
      ...(settings?.experimentalFeatures?.obstacles
        ? buildObstacleVertexMarkers(shapes, scales, registry)
        : []),
      // Second path points (dual path mode) - not in multi-path mode
      ...(!isMultiPathMode &&
      $dualPathMode &&
      secondStartPoint &&
      secondLines.length > 0
        ? buildPathPointMarkers(secondStartPoint, secondLines, scales, {
            idPrefix: "second-point",
            registry,
            container: "second",
          })
        : []),
      // All control points for additional paths (full editing support)
      ...(isMultiPathMode
        ? additionalPaths.flatMap((pathData, pathIdx) =>
            !pathData.startPoint || !pathData.lines.length
              ? []
              : buildPathPointMarkers(
                  pathData.startPoint,
                  pathData.lines,
                  scales,
                  {
                    idPrefix: `additional-path-${pathIdx}-point`,
                    color: pathData.color,
                    radiusScale: 0.9,
                    textSize: 1.4,
                    opacity: 0.8,
                    registry,
                    container: "additional",
                    scope: String(pathIdx),
                  },
                ),
          )
        : []),
    ];
    return { registry, pathElements, pointElements: elements };
  });
  let pointRegistry = $derived(scene.registry);
  let points = $derived(scene.pointElements);
  let path = $derived(scene.pathElements);
  // Second path rendering (for dual path mode); not shown in multi-path mode
  let secondPath = $derived(
    isMultiPathMode ||
      !$dualPathMode ||
      !secondStartPoint ||
      secondLines.length === 0
      ? []
      : buildPathElements(
          {
            startPoint: secondStartPoint,
            lines: secondLines,
            idPrefix: "second-line",
          },
          scales,
          settings,
          pointRegistry,
          "second",
        ),
  );
  // Render all additional paths; only slight opacity variation between them
  let additionalPathElements = $derived(
    additionalPaths.map((pathData, pathIdx) =>
      !pathData.startPoint || pathData.lines.length === 0
        ? []
        : buildPathElements(
            {
              startPoint: pathData.startPoint,
              lines: pathData.lines,
              idPrefix: `additional-path-${pathIdx}-line`,
              color: pathData.color,
              opacityScale: 1.0 - pathIdx * 0.1,
              honorLocked: false,
            },
            scales,
            settings,
            pointRegistry,
            "additional",
          ),
    ),
  );
  let penGhostPath: (TwoPath | PathLine)[] = $derived.by(() => {
    if (
      !penToolEnabled ||
      !penIsDrawing ||
      penStroke.length < 2 ||
      isMultiPathMode
    ) {
      return [];
    }

    const anchors = penStroke.map(
      (point, index) =>
        new Two.Anchor(
          x(point.x),
          y(point.y),
          0,
          0,
          0,
          0,
          index === 0 ? Two.Commands.move : Two.Commands.line,
        ),
    );
    anchors.forEach((anchor) => (anchor.relative = false));

    const ghost = new Two.Path(anchors);
    ghost.automatic = false;
    ghost.stroke = "#facc15";
    ghost.fill = "transparent";
    ghost.linewidth = x(LINE_WIDTH * 0.9);
    ghost.opacity = 0.35;
    ghost.dashes = [x(0.6), x(0.6)];
    ghost.id = "pen-ghost-path";

    return [ghost];
  });
  let shapeElements = $derived(
    !(settings?.experimentalFeatures?.obstacles ?? false)
      ? []
      : shapes.flatMap((shape, idx) => {
          if (shape.vertices.length < 3) return [];
          const shapeElement = buildClosedPolygon(shape.vertices, scales);
          shapeElement.id = `shape-${idx}`;
          shapeElement.stroke = shape.color;
          shapeElement.fill = shape.color;
          shapeElement.opacity = 0.4;
          shapeElement.linewidth = x(0.8);
          return [shapeElement];
        }),
  );
  // Don't show ghost paths in multi-path mode
  let ghostPathElement = $derived(
    !isMultiPathMode && settings.showGhostPaths && lines.length > 0
      ? buildGhostPath(
          generateGhostPathPoints(
            startPoint,
            lines,
            settings.rWidth,
            settings.rHeight,
            50,
          ),
          { id: "ghost-path", color: GHOST_COLOR },
          scales,
        )
      : null,
  );
  // Second ghost path for dual path mode
  let secondGhostPathElement = $derived(
    !isMultiPathMode &&
      $dualPathMode &&
      settings.showGhostPaths &&
      secondLines.length > 0 &&
      secondStartPoint
      ? buildGhostPath(
          generateGhostPathPoints(
            secondStartPoint,
            secondLines,
            settings.rWidth,
            settings.rHeight,
            50,
          ),
          { id: "ghost-path-2", color: SECOND_PATH_COLOR },
          scales,
        )
      : null,
  );
  // Ghost paths for additional paths in multi-path mode
  let additionalGhostPathElements = $derived(
    isMultiPathMode && settings.showGhostPaths
      ? additionalPaths.flatMap((pathData, pathIdx) => {
          if (!pathData.startPoint || !pathData.lines.length) return [];
          const ghostPath = buildGhostPath(
            generateGhostPathPoints(
              pathData.startPoint,
              pathData.lines,
              settings.rWidth,
              settings.rHeight,
              50,
            ),
            {
              id: `ghost-path-additional-${pathIdx}`,
              color: pathData.color || GHOST_COLOR,
            },
            scales,
          );
          return ghostPath ? [ghostPath] : [];
        })
      : [],
  );
  // Don't show onion layers in multi-path mode
  let onionLayerElements = $derived(
    !isMultiPathMode && settings.showOnionLayers && lines.length > 0
      ? selectVisibleOnionLayers(
          generateOnionLayers(
            startPoint,
            lines,
            settings.rWidth,
            settings.rHeight,
            settings.onionLayerSpacing || 6,
          ),
          timePrediction,
          percent,
          settings.onionNextPointOnly,
        ).map((layer, idx) =>
          buildOnionLayer(
            layer.corners,
            {
              id: `onion-layer-${idx}`,
              color: settings.onionColor || "#dc2626",
            },
            scales,
          ),
        )
      : [],
  );
  // Second onion layers for dual path mode
  let secondOnionLayerElements = $derived(
    !isMultiPathMode &&
      $dualPathMode &&
      settings.showOnionLayers &&
      secondLines.length > 0 &&
      secondStartPoint
      ? selectVisibleOnionLayers(
          generateOnionLayers(
            secondStartPoint,
            secondLines,
            settings.rWidth,
            settings.rHeight,
            settings.onionLayerSpacing || 6,
          ),
          secondTimePrediction,
          percent,
          settings.onionNextPointOnly,
        ).map((layer, idx) =>
          buildOnionLayer(
            layer.corners,
            { id: `second-onion-layer-${idx}`, color: SECOND_PATH_COLOR },
            scales,
          ),
        )
      : [],
  );
  // Reactively trigger when any saveable data changes
  $effect.pre(() => {
    if (isLoaded && (lines || shapes || startPoint || settings)) {
      isUnsaved.set(true);
    }
  });
  // Watch for settings changes and save
  $effect.pre(() => {
    if (settings) {
      debouncedSaveSettings(settings);
    }
  });
  $effect.pre(() => {
    if (isLoaded) {
      debouncedSaveSession(buildSessionSnapshot());
    }
  });
  $effect.pre(() => {
    if (animationController) {
      animationController.setDuration(effectiveAnimationDuration);
    }
  });
  $effect.pre(() => {
    if (animationController) {
      animationController.setLoop(loopAnimation);
      // Sync UI state with controller
      playing = animationController.isPlaying();
    }
  });
  $effect.pre(() => {
    // This handles both 'travel' (movement) and 'wait' (stationary rotation) events.
    // Don't show main robot in multi-path mode
    if (
      $activePaths.length === 0 &&
      timePrediction &&
      timePrediction.timeline &&
      lines.length > 0
    ) {
      const t0 = performance.now();
      const state = calculateRobotState(
        percent,
        timePrediction.timeline,
        lines,
        startPoint,
        settings,
        x,
        y,
      );
      robotPerf.sample(t0);
      robotXY = { x: state.x, y: state.y };
      robotHeading = state.heading;
      robotT = state.t ?? null;
    } else {
      // Fallback for initialization or empty state
      robotXY = { x: x(startPoint.x), y: y(startPoint.y) };
      robotT = null;
      robotHeading = -startPoint.headingDeg;
    }
  });
  // Second robot state calculation (for dual path mode)
  $effect.pre(() => {
    // Don't show second robot in multi-path mode
    if (
      $activePaths.length === 0 &&
      $dualPathMode &&
      timePrediction &&
      secondTimePrediction &&
      secondTimePrediction.timeline &&
      secondLines.length > 0 &&
      secondStartPoint
    ) {
      // Calculate actual percent for this path based on max duration
      const maxDuration = effectiveAnimationDuration;
      const thisDuration = getAnimationDuration(
        secondTimePrediction.totalTime / 1000,
      );
      const completionPercent = (thisDuration / maxDuration) * 100;

      // If this path should be complete, cap at 100% (robot waits at end)
      const actualPercent = Math.min(percent, completionPercent);
      const normalizedPercent =
        completionPercent > 0 ? (actualPercent / completionPercent) * 100 : 0;

      const state = calculateRobotState(
        normalizedPercent,
        secondTimePrediction.timeline,
        secondLines,
        secondStartPoint,
        settings,
        x,
        y,
      );
      secondRobotXY = { x: state.x, y: state.y };
      secondRobotHeading = state.heading;
    } else {
      // Fallback or not in dual mode
      secondRobotXY = { x: 0, y: 0 };
      secondRobotHeading = 0;
    }
  });
  run(() => {
    if (additionalPathCacheKey !== additionalPaths) {
      additionalPathCacheKey = additionalPaths;
      // Built fresh and assigned wholesale below, so reactivity comes from the
      // assignment — a SvelteMap would only add proxy overhead.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const cache = new Map<AdditionalPathData, AdditionalPathEntry | null>();
      additionalPaths.forEach((pathData) => {
        if (!pathData.startPoint) {
          cache.set(pathData, null);
          return;
        }
        const prediction = calculateVisualizationPathTime(
          pathData.startPoint,
          pathData.lines,
          pathData.settings,
          pathData.sequence,
        );
        if (
          !prediction ||
          !prediction.timeline ||
          pathData.lines.length === 0
        ) {
          cache.set(pathData, null);
          return;
        }
        const maxDuration = effectiveAnimationDuration;
        const thisDuration = getAnimationDuration(prediction.totalTime / 1000);
        const completionPercent =
          maxDuration > 0 ? (thisDuration / maxDuration) * 100 : 100;
        cache.set(pathData, { prediction, completionPercent });
      });
      additionalPathCache = cache;
    }
  });
  let additionalRobotStates: Array<{ xy: BasePoint; heading: number }> =
    $derived.by(() =>
      additionalPaths.map((pathData) => {
        const entry = additionalPathCache.get(pathData);
        if (!entry || !pathData.startPoint) {
          return {
            xy: { x: 0, y: 0 },
            heading: 0,
          };
        }

        // If this path should be complete, cap at 100% (robot waits at end)
        const actualPercent = Math.min(percent, entry.completionPercent);
        const normalizedPercent =
          entry.completionPercent > 0
            ? (actualPercent / entry.completionPercent) * 100
            : 0;

        const state = calculateRobotState(
          normalizedPercent,
          entry.prediction.timeline,
          pathData.lines,
          pathData.startPoint,
          pathData.settings,
          x,
          y,
        );

        return {
          xy: { x: state.x, y: state.y },
          heading: state.heading,
        };
      }),
    );
  $effect.pre(() => {
    // Reference every piece of scene state so this block re-runs (and reschedules
    // the coalesced render) whenever any of it changes.
    const sceneDeps: unknown[] = [
      two,
      shapeElements,
      ghostPathElement,
      secondGhostPathElement,
      additionalGhostPathElements,
      onionLayerElements,
      secondOnionLayerElements,
      penGhostPath,
      path,
      secondPath,
      additionalPathElements,
      points,
      $dualPathMode,
      $activePaths,
    ];
    void sceneDeps;
    if (two) {
      scheduleSceneRender();
    }
  });
  $effect.pre(() => {
    if (fieldPointsCanvas && width > 0 && height > 0) {
      renderFieldPoints(fieldPointsCanvas, fieldPoints, x, y, width, height);
    }
  });
</script>

<svelte:window
  onmousemove={handlePanelResize}
  onmouseup={endPanelResize}
  onblur={endPanelResize}
/>

{#if isMobileBlocked}
  <MobileBlocked />
{:else}
  <Navbar
    bind:lines
    bind:startPoint
    bind:shapes
    bind:sequence
    bind:secondStartPoint
    bind:secondLines
    bind:secondShapes
    bind:secondSequence
    bind:fieldPoints
    bind:settings
    {percent}
    {saveProject}
    {saveFileAs}
    {renameCurrentFile}
    {loadFile}
    {undoAction}
    {redoAction}
    {recordChange}
    {canUndo}
    {canRedo}
    {optimizeAllLines}
    {optimizingAll}
    {twoElement}
    {exportPathAsGif}
    {leftPanelHidden}
    {rightPanelHidden}
    onToggleLeftPanel={toggleLeftPanelVisibility}
    onToggleRightPanel={toggleRightPanelVisibility}
  />

  <SaveDialog
    bind:isOpen={showSaveDialog}
    {isSaving}
    fileName={pathStem($currentFilePath) || "my_path"}
  />

  <DualPathSaveDialog bind:isOpen={showDualPathSaveDialog} />

  <ProgressDialog
    isOpen={exportingGif}
    progress={gifExportProgress}
    statusMessage={gifExportStatus}
    onCancel={() => {
      cancelGifExport = true;
      gifExportStatus = "Cancelling...";
    }}
  />

  <ToastHost />

  <!--   {saveFile} -->
  <div class="ui-shell w-screen h-screen pt-[5.1rem] px-3 pb-3">
    <div
      class="desktop-grid h-full"
      style={`--left-panel-width: ${leftPanelHidden ? "0px" : `${leftPanelWidth}px`}; --right-panel-width: ${rightPanelHidden ? "0px" : `${rightPanelWidth}px`}; --center-width: ${centerWidth}px;`}
    >
      <LeftRail
        hidden={leftPanelHidden}
        fileName={basename($currentFilePath) || "untitled_path.pp"}
        version={`v${PROJECT_VERSION}`}
        lineCount={atomicSegments(lines).length}
        {pathPreviewItems}
        {selectedPathIds}
        {primarySelectedId}
        {groupingBlockedReason}
        canUngroup={selectedPath?.kind === "compound"}
        onToggleVisibility={toggleLeftPanelVisibility}
        onSelectPath={(id, modifiers) => {
          selectPathFromList(id, modifiers);
          // Selecting a segment also moves the point editor to its endpoint.
          if (findSegmentById(lines, id)) selectedPointIndex = 0;
        }}
        onGroup={groupSelectedPaths}
        onUngroup={ungroupSelectedPath}
        onReorderPath={reorderPath}
      />

      <PanelDivider
        side="left"
        hidden={leftPanelHidden}
        onResizeStart={beginPanelResize}
        onRestore={() => (leftPanelHidden = false)}
      />

      <main class="panel-box center-stage">
        <div class="module-header-row mb-2">
          <h3 class="module-title">Field</h3>
          <span class="module-caption">Click a line or point to select it</span>
        </div>
        <FieldToolbar
          {playing}
          {penToolEnabled}
          onAddPath={addNewLine}
          onTogglePenTool={togglePenTool}
          onAddControlPoint={addControlPoint}
          onRemoveControlPoint={removeControlPoint}
          onCreatePathToLastPoint={createPathBetweenSelectedPoints}
          onTogglePlay={() => (playing ? pause() : play())}
        />

        <div
          class="field-stage flex h-full justify-center items-center"
          bind:clientWidth={fieldStageWidth}
          bind:clientHeight={fieldStageHeight}
        >
          <div
            bind:this={twoElement}
            bind:clientWidth={width}
            bind:clientHeight={height}
            class="bg-neutral-50 dark:bg-neutral-900 relative overflow-clip"
            role="application"
            style={`width: ${fieldPixelSize}px; height: ${fieldPixelSize}px; max-width: 100%; max-height: 100%; aspect-ratio: 1 / 1; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; user-drag: none; -webkit-user-drag: none; -khtml-user-drag: none; -moz-user-drag: none; -ms-user-drag: none; -o-user-drag: none;`}
            oncontextmenu={(e) => e.preventDefault()}
            ondragstart={(e) => e.preventDefault()}
            onselectstart={(e) => e.preventDefault()}
            tabindex="-1"
          >
            <FieldMapImage
              src={fieldMapSrc}
              fieldMapName={settings.fieldMap}
              onSettled={() => (fieldMapLoaded = true)}
            />
            <canvas
              bind:this={fieldPointsCanvas}
              class="absolute top-0 left-0 w-full h-full z-15 pointer-events-none"
              aria-hidden="true"
            ></canvas>
            <MathTools {x} {y} {twoElement} {robotXY} />
            <!-- Main robot: only show in normal mode -->
            {#if !isMultiPathMode}
              <RobotSprite
                xy={robotXY}
                heading={robotHeading}
                widthPx={x(robotWidth)}
                heightPx={x(robotHeight)}
                {settings}
                alt="Robot"
                zIndex={20}
                arrowZIndex={21}
                arrowId="arrowhead-main"
                showTValue={settings.showCurrentTValue}
                tValue={robotT}
                onImageSettled={() => (robotImageLoaded = true)}
              />
            {/if}
            <!-- Second robot: only show in dual path mode (not multi-path mode) -->
            {#if !isMultiPathMode && $dualPathMode}
              <RobotSprite
                xy={secondRobotXY}
                heading={secondRobotHeading}
                widthPx={x(robotWidth)}
                heightPx={x(robotHeight)}
                {settings}
                alt="Robot 2"
                zIndex={19}
                arrowZIndex={19}
                opacity={0.8}
                arrowId="arrowhead-second"
                onImageSettled={() => (robotImageLoaded = true)}
              />
            {/if}
            <!-- Additional robots: only show in multi-path mode -->
            {#if isMultiPathMode}
              {#each additionalRobotStates as robotState, idx (idx)}
                <RobotSprite
                  xy={robotState.xy}
                  heading={robotState.heading}
                  widthPx={x(robotWidth)}
                  heightPx={x(robotHeight)}
                  {settings}
                  alt="Robot {idx + 1}"
                  zIndex={20 - idx}
                  arrowZIndex={20 - idx}
                  opacity={1.0 - idx * 0.15}
                  arrowId="arrowhead-{idx}"
                  onImageSettled={() => (robotImageLoaded = true)}
                />
              {/each}
            {/if}
            {#if !initialAssetsReady}
              <FieldLoadingOverlay />
            {/if}
          </div>
        </div>
        <div class="module-footer">
          Field · {FIELD_SIZE}&quot; x {FIELD_SIZE}&quot; · {settings.origin ===
          "center"
            ? "center origin"
            : "bottom-left origin"} · {settings.axes === "first"
            ? "FIRST axes"
            : "legacy axes"}
        </div>
      </main>

      <PanelDivider
        side="right"
        hidden={rightPanelHidden}
        onResizeStart={beginPanelResize}
        onRestore={() => (rightPanelHidden = false)}
      />

      <aside
        class="panel-box side-rail side-rail-right"
        class:side-rail--collapsed={rightPanelHidden}
      >
        <div class="module-box control-panel-header">
          <div class="module-header-row">
            <div>
              <h3 class="module-title">Controls</h3>
              <p class="module-caption">
                Edit playback, paths, and robot settings.
              </p>
            </div>
            <button
              class="panel-toggle-btn"
              type="button"
              onclick={toggleRightPanelVisibility}
              aria-label={rightPanelHidden
                ? "Show right panel"
                : "Hide right panel"}
              title={rightPanelHidden ? "Show right panel" : "Hide right panel"}
            >
              {rightPanelHidden ? "‹" : "›"}
            </button>
          </div>
        </div>
        <ControlTab
          bind:playing
          {play}
          {pause}
          bind:startPoint
          bind:lines
          bind:sequence
          {selectedLineId}
          selectedPathId={primarySelectedId}
          onSelectPath={(id) => (selectedPathIds = id ? [id] : [])}
          onUngroup={ungroupSelectedPath}
          bind:selectedPointIndex
          {settings}
          bind:percent
          {robotXY}
          {robotHeading}
          bind:shapes
          {x}
          {y}
          {handleSeek}
          bind:loopAnimation
          {recordChange}
        />
      </aside>
    </div>
  </div>
{/if}
