<script lang="ts">
  import type {
    Line,
    BasePoint,
    Settings,
    Point,
    SequenceItem,
    Shape,
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
  } from "./stores";
  import Two from "two.js";
  import type { Path } from "two.js/src/path";
  import type { Line as PathLine } from "two.js/src/shapes/line";
  import ControlTab from "./lib/ControlTab.svelte";
  import Navbar from "./lib/Navbar.svelte";
  import MathTools from "./lib/MathTools.svelte";
  import SaveDialog from "./lib/components/SaveDialog.svelte";
  import DualPathSaveDialog from "./lib/components/DualPathSaveDialog.svelte";
  import _ from "lodash";
  import hotkeys from "hotkeys-js";
  import { createAnimationController } from "./utils/animation";
  import { calculatePathTime, getAnimationDuration } from "./utils";

  import {
    calculateRobotState,
    generateGhostPathPoints,
    generateOnionLayers,
  } from "./utils";
  import {
    easeInOutQuad,
    getCurvePoint,
    getRandomColor,
    quadraticToCubic,
    radiansToDegrees,
    shortestRotation,
    downloadTrajectory,
    loadTrajectoryFromFile,
    loadRobotImage,
    updateRobotImageDisplay,
  } from "./utils";
  import {
    POINT_RADIUS,
    LINE_WIDTH,
    DEFAULT_ROBOT_WIDTH,
    DEFAULT_ROBOT_HEIGHT,
    DEFAULT_SETTINGS,
    FIELD_SIZE,
    getDefaultStartPoint,
    getDefaultLines,
    getDefaultShapes,
  } from "./config";
  import { loadSettings, saveSettings } from "./utils/settingsPersistence";
  import * as browserFileStore from "./utils/browserFileStore";
  import { onMount, tick } from "svelte";
  import { debounce } from "lodash";
  import { createHistory, type AppState } from "./utils/history";
  // Browser-only build: file operations use the browser file store and
  // localStorage. Electron-specific APIs have been removed.

  function normalizeLines(input: Line[]): Line[] {
    return (input || []).map((line) => ({
      ...line,
      id: line.id || `line-${Math.random().toString(36).slice(2)}`,
      controlPoints: line.controlPoints || [],
      color: line.color || getRandomColor(),
      name: line.name || "",
      waitBeforeMs: Math.max(
        0,
        Number(line.waitBeforeMs ?? line.waitBefore?.durationMs ?? 0),
      ),
      waitAfterMs: Math.max(
        0,
        Number(line.waitAfterMs ?? line.waitAfter?.durationMs ?? 0),
      ),
      waitBeforeName: line.waitBeforeName ?? line.waitBefore?.name ?? "",
      waitAfterName: line.waitAfterName ?? line.waitAfter?.name ?? "",
    }));
  }

  // Canvas state
  let two: Two;
  let twoElement: HTMLDivElement;
  let width = 0;
  let height = 0;
  // Robot state
  $: robotWidth = settings?.rWidth || DEFAULT_ROBOT_WIDTH;
  $: robotHeight = settings?.rHeight || DEFAULT_ROBOT_HEIGHT;
  let robotXY: BasePoint = { x: 0, y: 0 };
  let robotHeading: number = 0;
  // Animation state
  let percent: number = 0;
  let playing = false;
  let animationFrame: number;
  let startTime: number | null = null;
  let previousTime: number | null = null;
  // Save dialog state
  let showSaveDialog = false;
  let showDualPathSaveDialog = false;
  let isSaving = false;
  // Path data
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let startPoint: Point = getDefaultStartPoint();
  let lines: Line[] = normalizeLines(getDefaultLines());
  let sequence: SequenceItem[] = lines.map((ln) => ({
    kind: "path",
    lineId: ln.id!,
  }));
  let shapes: Shape[] = getDefaultShapes();
  let optimizingLineIds: Record<string, boolean> = {};
  let optimizingAll = false;

  // Second path data (for alliance coordination) - DEPRECATED, use additionalPaths
  let secondStartPoint: Point | null = null;
  let secondLines: Line[] = [];
  let secondSequence: SequenceItem[] = [];
  let secondShapes: Shape[] = [];

  // Multiple paths data (new system - supports up to 4 paths total)
  interface AdditionalPathData {
    filePath: string;
    startPoint: Point | null;
    lines: Line[];
    sequence: SequenceItem[];
    shapes: Shape[];
    settings: Settings;
    color?: string; // Optional custom color for this path
  }
  let additionalPaths: AdditionalPathData[] = [];

  const history = createHistory();
  const { canUndoStore, canRedoStore } = history;
  const OPTIMIZER_BASE_URL = "https://fpa.pedropathing.com";

  function getAppState(): AppState {
    return {
      startPoint,
      lines,
      shapes,
      sequence,
      settings,
    };
  }

  // Use the stores for reactivity
  $: canUndo = $canUndoStore;
  $: canRedo = $canRedoStore;

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
      isUnsaved.set(true);
      two && two.update();
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
      isUnsaved.set(true);
      two && two.update();
    }
  }

  $: {
    // Ensure arrays are reactive when items are added/removed
    lines = lines;
    shapes = shapes;
  }

  // Two.js groups
  let lineGroup = new Two.Group();
  lineGroup.id = "line-group";
  let pointGroup = new Two.Group();
  pointGroup.id = "point-group";
  let shapeGroup = new Two.Group();
  shapeGroup.id = "shape-group";
  // Coordinate converters
  let x: d3.ScaleLinear<number, number, number>;

  // Animation controller
  let loopAnimation = true;
  let animationController: ReturnType<typeof createAnimationController>;
  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);
  $: animationDuration = getAnimationDuration(timePrediction.totalTime / 1000);
  
  // Second path timeline (for dual path mode)
  $: secondTimePrediction = $dualPathMode && secondStartPoint && secondLines.length > 0 
    ? calculatePathTime(secondStartPoint, secondLines, settings, secondSequence)
    : null;
  
  // Calculate max duration across all paths for playbar scaling
  $: effectiveAnimationDuration = (() => {
    // In multi-path mode, only use additional paths for duration
    if ($activePaths.length > 0) {
      let maxTime = 0;
      additionalPaths.forEach((pathData) => {
        if (pathData.startPoint && pathData.lines.length > 0) {
          const pathTime = calculatePathTime(
            pathData.startPoint,
            pathData.lines,
            pathData.settings,
            pathData.sequence
          );
          if (pathTime) {
            maxTime = Math.max(maxTime, pathTime.totalTime);
          }
        }
      });
      return maxTime > 0 ? getAnimationDuration(maxTime / 1000) : animationDuration;
    }
    
    // In normal/dual mode, check main path and second path
    let maxTime = timePrediction.totalTime;
    
    if ($dualPathMode && secondTimePrediction) {
      maxTime = Math.max(maxTime, secondTimePrediction.totalTime);
    }
    
    return getAnimationDuration(maxTime / 1000);
  })();
  
  // Load additional paths when activePaths changes
  $: {
    loadAdditionalPaths($activePaths);
  }

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
    
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A']; // Red, Teal, Blue, Salmon

    for (let i = 0; i < Math.min(paths.length, 4); i++) {
      const filePath = paths[i];
      try {
        const content = await browserFileStore.readFile(filePath);
        const data = JSON.parse(content);

        if (data.startPoint && data.lines) {
          const normalizedLines = normalizeLines(data.lines || []);
          newAdditionalPaths.push({
            filePath,
            startPoint: data.startPoint,
            lines: normalizedLines,
            shapes: data.shapes || [],
            sequence: data.sequence || normalizedLines.map((ln: Line) => ({
              kind: "path",
              lineId: ln.id!,
            })),
            settings: data.settings || { ...DEFAULT_SETTINGS },
            color: colors[i],
          });
        }
      } catch (error) {
        console.error(`Failed to load additional path ${filePath}:`, error);
      }
    }

    additionalPaths = newAdditionalPaths;
  }
  
  let secondRobotXY: BasePoint = { x: 0, y: 0 };
  let secondRobotHeading: number = 0;
  /**
   * Converter for X axis from inches to pixels.
   */
  $: x = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([0, width || FIELD_SIZE]);
  /**
   * Converter for Y axis from inches to pixels.
   */
  $: y = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([height || FIELD_SIZE, 0]);
  $: {
    // Calculate robot state using the Timeline
    if (timePrediction && timePrediction.timeline && lines.length > 0) {
      const state = calculateRobotState(
        percent,
        timePrediction.timeline,
        lines,
        startPoint,
        settings,
        x,
        y,
      );
      robotXY = { x: state.x, y: state.y };
      robotHeading = state.heading;
    } else {
      // Fallback for initialization
      robotXY = { x: x(startPoint.x), y: y(startPoint.y) };
      robotHeading = 0;
    }
  }

  $: points = (() => {
    let _points = [];
    
    // Only show main path points when NOT in multi-path mode
    if ($activePaths.length === 0) {
      let startPointElem = new Two.Circle(
        x(startPoint.x),
        y(startPoint.y),
        x(POINT_RADIUS),
      );
      startPointElem.id = `point-0-0`;
      startPointElem.fill = lines[0].color;
      startPointElem.noStroke();

      _points.push(startPointElem);

      lines.forEach((line, idx) => {
        if (!line || !line.endPoint) return; // Skip invalid lines or lines without endPoint
        [line.endPoint, ...line.controlPoints].forEach((point, idx1) => {
          if (idx1 > 0) {
            let pointGroup = new Two.Group();
            pointGroup.id = `point-${idx + 1}-${idx1}`;

            let pointElem = new Two.Circle(
              x(point.x),
              y(point.y),
              x(POINT_RADIUS),
            );
            pointElem.id = `point-${idx + 1}-${idx1}-background`;
            pointElem.fill = line.color;
            pointElem.noStroke();

            let pointText = new Two.Text(
              `${idx1}`,
              x(point.x),
              y(point.y - 0.15),
              x(POINT_RADIUS),
            );
            pointText.id = `point-${idx + 1}-${idx1}-text`;
            pointText.size = x(1.55);
            pointText.leading = 1;
            pointText.family = "ui-sans-serif, system-ui, sans-serif";
            pointText.alignment = "center";
            pointText.baseline = "middle";
            pointText.fill = "white";
            pointText.noStroke();

            pointGroup.add(pointElem, pointText);
            _points.push(pointGroup);
          } else {
            let pointElem = new Two.Circle(
              x(point.x),
              y(point.y),
              x(POINT_RADIUS),
            );
            pointElem.id = `point-${idx + 1}-${idx1}`;
            pointElem.fill = line.color;
            pointElem.noStroke();
            _points.push(pointElem);
          }
        });
      });
    }
    
    // Add obstacle vertices as draggable points
    shapes.forEach((shape, shapeIdx) => {
      shape.vertices.forEach((vertex, vertexIdx) => {
        let pointGroup = new Two.Group();
        pointGroup.id = `obstacle-${shapeIdx}-${vertexIdx}`;

        let pointElem = new Two.Circle(
          x(vertex.x),
          y(vertex.y),
          x(POINT_RADIUS),
        );
        pointElem.id = `obstacle-${shapeIdx}-${vertexIdx}-background`;
        pointElem.fill = shape.fillColor; // Match obstacle fill color
        pointElem.noStroke();

        let pointText = new Two.Text(
          `${vertexIdx + 1}`,
          x(vertex.x),
          y(vertex.y - 0.15),
          x(POINT_RADIUS),
        );
        pointText.id = `obstacle-${shapeIdx}-${vertexIdx}-text`;
        pointText.size = x(1.55);
        pointText.leading = 1;
        pointText.family = "ui-sans-serif, system-ui, sans-serif";
        pointText.alignment = "center";
        pointText.baseline = "middle";
        pointText.fill = "white";
        pointText.noStroke();
        pointGroup.add(pointElem, pointText);
        _points.push(pointGroup);
      });
    });

    // Add second path points (for dual path mode) - not in multi-path mode
    if ($activePaths.length === 0 && $dualPathMode && secondStartPoint && secondLines.length > 0) {
      let secondStartPointElem = new Two.Circle(
        x(secondStartPoint.x),
        y(secondStartPoint.y),
        x(POINT_RADIUS),
      );
      secondStartPointElem.id = `second-point-0-0`;
      secondStartPointElem.fill = secondLines[0]?.color || "#888";
      secondStartPointElem.noStroke();
      _points.push(secondStartPointElem);

      secondLines.forEach((line, idx) => {
        if (!line || !line.endPoint) return;
        [line.endPoint, ...line.controlPoints].forEach((point, idx1) => {
          if (idx1 > 0) {
            let pointGroup = new Two.Group();
            pointGroup.id = `second-point-${idx + 1}-${idx1}`;

            let pointElem = new Two.Circle(
              x(point.x),
              y(point.y),
              x(POINT_RADIUS),
            );
            pointElem.id = `second-point-${idx + 1}-${idx1}-background`;
            pointElem.fill = line.color;
            pointElem.noStroke();

            let pointText = new Two.Text(
              `${idx1}`,
              x(point.x),
              y(point.y - 0.15),
              x(POINT_RADIUS),
            );
            pointText.id = `second-point-${idx + 1}-${idx1}-text`;
            pointText.size = x(1.55);
            pointText.leading = 1;
            pointText.family = "ui-sans-serif, system-ui, sans-serif";
            pointText.alignment = "center";
            pointText.baseline = "middle";
            pointText.fill = "white";
            pointText.noStroke();

            pointGroup.add(pointElem, pointText);
            _points.push(pointGroup);
          } else {
            let pointElem = new Two.Circle(
              x(point.x),
              y(point.y),
              x(POINT_RADIUS),
            );
            pointElem.id = `second-point-${idx + 1}-${idx1}`;
            pointElem.fill = line.color;
            pointElem.noStroke();
            _points.push(pointElem);
          }
        });
      });
    }

    // Add all control points for additional paths (full editing support)
    if ($activePaths.length > 0) {
      additionalPaths.forEach((pathData, pathIdx) => {
        if (!pathData.startPoint || !pathData.lines.length) return;
        
        // Add starting point
        let startPointElem = new Two.Circle(
          x(pathData.startPoint.x),
          y(pathData.startPoint.y),
          x(POINT_RADIUS * 0.9),
        );
        startPointElem.id = `additional-path-${pathIdx}-point-0-0`;
        startPointElem.fill = pathData.color || pathData.lines[0]?.color || "#888";
        startPointElem.noStroke();
        startPointElem.opacity = 0.8;
        _points.push(startPointElem);
        
        // Add all line points and control points
        pathData.lines.forEach((line, lineIdx) => {
          if (!line || !line.endPoint) return;
          
          [line.endPoint, ...line.controlPoints].forEach((point, pointIdx) => {
            if (pointIdx > 0) {
              // Control point with number
              let pointGroup = new Two.Group();
              pointGroup.id = `additional-path-${pathIdx}-point-${lineIdx + 1}-${pointIdx}`;

              let pointElem = new Two.Circle(
                x(point.x),
                y(point.y),
                x(POINT_RADIUS * 0.9),
              );
              pointElem.id = `additional-path-${pathIdx}-point-${lineIdx + 1}-${pointIdx}-background`;
              pointElem.fill = pathData.color || line.color;
              pointElem.noStroke();

              let pointText = new Two.Text(
                `${pointIdx}`,
                x(point.x),
                y(point.y - 0.15),
                x(POINT_RADIUS * 0.9),
              );
              pointText.id = `additional-path-${pathIdx}-point-${lineIdx + 1}-${pointIdx}-text`;
              pointText.size = x(1.4);
              pointText.leading = 1;
              pointText.family = "ui-sans-serif, system-ui, sans-serif";
              pointText.alignment = "center";
              pointText.baseline = "middle";
              pointText.fill = "white";
              pointText.noStroke();

              pointGroup.add(pointElem, pointText);
              pointGroup.opacity = 0.8;
              _points.push(pointGroup);
            } else {
              // End point without number
              let pointElem = new Two.Circle(
                x(point.x),
                y(point.y),
                x(POINT_RADIUS * 0.9),
              );
              pointElem.id = `additional-path-${pathIdx}-point-${lineIdx + 1}-${pointIdx}`;
              pointElem.fill = pathData.color || line.color;
              pointElem.noStroke();
              pointElem.opacity = 0.8;
              _points.push(pointElem);
            }
          });
        });
      });
    }

    return _points;
  })();

  $: path = (() => {
    // Hide main path when in multi-path mode (isolated visualization)
    if ($activePaths.length > 0) {
      return [];
    }
    
    let _path: (Path | PathLine)[] = [];

    lines.forEach((line, idx) => {
      if (!line || !line.endPoint) return; // Skip invalid lines or lines without endPoint
      let _startPoint =
        idx === 0 ? startPoint : lines[idx - 1]?.endPoint || null;
      if (!_startPoint) return; // Skip if previous line's endPoint is missing

      let lineElem: Path | PathLine;
      if (line.controlPoints.length > 2) {
        // Approximate an n-degree bezier curve by sampling it at 100 points
        const samples = 100;
        const cps = [_startPoint, ...line.controlPoints, line.endPoint];
        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        ];
        for (let i = 1; i <= samples; ++i) {
          const point = getCurvePoint(i / samples, cps);
          points.push(
            new Two.Anchor(
              x(point.x),
              y(point.y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }
        points.forEach((point) => (point.relative = false));
        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else if (line.controlPoints.length > 0) {
        let cp1 = line.controlPoints[1]
          ? line.controlPoints[0]
          : quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
              .Q1;
        let cp2 =
          line.controlPoints[1] ??
          quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
            .Q2;
        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            x(_startPoint.x),
            y(_startPoint.y),
            x(cp1.x),
            y(cp1.y),
            Two.Commands.move,
          ),
          new Two.Anchor(
            x(line.endPoint.x),
            y(line.endPoint.y),
            x(cp2.x),
            y(cp2.y),
            x(line.endPoint.x),
            y(line.endPoint.y),
            Two.Commands.curve,
          ),
        ];
        points.forEach((point) => (point.relative = false));

        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else {
        lineElem = new Two.Line(
          x(_startPoint.x),
          y(_startPoint.y),
          x(line.endPoint.x),
          y(line.endPoint.y),
        );
      }

      lineElem.id = `line-${idx + 1}`;
      lineElem.stroke = line.color;
      lineElem.linewidth = x(LINE_WIDTH);
      lineElem.noFill();
      // Add a dashed line for locked paths
      if (line.locked) {
        lineElem.dashes = [x(2), x(2)];
        lineElem.opacity = 0.7;
      } else {
        lineElem.dashes = [];
        lineElem.opacity = 1;
      }

      _path.push(lineElem);
    });

    return _path;
  })();

  // Second path rendering (for dual path mode)
  $: secondPath = (() => {
    // Don't show second path when in multi-path mode (use activePaths instead)
    if ($activePaths.length > 0 || !$dualPathMode || !secondStartPoint || secondLines.length === 0) {
      return [];
    }

    let _path: (Path | PathLine)[] = [];

    secondLines.forEach((line, idx) => {
      if (!line || !line.endPoint) return;
      let _startPoint =
        idx === 0 ? secondStartPoint : secondLines[idx - 1]?.endPoint || null;
      if (!_startPoint) return;

      let lineElem: Path | PathLine;
      if (line.controlPoints.length > 2) {
        const samples = 100;
        const cps = [_startPoint, ...line.controlPoints, line.endPoint];
        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        ];
        for (let i = 1; i <= samples; ++i) {
          const point = getCurvePoint(i / samples, cps);
          points.push(
            new Two.Anchor(
              x(point.x),
              y(point.y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }
        points.forEach((point) => (point.relative = false));
        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else if (line.controlPoints.length > 0) {
        let cp1 = line.controlPoints[1]
          ? line.controlPoints[0]
          : quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
              .Q1;
        let cp2 =
          line.controlPoints[1] ??
          quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
            .Q2;
        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            x(_startPoint.x),
            y(_startPoint.y),
            x(cp1.x),
            y(cp1.y),
            Two.Commands.move,
          ),
          new Two.Anchor(
            x(line.endPoint.x),
            y(line.endPoint.y),
            x(cp2.x),
            y(cp2.y),
            x(line.endPoint.x),
            y(line.endPoint.y),
            Two.Commands.curve,
          ),
        ];
        points.forEach((point) => (point.relative = false));

        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else {
        lineElem = new Two.Line(
          x(_startPoint.x),
          y(_startPoint.y),
          x(line.endPoint.x),
          y(line.endPoint.y),
        );
      }

      lineElem.id = `second-line-${idx + 1}`;
      lineElem.stroke = line.color;
      lineElem.linewidth = x(LINE_WIDTH);
      lineElem.noFill();
      if (line.locked) {
        lineElem.dashes = [x(2), x(2)];
        lineElem.opacity = 0.7;
      } else {
        lineElem.dashes = [];
        lineElem.opacity = 1;
      }

      _path.push(lineElem);
    });

    return _path;
  })();

  // Render all additional paths
  $: additionalPathElements = additionalPaths.map((pathData, pathIdx) => {
    if (!pathData.startPoint || pathData.lines.length === 0) {
      return [];
    }

    let _path: (Path | PathLine)[] = [];
    // All paths should be clearly visible - only slight opacity variation
    const opacity = 1.0 - (pathIdx * 0.1);

    pathData.lines.forEach((line, idx) => {
      if (!line || !line.endPoint) return;
      let _startPoint =
        idx === 0 ? pathData.startPoint : pathData.lines[idx - 1]?.endPoint || null;
      if (!_startPoint) return;

      let lineElem: Path | PathLine;
      if (line.controlPoints.length > 2) {
        const samples = 100;
        const cps = [_startPoint, ...line.controlPoints, line.endPoint];
        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        ];
        for (let i = 1; i <= samples; ++i) {
          const point = getCurvePoint(i / samples, cps);
          points.push(
            new Two.Anchor(
              x(point.x),
              y(point.y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }
        points.forEach((point) => (point.relative = false));
        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else if (line.controlPoints.length > 0) {
        let cp1 = line.controlPoints[1]
          ? line.controlPoints[0]
          : quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
              .Q1;
        let cp2 =
          line.controlPoints[1] ??
          quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
            .Q2;
        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            x(_startPoint.x),
            y(_startPoint.y),
            x(cp1.x),
            y(cp1.y),
            Two.Commands.move,
          ),
          new Two.Anchor(
            x(line.endPoint.x),
            y(line.endPoint.y),
            x(cp2.x),
            y(cp2.y),
            x(line.endPoint.x),
            y(line.endPoint.y),
            Two.Commands.curve,
          ),
        ];
        points.forEach((point) => (point.relative = false));

        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else {
        lineElem = new Two.Line(
          x(_startPoint.x),
          y(_startPoint.y),
          x(line.endPoint.x),
          y(line.endPoint.y),
        );
      }

      lineElem.id = `additional-path-${pathIdx}-line-${idx + 1}`;
      lineElem.stroke = pathData.color || line.color;
      lineElem.linewidth = x(LINE_WIDTH);
      lineElem.noFill();
      lineElem.opacity = opacity;

      _path.push(lineElem);
    });

    return _path;
  });

  $: shapeElements = (() => {
    // Obstacles removed: return empty array for shape elements
    let _shapes: Path[] = [];

    shapes.forEach((shape, idx) => {
      if (shape.vertices.length >= 3) {
        // Create polygon from vertices - properly format for Two.js
        let vertices = [];

        // Start with move command for first vertex
        vertices.push(
          new Two.Anchor(
            x(shape.vertices[0].x),
            y(shape.vertices[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        );

        // Add line commands for remaining vertices
        for (let i = 1; i < shape.vertices.length; i++) {
          vertices.push(
            new Two.Anchor(
              x(shape.vertices[i].x),
              y(shape.vertices[i].y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }

        // Close the shape
        vertices.push(
          new Two.Anchor(
            x(shape.vertices[0].x),
            y(shape.vertices[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.close,
          ),
        );

        vertices.forEach((point) => (point.relative = false));

        let shapeElement = new Two.Path(vertices);
        shapeElement.id = `shape-${idx}`;
        shapeElement.stroke = shape.color;
        shapeElement.fill = shape.color;
        shapeElement.opacity = 0.4;
        shapeElement.linewidth = x(0.8);
        shapeElement.automatic = false;

        _shapes.push(shapeElement);
      }
    });

    return _shapes;
  })();

  $: ghostPathElement = (() => {
    let ghostPath: Path | null = null;

    // Don't show ghost paths in multi-path mode
    if ($activePaths.length === 0 && settings.showGhostPaths && lines.length > 0) {
      const ghostPoints = generateGhostPathPoints(
        startPoint,
        lines,
        settings.rWidth,
        settings.rHeight,
        50,
      );

      if (ghostPoints.length >= 3) {
        // Create polygon from ghost path points
        let vertices = [];

        // Start with move command for first point
        vertices.push(
          new Two.Anchor(
            x(ghostPoints[0].x),
            y(ghostPoints[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        );

        // Add line commands for remaining points
        for (let i = 1; i < ghostPoints.length; i++) {
          vertices.push(
            new Two.Anchor(
              x(ghostPoints[i].x),
              y(ghostPoints[i].y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }

        // Close the shape
        vertices.push(
          new Two.Anchor(
            x(ghostPoints[0].x),
            y(ghostPoints[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.close,
          ),
        );

        vertices.forEach((point) => (point.relative = false));

        ghostPath = new Two.Path(vertices);
        ghostPath.id = "ghost-path";
        ghostPath.stroke = "#a78bfa"; // Light purple/lavender
        ghostPath.fill = "#a78bfa";
        ghostPath.opacity = 0.15;
        ghostPath.linewidth = x(0.5);
        ghostPath.automatic = false;
      }
    }

    return ghostPath;
  })();

  // Second ghost path for dual path mode
  $: secondGhostPathElement = (() => {
    let ghostPath: Path | null = null;

    // Don't show second ghost path in multi-path mode
    if ($activePaths.length === 0 && $dualPathMode && settings.showGhostPaths && secondLines.length > 0 && secondStartPoint) {
      const ghostPoints = generateGhostPathPoints(
        secondStartPoint,
        secondLines,
        settings.rWidth,
        settings.rHeight,
        50,
      );

      if (ghostPoints.length >= 3) {
        let vertices = [];

        vertices.push(
          new Two.Anchor(
            x(ghostPoints[0].x),
            y(ghostPoints[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        );

        for (let i = 1; i < ghostPoints.length; i++) {
          vertices.push(
            new Two.Anchor(
              x(ghostPoints[i].x),
              y(ghostPoints[i].y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }

        vertices.push(
          new Two.Anchor(
            x(ghostPoints[0].x),
            y(ghostPoints[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.close,
          ),
        );

        vertices.forEach((point) => (point.relative = false));

        ghostPath = new Two.Path(vertices);
        ghostPath.id = "ghost-path-2";
        ghostPath.stroke = "#fca5a5"; // Light red/pink for second robot
        ghostPath.fill = "#fca5a5";
        ghostPath.opacity = 0.15;
        ghostPath.linewidth = x(0.5);
        ghostPath.automatic = false;
      }
    }

    return ghostPath;
  })();

  // Ghost paths for additional paths in multi-path mode
  $: additionalGhostPathElements = (() => {
    let ghostPaths: Path[] = [];

    if ($activePaths.length > 0 && settings.showGhostPaths) {
      additionalPaths.forEach((pathData, pathIdx) => {
        if (!pathData.startPoint || !pathData.lines.length) return;

        const ghostPoints = generateGhostPathPoints(
          pathData.startPoint,
          pathData.lines,
          settings.rWidth,
          settings.rHeight,
          50,
        );

        if (ghostPoints.length >= 3) {
          let vertices = [];

          vertices.push(
            new Two.Anchor(
              x(ghostPoints[0].x),
              y(ghostPoints[0].y),
              0,
              0,
              0,
              0,
              Two.Commands.move,
            ),
          );

          for (let i = 1; i < ghostPoints.length; i++) {
            vertices.push(
              new Two.Anchor(
                x(ghostPoints[i].x),
                y(ghostPoints[i].y),
                0,
                0,
                0,
                0,
                Two.Commands.line,
              ),
            );
          }

          vertices.push(
            new Two.Anchor(
              x(ghostPoints[0].x),
              y(ghostPoints[0].y),
              0,
              0,
              0,
              0,
              Two.Commands.close,
            ),
          );

          vertices.forEach((point) => (point.relative = false));

          const ghostPath = new Two.Path(vertices);
          ghostPath.id = `ghost-path-additional-${pathIdx}`;
          ghostPath.stroke = pathData.color || "#a78bfa";
          ghostPath.fill = pathData.color || "#a78bfa";
          ghostPath.opacity = 0.15;
          ghostPath.linewidth = x(0.5);
          ghostPath.automatic = false;
          
          ghostPaths.push(ghostPath);
        }
      });
    }

    return ghostPaths;
  })();

  $: onionLayerElements = (() => {
    let onionLayers: Path[] = [];

    // Don't show onion layers in multi-path mode
    if ($activePaths.length === 0 && settings.showOnionLayers && lines.length > 0) {
      const spacing = settings.onionLayerSpacing || 6;
      let layers = generateOnionLayers(
        startPoint,
        lines,
        settings.rWidth,
        settings.rHeight,
        spacing,
      );

      // If user requested onion layers only for the next point, filter to the relevant line
      if (
        settings.onionNextPointOnly &&
        timePrediction &&
        timePrediction.timeline
      ) {
        const currentTime = (timePrediction.totalTime || 0) * (percent / 100);
        const travelEvents = (timePrediction.timeline || []).filter(
          (ev) => ev.type === "travel",
        );

        let selectedLineIndex: number | null = null;

        // Current travel segment
        const currentTravel = travelEvents.find(
          (ev) => ev.startTime <= currentTime && ev.endTime >= currentTime,
        );
        if (currentTravel) {
          selectedLineIndex = currentTravel.lineIndex as number;
        } else {
          // Next upcoming travel segment
          const nextTravel = travelEvents.find(
            (ev) => ev.startTime > currentTime,
          );
          if (nextTravel) selectedLineIndex = nextTravel.lineIndex as number;
          else if (travelEvents.length)
            selectedLineIndex = travelEvents[travelEvents.length - 1]
              .lineIndex as number;
        }

        if (selectedLineIndex !== null) {
          layers = layers.filter((l: any) => l.lineIndex === selectedLineIndex);
        }
      }

      layers.forEach((layer, idx) => {
        // Create a rectangle from the robot corners
        let vertices: any[] = [];

        // Create path from corners: front-left -> front-right -> back-right -> back-left
        vertices.push(
          new Two.Anchor(
            x(layer.corners[0].x),
            y(layer.corners[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        );

        for (let i = 1; i < layer.corners.length; i++) {
          vertices.push(
            new Two.Anchor(
              x(layer.corners[i].x),
              y(layer.corners[i].y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }

        // Close the path by returning to the first corner
        vertices.push(
          new Two.Anchor(
            x(layer.corners[0].x),
            y(layer.corners[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.close,
          ),
        );

        vertices.forEach((point) => (point.relative = false));

        let onionRect = new Two.Path(vertices);
        onionRect.id = `onion-layer-${idx}`;
        onionRect.stroke = settings.onionColor || "#dc2626";
        onionRect.noFill();
        // Increase opacity so colliders are more visible
        onionRect.opacity = 0.9;
        onionRect.linewidth = x(0.28);
        onionRect.automatic = false;

        onionLayers.push(onionRect);
      });
    }

    return onionLayers;
  })();

  // Second onion layers for dual path mode
  $: secondOnionLayerElements = (() => {
    let onionLayers: Path[] = [];

    // Don't show second onion layers in multi-path mode
    if ($activePaths.length === 0 && $dualPathMode && settings.showOnionLayers && secondLines.length > 0 && secondStartPoint) {
      const spacing = settings.onionLayerSpacing || 6;
      let layers = generateOnionLayers(
        secondStartPoint,
        secondLines,
        settings.rWidth,
        settings.rHeight,
        spacing,
      );

      // If user requested onion layers only for the next point, filter to the relevant line
      if (
        settings.onionNextPointOnly &&
        secondTimePrediction &&
        secondTimePrediction.timeline
      ) {
        const currentTime = (secondTimePrediction.totalTime || 0) * (percent / 100);
        const travelEvents = (secondTimePrediction.timeline || []).filter(
          (ev) => ev.type === "travel",
        );

        let selectedLineIndex: number | null = null;

        const currentTravel = travelEvents.find(
          (ev) => ev.startTime <= currentTime && ev.endTime >= currentTime,
        );
        if (currentTravel) {
          selectedLineIndex = currentTravel.lineIndex as number;
        } else {
          const nextTravel = travelEvents.find(
            (ev) => ev.startTime > currentTime,
          );
          if (nextTravel) selectedLineIndex = nextTravel.lineIndex as number;
          else if (travelEvents.length)
            selectedLineIndex = travelEvents[travelEvents.length - 1]
              .lineIndex as number;
        }

        if (selectedLineIndex !== null) {
          layers = layers.filter((l: any) => l.lineIndex === selectedLineIndex);
        }
      }

      layers.forEach((layer, idx) => {
        let vertices: any[] = [];

        vertices.push(
          new Two.Anchor(
            x(layer.corners[0].x),
            y(layer.corners[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        );

        for (let i = 1; i < layer.corners.length; i++) {
          vertices.push(
            new Two.Anchor(
              x(layer.corners[i].x),
              y(layer.corners[i].y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }

        vertices.push(
          new Two.Anchor(
            x(layer.corners[0].x),
            y(layer.corners[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.close,
          ),
        );

        vertices.forEach((point) => (point.relative = false));

        let onionRect = new Two.Path(vertices);
        onionRect.id = `second-onion-layer-${idx}`;
        onionRect.stroke = "#fca5a5"; // Light red/pink for second path
        onionRect.noFill();
        onionRect.opacity = 0.9;
        onionRect.linewidth = x(0.28);
        onionRect.automatic = false;

        onionLayers.push(onionRect);
      });
    }

    return onionLayers;
  })();

  let isLoaded = false;
  // Reactively trigger when any saveable data changes
  $: {
    if (isLoaded && (lines || shapes || startPoint || settings)) {
      isUnsaved.set(true);
    }
  }

  // Allow the app to stabilize before tracking changes
  onMount(() => {
    setTimeout(() => {
      isLoaded = true;
      recordChange();
    }, 500);
  });
  onMount(async () => {
    // Load saved settings
    const savedSettings = await loadSettings();
    settings = { ...savedSettings };

    // Update robot dimensions from loaded settings
    robotWidth = settings.rWidth;
    robotHeight = settings.rHeight;
  });
  // Debounced save function
  const debouncedSaveSettings = debounce(async (settingsToSave: Settings) => {
    await saveSettings(settingsToSave);
  }, 1000);
  // Save after 1 second of inactivity

  // Watch for settings changes and save
  $: {
    if (settings) {
      debouncedSaveSettings(settings);
    }
  }

  // Initialize animation controller
  onMount(() => {
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
  $: if (animationController) {
    animationController.setDuration(effectiveAnimationDuration);
  }

  $: if (animationController) {
    animationController.setLoop(loopAnimation);
    // Sync UI state with controller
    playing = animationController.isPlaying();
  }

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
      const fileData = JSON.stringify({
        startPoint: pathData.startPoint,
        lines: pathData.lines,
        shapes: pathData.shapes,
        sequence: pathData.sequence,
        settings: pathData.settings,
        version: "1.2.1",
        timestamp: new Date().toISOString(),
      });
      
      await browserFileStore.writeFile(pathData.filePath, fileData);
      console.log(`Auto-saved additional path: ${pathData.filePath}`);
    } catch (error) {
      console.error(`Failed to save additional path ${pathData.filePath}:`, error);
      throw error;
    }
  }

  // Keyboard shortcut for save
  hotkeys("cmd+s, ctrl+s", function (event, handler) {
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
  $: {
    // This handles both 'travel' (movement) and 'wait' (stationary rotation) events.
    // Don't show main robot in multi-path mode
    if ($activePaths.length === 0 && timePrediction && timePrediction.timeline && lines.length > 0) {
      const state = calculateRobotState(
        percent,
        timePrediction.timeline,
        lines,
        startPoint,
        settings,
        x,
        y,
      );
      robotXY = { x: state.x, y: state.y };
      robotHeading = state.heading;
    } else {
      // Fallback for initialization or empty state
      robotXY = { x: x(startPoint.x), y: y(startPoint.y) };
      // Calculate initial heading based on start point settings
      if (startPoint.heading === "linear") robotHeading = -startPoint.startDeg;
      else if (startPoint.heading === "constant")
        robotHeading = -startPoint.degrees;
      else robotHeading = 0;
    }
  }

  // Second robot state calculation (for dual path mode)
  $: {
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
      const thisDuration = getAnimationDuration(secondTimePrediction.totalTime / 1000);
      const completionPercent = (thisDuration / maxDuration) * 100;
      
      // If this path should be complete, cap at 100% (robot waits at end)
      const actualPercent = Math.min(percent, completionPercent);
      const normalizedPercent = completionPercent > 0 ? (actualPercent / completionPercent) * 100 : 0;

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
  }

  // Calculate robot states for all additional paths
  let additionalRobotStates: Array<{ xy: BasePoint; heading: number }> = [];
  $: {
    additionalRobotStates = additionalPaths.map((pathData) => {
      if (!pathData.startPoint) {
        return {
          xy: { x: 0, y: 0 },
          heading: 0,
        };
      }

      const pathTimePrediction = calculatePathTime(
        pathData.startPoint,
        pathData.lines,
        pathData.settings,
        pathData.sequence
      );
      
      if (pathTimePrediction && pathTimePrediction.timeline && pathData.lines.length > 0 && pathData.startPoint) {
        // Calculate actual percent for this path based on max duration
        const maxDuration = effectiveAnimationDuration;
        const thisDuration = getAnimationDuration(pathTimePrediction.totalTime / 1000);
        const completionPercent = (thisDuration / maxDuration) * 100;
        
        // If this path should be complete, cap at 100% (robot waits at end)
        const actualPercent = Math.min(percent, completionPercent);
        const normalizedPercent = completionPercent > 0 ? (actualPercent / completionPercent) * 100 : 0;

        const state = calculateRobotState(
          normalizedPercent,
          pathTimePrediction.timeline,
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
      }
      
      return {
        xy: { x: 0, y: 0 },
        heading: 0,
      };
    });
  }

  // Event markers removed: no runtime visualization created

  $: (() => {
    if (!two) {
      return;
    }

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
  })();
  async function saveFileAs() {
    const win: any = window as any;
    const content = JSON.stringify(
      {
        startPoint,
        lines,
        shapes,
        sequence,
        settings,
        version: "1.2.1",
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    );

    // Prefer File System Access API if available: opens native Save dialog
    if (win.showSaveFilePicker) {
      try {
        const opts = {
          suggestedName: $currentFilePath
            ? $currentFilePath.split(/[\/]/).pop()
            : "path.pp",
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
          } catch (e) {}
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
        downloadTrajectory(startPoint, lines, shapes, sequence);
      } catch (err2) {
        console.error("Save As fallback failed:", err2);
        alert(
          "Failed to save file. Your browser may not support file picker APIs.",
        );
      }
    }
  }

  function animate(timestamp: number) {
    if (!startTime) {
      startTime = timestamp;
    }

    if (previousTime !== null) {
      const deltaTime = timestamp - previousTime;
      if (percent >= 100) {
        percent = 0;
      } else {
        percent += (0.65 / lines.length) * (deltaTime * 0.1);
      }
    }

    previousTime = timestamp;

    if (playing) {
      requestAnimationFrame(animate);
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

  function resetAnimation() {
    animationController.reset();
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
      if (!id || !id.startsWith("point")) return false;
      const parts = id.split("-");
      const lineIdx = Number(parts[1]) - 1;
      if (Number.isNaN(lineIdx)) return false;
      if (lineIdx < 0) return false; // startPoint currently not lockable
      return !!lines[lineIdx]?.locked;
    };

    two.renderer.domElement.addEventListener("mousemove", (evt: MouseEvent) => {
      const elem = document.elementFromPoint(evt.clientX, evt.clientY);

      if (isDown && currentElem) {
        const parts = currentElem.split("-");
        const isPathPoint = parts[0] === "point";
        const isShapePoint = parts[0] === "shape";

        // Skip dragging locked paths
        if (isPathPoint) {
          const hitLine = Number(parts[1]) - 1;
          if (hitLine >= 0 && lines[hitLine]?.locked) return;
        }

        // Use simple bounding rect math to match D3 scales which are bound to clientWidth/Height
        const rect = two.renderer.domElement.getBoundingClientRect();
        const xPos = evt.clientX - rect.left;
        const yPos = evt.clientY - rect.top;

        // Get current store values for reactivity
        const currentGridSize = $gridSize;
        const currentSnapToGrid = $snapToGrid;
        const currentShowGrid = $showGrid;

        // Apply drag offset (in inches) to the raw mouse position
        let rawInchX = x.invert(xPos) + dragOffset.x;
        let rawInchY = y.invert(yPos) + dragOffset.y;

        let inchX = rawInchX;
        let inchY = rawInchY;

        // Always apply grid snapping when enabled
        if (currentSnapToGrid && currentShowGrid && currentGridSize > 0) {
          // Force snap to nearest grid point
          inchX = Math.round(rawInchX / currentGridSize) * currentGridSize;
          inchY = Math.round(rawInchY / currentGridSize) * currentGridSize;

          // Clamp to field boundaries
          inchX = Math.max(0, Math.min(FIELD_SIZE, inchX));
          inchY = Math.max(0, Math.min(FIELD_SIZE, inchY));
        }

        // Handle path point dragging
        if (currentElem.startsWith("obstacle-")) {
          // Handle obstacle vertex dragging
          const parts = currentElem.split("-");
          const shapeIdx = Number(parts[1]);
          const vertexIdx = Number(parts[2]);

          shapes[shapeIdx].vertices[vertexIdx].x = inchX;
          shapes[shapeIdx].vertices[vertexIdx].y = inchY;
          shapes = [...shapes];
        } else if (currentElem.startsWith("second-point-")) {
          // Handle second path point dragging
          const parts = currentElem.split("-");
          const line = Number(parts[2]) - 1;
          const point = Number(parts[3]);

          if (line === -1) {
            // This is the second starting point
            if (secondStartPoint?.locked) return;
            if (secondStartPoint) {
              secondStartPoint.x = inchX;
              secondStartPoint.y = inchY;
            }
          } else if (secondLines[line]) {
            if (point === 0 && secondLines[line].endPoint) {
              secondLines[line].endPoint.x = inchX;
              secondLines[line].endPoint.y = inchY;
            } else {
              if (secondLines[line]?.locked) return;
              secondLines[line].controlPoints[point - 1].x = inchX;
              secondLines[line].controlPoints[point - 1].y = inchY;
            }
          }
          secondLines = [...secondLines];
        } else if (currentElem.startsWith("additional-path-")) {
          // Handle additional path point dragging
          const parts = currentElem.split("-");
          const pathIdx = Number(parts[2]);
          const line = Number(parts[4]) - 1;
          const point = Number(parts[5]);

          if (!additionalPaths[pathIdx]) return;

          if (line === -1) {
            // This is the starting point
            if (additionalPaths[pathIdx].startPoint) {
              additionalPaths[pathIdx].startPoint.x = inchX;
              additionalPaths[pathIdx].startPoint.y = inchY;
              additionalPaths = [...additionalPaths];
              // Auto-save changes to additional path files
              saveAdditionalPath(pathIdx).catch(err => console.error('Failed to auto-save additional path:', err));
            }
          } else if (additionalPaths[pathIdx].lines[line]) {
            if (point === 0 && additionalPaths[pathIdx].lines[line].endPoint) {
              additionalPaths[pathIdx].lines[line].endPoint.x = inchX;
              additionalPaths[pathIdx].lines[line].endPoint.y = inchY;
            } else if (additionalPaths[pathIdx].lines[line].controlPoints[point - 1]) {
              additionalPaths[pathIdx].lines[line].controlPoints[point - 1].x = inchX;
              additionalPaths[pathIdx].lines[line].controlPoints[point - 1].y = inchY;
            }
            additionalPaths = [...additionalPaths];
          }
          // Auto-save changes to additional path files
          saveAdditionalPath(pathIdx).catch(err => console.error('Failed to auto-save additional path:', err));
        } else {
          // Handle path point dragging
          const line = Number(currentElem.split("-")[1]) - 1;
          const point = Number(currentElem.split("-")[2]);

          if (line === -1) {
            // This is the starting point
            if (startPoint.locked) return;
            startPoint.x = inchX;
            startPoint.y = inchY;
          } else if (lines[line]) {
            if (point === 0 && lines[line].endPoint) {
              lines[line].endPoint.x = inchX;
              lines[line].endPoint.y = inchY;
            } else {
              if (lines[line]?.locked) return;
              lines[line].controlPoints[point - 1].x = inchX;
              lines[line].controlPoints[point - 1].y = inchY;
            }
          }
        }
      } else {
        if (
          (elem?.id.startsWith("point") && !isLockedPathElem(elem.id)) ||
          elem?.id.startsWith("second-point") ||
          elem?.id.startsWith("additional-path-") ||
          elem?.id.startsWith("obstacle")
        ) {
          two.renderer.domElement.style.cursor = "pointer";
          currentElem = elem.id;
        } else {
          two.renderer.domElement.style.cursor = "auto";
          currentElem = null;
        }
      }
    });

    two.renderer.domElement.addEventListener("mousedown", (evt: MouseEvent) => {
      if (currentElem && isLockedPathElem(currentElem)) {
        isDown = false;
        return;
      }

      isDown = true;

      if (currentElem) {
        const rect = two.renderer.domElement.getBoundingClientRect();
        const mouseX = x.invert(evt.clientX - rect.left);
        const mouseY = y.invert(evt.clientY - rect.top);

        let objectX = 0;
        let objectY = 0;

        if (currentElem.startsWith("obstacle-")) {
          const parts = currentElem.split("-");
          const shapeIdx = Number(parts[1]);
          const vertexIdx = Number(parts[2]);
          if (shapes[shapeIdx]?.vertices[vertexIdx]) {
            objectX = shapes[shapeIdx].vertices[vertexIdx].x;
            objectY = shapes[shapeIdx].vertices[vertexIdx].y;
          }
        } else if (currentElem.startsWith("second-point-")) {
          const parts = currentElem.split("-");
          const line = Number(parts[2]) - 1;
          const point = Number(parts[3]);

          if (line === -1) {
            if (secondStartPoint) {
              objectX = secondStartPoint.x;
              objectY = secondStartPoint.y;
            }
          } else if (secondLines[line]) {
            if (point === 0 && secondLines[line].endPoint) {
              objectX = secondLines[line].endPoint.x;
              objectY = secondLines[line].endPoint.y;
            } else if (secondLines[line].controlPoints[point - 1]) {
              objectX = secondLines[line].controlPoints[point - 1].x;
              objectY = secondLines[line].controlPoints[point - 1].y;
            }
          }
        } else if (currentElem.startsWith("additional-path-")) {
          const parts = currentElem.split("-");
          const pathIdx = Number(parts[2]);
          const line = Number(parts[4]) - 1;
          const point = Number(parts[5]);

          if (additionalPaths[pathIdx]) {
            if (line === -1) {
              // Starting point
              if (additionalPaths[pathIdx].startPoint) {
                objectX = additionalPaths[pathIdx].startPoint.x;
                objectY = additionalPaths[pathIdx].startPoint.y;
              }
            } else if (additionalPaths[pathIdx].lines[line]) {
              if (point === 0 && additionalPaths[pathIdx].lines[line].endPoint) {
                objectX = additionalPaths[pathIdx].lines[line].endPoint.x;
                objectY = additionalPaths[pathIdx].lines[line].endPoint.y;
              } else if (additionalPaths[pathIdx].lines[line].controlPoints[point - 1]) {
                objectX = additionalPaths[pathIdx].lines[line].controlPoints[point - 1].x;
                objectY = additionalPaths[pathIdx].lines[line].controlPoints[point - 1].y;
              }
            }
          }
        } else {
          const line = Number(currentElem.split("-")[1]) - 1;
          const point = Number(currentElem.split("-")[2]);

          if (line === -1) {
            objectX = startPoint.x;
            objectY = startPoint.y;
          } else if (lines[line]) {
            if (point === 0 && lines[line].endPoint) {
              objectX = lines[line].endPoint.x;
              objectY = lines[line].endPoint.y;
            } else if (lines[line].controlPoints[point - 1]) {
              objectX = lines[line].controlPoints[point - 1].x;
              objectY = lines[line].controlPoints[point - 1].y;
            }
          }
        }

        dragOffset = {
          x: objectX - mouseX,
          y: objectY - mouseY,
        };
      }
    });

    two.renderer.domElement.addEventListener("mouseup", () => {
      isDown = false;
      dragOffset = { x: 0, y: 0 };
      recordChange();
    });

    // Double-click on the field to create a new path at that position
    two.renderer.domElement.addEventListener("dblclick", (evt: MouseEvent) => {
      // Ignore dblclicks on existing points/lines
      const elem = document.elementFromPoint(evt.clientX, evt.clientY);
      if (
        elem?.id &&
        (elem.id.startsWith("point") ||
          elem.id.startsWith("obstacle") ||
          elem.id.startsWith("line"))
      ) {
        return;
      }

      const rect = two.renderer.domElement.getBoundingClientRect();
      const rawInchX = x.invert(evt.clientX - rect.left);
      const rawInchY = y.invert(evt.clientY - rect.top);

      // Apply grid snapping if enabled
      const currentGridSize = $gridSize;
      const currentSnapToGrid = $snapToGrid;
      const currentShowGrid = $showGrid;

      let inchX = rawInchX;
      let inchY = rawInchY;

      if (currentSnapToGrid && currentShowGrid && currentGridSize > 0) {
        inchX = Math.round(rawInchX / currentGridSize) * currentGridSize;
        inchY = Math.round(rawInchY / currentGridSize) * currentGridSize;
      }

      // Clamp to field boundaries
      inchX = Math.max(0, Math.min(FIELD_SIZE, inchX));
      inchY = Math.max(0, Math.min(FIELD_SIZE, inchY));

      // Create a new line with endPoint at the clicked position
      const newLine: Line = {
        id: `line-${Math.random().toString(36).slice(2)}`,
        endPoint: {
          x: inchX,
          y: inchY,
          heading: "tangential",
          reverse: false,
        },
        controlPoints: [],
        color: getRandomColor(),
        locked: false,
        waitBeforeMs: 0,
        waitAfterMs: 0,
        waitBeforeName: "",
        waitAfterName: "",
      };

      lines = [...lines, newLine];
      sequence = [...sequence, { kind: "path", lineId: newLine.id! }];
      recordChange();
      two.update();
    });
  });
  document.addEventListener("keydown", function (evt) {
    if (evt.code === "Space" && document.activeElement === document.body) {
      if (playing) {
        pause();
      } else {
        play();
      }
    }
  });
  async function saveFile() {
    try {
      const content = JSON.stringify(
        {
          startPoint,
          lines,
          shapes,
          sequence,
          settings,
          version: "1.2.1",
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      );

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

  async function loadFile(evt: Event) {
    const elem = evt.target as HTMLInputElement;
    const file = elem.files?.[0];

    if (!file) return;

    // Check if file is a .pp file
    if (!file.name.endsWith(".pp")) {
      alert("Please select a .pp file");
      // Reset the file input
      elem.value = "";
      return;
    }

    // Parse and load the uploaded file, then cache it into the browser store.
    loadTrajectoryFromFile(evt, async (data) => {
      // Ensure startPoint has all required fields
      startPoint = data.startPoint || {
        x: 72,
        y: 72,
        heading: "tangential",
        reverse: false,
      };

      // Normalize lines with all required fields
      const normalizedLines = normalizeLines(data.lines || []);
      lines = normalizedLines;

      // Derive sequence from data or create default
      sequence = (
        data.sequence && data.sequence.length
          ? data.sequence
          : normalizedLines.map((ln) => ({
              kind: "path",
              lineId: ln.id!,
            }))
      ) as SequenceItem[];

      // Load shapes with defaults
      shapes = data.shapes || [];

      // Load settings (including robot size) if present
      if (data.settings) {
        settings = { ...settings, ...data.settings };
        robotWidth = settings.rWidth;
        robotHeight = settings.rHeight;
      }

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
  function loadData(data: any) {
    // Ensure startPoint has all required fields
    startPoint = data.startPoint || {
      x: 72,
      y: 72,
      heading: "tangential",
      reverse: false,
    };

    // Normalize lines with all required fields
    const normalizedLines = normalizeLines(data.lines || []);
    lines = normalizedLines;

    // Derive sequence from data or create default
    sequence = (
      data.sequence && data.sequence.length
        ? data.sequence
        : normalizedLines.map((ln) => ({
            kind: "path",
            lineId: ln.id!,
          }))
    ) as SequenceItem[];

    // Load shapes with defaults
    shapes = data.shapes || [];

    // Load settings (including robot size) if present
    if (data.settings) {
      settings = { ...settings, ...data.settings };
      robotWidth = settings.rWidth;
      robotHeight = settings.rHeight;
    }

    isUnsaved.set(false);
    recordChange();
  }

  function toHeadingDegrees(point: Point, position: "start" | "end"): number {
    if (!point) return 0;
    if (point.heading === "linear") {
      return position === "start" ? (point.startDeg ?? 0) : (point.endDeg ?? 0);
    }
    if (point.heading === "constant") {
      return point.degrees ?? 0;
    }
    return 0;
  }

  function buildOptimizationPayload(lineIndex: number) {
    const line = lines[lineIndex];
    if (!line) throw new Error("Line not found");

    const startPt =
      lineIndex === 0 ? startPoint : lines[lineIndex - 1]?.endPoint;
    if (!startPt) throw new Error("Missing start point for optimization");

    const waypoints = [startPt, ...line.controlPoints, line.endPoint].map(
      (p) => [p.x, p.y],
    );

    return {
      waypoints,
      start_heading_degrees: toHeadingDegrees(startPt, "start"),
      end_heading_degrees: toHeadingDegrees(line.endPoint, "end"),
      x_velocity: settings.xVelocity,
      y_velocity: settings.yVelocity,
      angular_velocity: settings.aVelocity,
      friction_coefficient: settings.kFriction,
      robot_width: settings.rWidth,
      robot_height: settings.rHeight,
      min_coord_field: 0,
      max_coord_field: FIELD_SIZE,
      interpolation:
        line.endPoint.heading === "tangential"
          ? "tangent"
          : line.endPoint.heading === "constant"
            ? "constant"
            : "linear",
      obstacles: shapes.map((shape) => shape.vertices.map((v) => [v.x, v.y])),
    };
  }

  function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  async function runOptimization(payload: any) {
    const response = await fetch(`${OPTIMIZER_BASE_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Optimizer request failed (${response.status}): ${errorText || response.statusText}`,
      );
    }

    const data = await response.json();
    if (data?.status === "completed" && data.result) {
      return data.result;
    }
    if (data?.status === "error") {
      throw new Error(
        `Optimization failed: ${data.message || "Unknown error"}`,
      );
    }
    throw new Error("Unexpected API response format");
  }

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
      const payload = buildOptimizationPayload(lineIndex);
      const result = await runOptimization(payload);

      const optimizedWaypoints = Array.isArray(result?.optimized_waypoints)
        ? result.optimized_waypoints
        : Array.isArray(result)
          ? result
          : null;

      if (!optimizedWaypoints || optimizedWaypoints.length < 2) {
        throw new Error("Unexpected optimizer response format.");
      }

      const interior = optimizedWaypoints
        .slice(1, optimizedWaypoints.length - 1)
        .map((p: number[]) => ({ x: p[0], y: p[1] }));

      const newLines = [...lines];
      const current = newLines[lineIndex];

      if (typeof targetControlPointIndex === "number") {
        // Only replace the targeted control point; keep others and endpoint untouched
        const replacement =
          interior[targetControlPointIndex] ?? interior[interior.length - 1];
        if (replacement) {
          const cps = [...current.controlPoints];
          if (cps[targetControlPointIndex]) {
            cps[targetControlPointIndex] = replacement;
            newLines[lineIndex] = {
              ...current,
              controlPoints: cps,
            };
            lines = normalizeLines(newLines);
            recordChange();
          }
        }
      } else {
        // Replace entire line (control points and endpoint)
        newLines[lineIndex] = {
          ...current,
          endPoint: {
            ...current.endPoint,
            x: optimizedWaypoints[optimizedWaypoints.length - 1][0],
            y: optimizedWaypoints[optimizedWaypoints.length - 1][1],
          },
          controlPoints: interior,
        };
        lines = normalizeLines(newLines);
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

  function loadRobot(evt: Event) {
    loadRobotImage(evt, () => updateRobotImageDisplay());
  }

  function addNewLine() {
    lines = [
      ...lines,
      {
        id: `line-${Math.random().toString(36).slice(2)}`,
        endPoint: {
          x: _.random(36, 108),
          y: _.random(36, 108),
          heading: "tangential",
          reverse: true,
        } as Point,
        controlPoints: [],
        color: getRandomColor(),
        locked: false,
        waitBeforeMs: 0,
        waitAfterMs: 0,
        waitBeforeName: "",
        waitAfterName: "",
      },
    ];
    sequence = [
      ...sequence,
      { kind: "path", lineId: lines[lines.length - 1].id! },
    ];
    recordChange();
  }

  function addControlPoint() {
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      lastLine.controlPoints.push({
        x: _.random(36, 108),
        y: _.random(36, 108),
      });
      recordChange();
    }
  }

  function removeControlPoint() {
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      if (lastLine.controlPoints.length > 0) {
        lastLine.controlPoints.pop();
        recordChange();
      }
    }
  }

  // Keyboard shortcuts for quick path editing
  hotkeys("w", function (event, handler) {
    event.preventDefault();
    addNewLine();
  });
  hotkeys("a", function (event, handler) {
    event.preventDefault();
    addControlPoint();
    two.update();
  });
  hotkeys("s", function (event, handler) {
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
  function applyTheme(theme: "light" | "dark" | "auto") {
    let actualTheme = theme;
    if (theme === "auto") {
      // Check system preference
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        actualTheme = "dark";
      } else {
        actualTheme = "light";
      }
    }

    if (actualTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  // Watch for theme changes in settings
  $: if (settings) {
    applyTheme(settings.theme);
  }

  // Watch for system theme changes if auto mode is enabled
  let mediaQuery: MediaQueryList;
  onMount(() => {
    if (settings?.theme === "auto") {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleSystemThemeChange = () => {
        if (settings.theme === "auto") {
          applyTheme("auto");
        }
      };
      mediaQuery.addEventListener("change", handleSystemThemeChange);

      return () => {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      };
    }
  });

  // Auto-export for CI/testing: if the app is loaded with URL hash #export-gif-test, automatically run GIF export once mounted
  onMount(() => {
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
        const fullFileName = fileName.endsWith(".pp") ? fileName : fileName + ".pp";
        
        // Call the file manager's save function through the browser file store
        const fileData = JSON.stringify({
          startPoint,
          lines,
          shapes,
          sequence,
          settings,
        });
        
        await browserFileStore.writeFile(fullFileName, fileData);
        currentFilePath.set(fullFileName);
        isUnsaved.set(false);
        
        // Show success feedback
        showSaveDialog = false;
      } catch (error) {
        console.error("Save failed:", error);
        alert("Failed to save file: " + (error instanceof Error ? error.message : String(error)));
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
        if (target === "first" && $currentFilePath) {
          const fileData = JSON.stringify({
            startPoint,
            lines,
            shapes,
            sequence,
            settings,
            version: "1.2.1",
            timestamp: new Date().toISOString(),
          });
          await browserFileStore.writeFile($currentFilePath, fileData);
          isUnsaved.set(false);
        } else if (target === "second" && $secondFilePath) {
          const fileData = JSON.stringify({
            startPoint: secondStartPoint,
            lines: secondLines,
            shapes: secondShapes,
            sequence: secondSequence,
            settings,
            version: "1.2.1",
            timestamp: new Date().toISOString(),
          });
          await browserFileStore.writeFile($secondFilePath, fileData);
        } else if (target === "both") {
          // Save first path
          if ($currentFilePath) {
            const fileData1 = JSON.stringify({
              startPoint,
              lines,
              shapes,
              sequence,
              settings,
              version: "1.2.1",
              timestamp: new Date().toISOString(),
            });
            await browserFileStore.writeFile($currentFilePath, fileData1);
          }
          // Save second path
          if ($secondFilePath) {
            const fileData2 = JSON.stringify({
              startPoint: secondStartPoint,
              lines: secondLines,
              shapes: secondShapes,
              sequence: secondSequence,
              settings,
              version: "1.2.1",
              timestamp: new Date().toISOString(),
            });
            await browserFileStore.writeFile($secondFilePath, fileData2);
          }
          isUnsaved.set(false);
        }
        showDualPathSaveDialog = false;
      } catch (error) {
        console.error("Dual path save failed:", error);
        alert("Failed to save: " + (error instanceof Error ? error.message : String(error)));
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
</script>

<Navbar
  bind:lines
  bind:startPoint
  bind:shapes
  bind:sequence
  bind:secondStartPoint
  bind:secondLines
  bind:secondShapes
  bind:secondSequence
  bind:settings
  bind:robotWidth
  bind:robotHeight
  {percent}
  {saveProject}
  {saveFileAs}
  {loadFile}
  {undoAction}
  {redoAction}
  {recordChange}
  {canUndo}
  {canRedo}
  {optimizeAllLines}
  {optimizingAll}
  {twoElement}
  bind:playing
  {play}
  {pause}
/>

<SaveDialog
  bind:isOpen={showSaveDialog}
  bind:isSaving
  fileName={$currentFilePath?.split(/[\\/]/).pop()?.replace(/\.pp$/, "") || "my_path"}
/>

<DualPathSaveDialog bind:isOpen={showDualPathSaveDialog} />

<!--   {saveFile} -->
<div
  class="w-screen h-screen pt-20 p-2 flex flex-row justify-center items-center gap-2"
>
  <div class="flex h-full justify-center items-center">
    <div
      bind:this={twoElement}
      bind:clientWidth={width}
      bind:clientHeight={height}
      class="h-full aspect-square rounded-lg shadow-md bg-neutral-50 dark:bg-neutral-900 relative overflow-clip"
      role="application"
      style="
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    user-drag: none;
    -webkit-user-drag: none;
    -khtml-user-drag: none;
    -moz-user-drag: none;
    -ms-user-drag: none;
    -o-user-drag: none;
  "
      on:contextmenu={(e) => e.preventDefault()}
      on:dragstart={(e) => e.preventDefault()}
      on:selectstart={(e) => e.preventDefault()}
      tabindex="-1"
    >
      <img
        src={settings.fieldMap
          ? `/fields/${settings.fieldMap}`
          : "/fields/decode.webp"}
        alt="Field"
        class="absolute top-0 left-0 w-full h-full rounded-lg z-10"
        style="
    background: transparent; 
    pointer-events: none; 
    user-select: none; 
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    user-drag: none;
    -webkit-user-drag: none;
    -moz-user-drag: none;
    -ms-user-drag: none;
    -o-user-drag: none;
  "
        draggable="false"
        on:error={(e) => {
          console.error("Failed to load field map:", settings.fieldMap);
          e.target.src = "/fields/decode.webp"; // Fallback
        }}
        on:dragstart={(e) => e.preventDefault()}
        on:selectstart={(e) => e.preventDefault()}
      />
      <MathTools {x} {y} {twoElement} {robotXY} {robotHeading} />
      <!-- Main robot: only show in normal mode -->
      {#if $activePaths.length === 0}
        <img
          src={settings.robotImage || "/robot.png"}
          alt="Robot"
          style={`position: absolute; top: ${robotXY.y}px;
left: ${robotXY.x}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${x(robotWidth)}px; height: ${x(robotHeight)}px;user-select: none; -webkit-user-select: none; -moz-user-select: none;-ms-user-select: none;
pointer-events: none;`}
          draggable="false"
          on:error={(e) => {
            console.error("Failed to load robot image:", settings.robotImage);
            e.target.src = "/robot.png"; // Fallback to default
          }}
          on:dragstart={(e) => e.preventDefault()}
          on:selectstart={(e) => e.preventDefault()}
        />
      {/if}
      <!-- Second robot: only show in dual path mode (not multi-path mode) -->
      {#if $activePaths.length === 0 && $dualPathMode}
        <img
          src={settings.robotImage || "/robot.png"}
          alt="Robot 2"
          style={`position: absolute; top: ${secondRobotXY.y}px;
left: ${secondRobotXY.x}px; transform: translate(-50%, -50%) rotate(${secondRobotHeading}deg); z-index: 19; width: ${x(robotWidth)}px; height: ${x(robotHeight)}px;user-select: none; -webkit-user-select: none; -moz-user-select: none;-ms-user-select: none;
pointer-events: none; opacity: 0.8;`}
          draggable="false"
          on:error={(e) => {
            console.error("Failed to load robot image:", settings.robotImage);
            e.target.src = "/robot.png";
          }}
          on:dragstart={(e) => e.preventDefault()}
          on:selectstart={(e) => e.preventDefault()}
        />
      {/if}
      <!-- Additional robots: only show in multi-path mode -->
      {#if $activePaths.length > 0}
        {#each additionalRobotStates as robotState, idx}
          <img
            src={settings.robotImage || "/robot.png"}
            alt="Robot {idx + 1}"
            style={`position: absolute; top: ${robotState.xy.y}px;
left: ${robotState.xy.x}px; transform: translate(-50%, -50%) rotate(${robotState.heading}deg); z-index: ${20 - idx}; width: ${x(robotWidth)}px; height: ${x(robotHeight)}px;user-select: none; -webkit-user-select: none; -moz-user-select: none;-ms-user-select: none;
pointer-events: none; opacity: ${1.0 - idx * 0.15};`}
            draggable="false"
            on:error={(e) => {
              console.error("Failed to load robot image:", settings.robotImage);
              e.target.src = "/robot.png";
            }}
            on:dragstart={(e) => e.preventDefault()}
            on:selectstart={(e) => e.preventDefault()}
          />
        {/each}
      {/if}
    </div>
  </div>
  <ControlTab
    bind:playing
    {play}
    {pause}
    bind:startPoint
    bind:lines
    bind:sequence
    bind:robotWidth
    bind:robotHeight
    bind:settings
    bind:percent
    bind:robotXY
    bind:robotHeading
    bind:shapes
    {x}
    {y}
    {animationDuration}
    {handleSeek}
    bind:loopAnimation
    {resetAnimation}
    {recordChange}
    {optimizeLine}
    {optimizingLineIds}
    {optimizeAllLines}
    {optimizingAll}
  />
</div>
