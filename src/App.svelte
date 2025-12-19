<script lang="ts">
// Vite static asset import for gif.worker.js
// @ts-ignore
import workerUrl from './workers/gif.worker.js?url';
let isGifExporting = false;
// Map playbar percent (including waits) to robotPercent and wait state
import { getRobotPercentAndWait } from './utils';

const trailSteps = 20;
const MAX_HISTORY = 100;
let lastSavedState = '';
let currentHash = '';
let isUndoRedo = false;
let canUndo = false;
let canRedo = false;
let comparisonMode = false;

// Multi-path management functions
function getStateHash() {
  try {
    return JSON.stringify({ startPoint, lines });
  } catch (e) {
    return '';
  }
}

function deepClone(obj: any) {
  return JSON.parse(JSON.stringify(obj));
}

function saveToHistory() {
  const hash = getStateHash();
  if (hash === lastSavedState) return;
  undoStack = [...undoStack, { startPoint: deepClone(startPoint), lines: deepClone(lines) }];
  if (undoStack.length > MAX_HISTORY) undoStack = undoStack.slice(-MAX_HISTORY);
  redoStack = [];
  lastSavedState = hash;
}

let paths: RobotPath[] = [];
let activePathIndex: number = 0;

function loadActivePathToLegacy() {
  // Ensure there's at least one path stored
  if (!paths || paths.length === 0) {
    const newColor = getRandomColor();
    paths = [
      {
        id: `path-${Date.now()}`,
        name: "Path 1",
        color: newColor,
          startPoint: { ...deepClone(startPoint), color: newColor },
        lines: deepClone(lines).map((l: Line) => ({ ...l, color: newColor })),
        visible: true,
      },
    ];
    activePathIndex = 0;
  }

  const p = paths[activePathIndex];
  if (!p) return;

  // Load the path into the editing (legacy) variables
  startPoint = deepClone(p.startPoint);
  lines = deepClone(p.lines).map((l: Line) => ({ ...l, color: l.color ?? p.color }));
  // Sanitize loaded data to ensure coordinates are within bounds
  sanitizePoint(startPoint);
  sanitizeLines(lines);
}

function syncPathFromLegacy() {
  // Save current editing state into the active stored path
  if (!paths || paths.length === 0) return;
  const idx = activePathIndex;
  if (idx < 0 || idx >= paths.length) return;
  const sp = deepClone(startPoint);
  const ln = deepClone(lines).map((l: Line) => ({ ...l, color: l.color ?? paths[idx].color }));
  // Sanitize before storing
  sanitizePoint(sp);
  sanitizeLines(ln);
  paths[idx].startPoint = sp;
  // Do not automatically overwrite stored per-path robot sizes here; sizes are edited in the paths manager
  paths[idx].lines = ln;
  paths = paths; // trigger reactivity
}

function addNewPath() {
  const newColor = getRandomColor();
  const newPath: RobotPath = {
    id: `path-${Date.now()}`,
    name: `Path ${paths.length + 1}`,
    color: newColor,
    // Create a blank default path (do NOT clone the previous path)
    // Provide one minimal line so the path has at least one segment (prevents division by zero)
    startPoint: { x: 56, y: 8, heading: "linear", startDeg: 90, endDeg: 180, color: newColor },
    lines: [
      {
        endPoint: { x: 56, y: 36, heading: "linear", startDeg: 90, endDeg: 180 },
        controlPoints: [],
        color: newColor,
      },
    ],
    robotWidth: robotWidth,
    robotHeight: robotHeight,
    visible: true,
  };
  paths = [...paths, newPath];
  activePathIndex = paths.length - 1;
  loadActivePathToLegacy();
  saveToHistory();
}
  import * as d3 from "d3";
  import { onMount } from "svelte";
  import Two from "two.js";
  import type { Path } from "two.js/src/path";
  import type { Line as PathLine } from "two.js/src/shapes/line";
  import ControlTab from "./lib/ControlTab.svelte";
  import Navbar from "./lib/Navbar.svelte";
  import MathTools from "./lib/MathTools.svelte";
  import _ from "lodash";
  import {
    easeInOutQuad,
    getCurvePoint,
    getMousePos,
    getRandomColor,
    quadraticToCubic,
    radiansToDegrees,
    shortestRotation,
  } from "./utils";
  import hotkeys from 'hotkeys-js';
  import { clickToPlaceMode, centerLineWarningEnabled, collisionNextSegmentOnly, showCornerDots, colliderTrailColorMode, showRobotCollisionOverlays, showRobotLiveCoordinates, showRobotOriginToCornerLines, showRobotColliderEdges } from "./stores";
  import { showAllCollisions } from "./stores";
  import { collisionBoxColor, robotCollisionColor } from "./stores";
  import { get } from 'svelte/store';
  import html2canvas from "html2canvas";
  import GIF from "gif.js";

  let two: Two;
  let twoElement: HTMLDivElement;
  let fieldContainer: HTMLDivElement;

  let pointRadius = 1.15;
  // Reduce displayed path segment thickness by 25% (user request)
  // Original base was 0.57, apply 0.75 multiplier to make lines 25% thinner.
  let lineWidth = 0.57 * 0.75;
  let robotWidth = 16;
  let robotHeight = 16;
  let settings: FPASettings = {
    xVelocity: 60,
    yVelocity: 60,
    aVelocity: Math.PI,
    kFriction: 0.05,
    rWidth: robotWidth,
    rHeight: robotHeight
  };

  let percent: number = 0;
  let playbackSpeed: number = 1; // Animation speed multiplier (0.25x to 3x)

  function hexToRgba(hex: string, alpha: number) {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const normalized = hex.replace('#', '');
    const bigint = parseInt(normalized, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Compute a path's natural duration (movement + waits) in ms using existing motion formula
  function computePathDurationMs(pd: RobotPath) {
    const totalWait = (pd.lines || []).reduce((s, l) => s + (l.waitTime || 0), 0);
    const baseMovement = (100 * ((pd.lines || []).length)) / 0.065;
    return baseMovement + (totalWait * 1000);
  }

  // Helper to clamp coordinates to field bounds used by the UI
  function clampXY(xv: number, yv: number) {
    const cx = Math.max(1, Math.min(143, xv));
    const cy = Math.max(3, Math.min(143, yv));
    return { x: cx, y: cy };
  }

  // Sanitize a single point-like object (ensure numeric and clamped)
  function sanitizePoint(pt: any) {
    if (!pt || typeof pt !== 'object') return pt;
    const nx = Number(pt.x);
    const ny = Number(pt.y);
    const clamped = clampXY(isNaN(nx) ? 1 : nx, isNaN(ny) ? 3 : ny);
    pt.x = clamped.x;
    pt.y = clamped.y;
    return pt;
  }

  // Sanitize an array of lines (endPoint and controlPoints)
  function sanitizeLines(linesArr: any[]) {
    if (!Array.isArray(linesArr)) return [];
    for (const ln of linesArr) {
      if (ln && ln.endPoint) sanitizePoint(ln.endPoint);
      if (Array.isArray(ln.controlPoints)) {
        for (const cp of ln.controlPoints) {
          sanitizePoint(cp);
        }
      }
    }
    return linesArr;
  }

  // Sanitize a RobotPath-like object in place
  function sanitizePathObject(pd: any) {
    if (!pd) return pd;
    if (pd.startPoint) sanitizePoint(pd.startPoint);
    if (pd.lines) sanitizeLines(pd.lines);
    return pd;
  }

  // Given a global playbar percent (0-100), compute the robotPercent (0-100) for a specific path
  // This maps the global timeline to a per-path playbar that never stretches the path motion,
  // and then uses the existing getRobotPercentAndWait() to produce the robotPercent used by motion logic.
  function computePathRobotPercentForGlobal(pd: RobotPath, globalPlaybarPercent: number) {
    const pathDurationMs = computePathDurationMs(pd);
    const maxPathDurMs = Math.max(...paths.map((pp) => computePathDurationMs(pp)));
    const targetDurationMs = Math.min(maxPathDurMs, 30000);
    const globalElapsedMs = (globalPlaybarPercent / 100) * targetDurationMs;
    const elapsedForPathMs = Math.min(globalElapsedMs, pathDurationMs);
    const playbarPercentForPath = pathDurationMs > 0 ? (elapsedForPathMs / pathDurationMs) * 100 : 100;
    const { robotPercent: rp } = getRobotPercentAndWait(playbarPercentForPath, pd.lines || []);
    return rp;
  }

  /**
   * Converter for X axis from inches to pixels.
   */
  $: x = d3
    .scaleLinear()
    .domain([0, 144])
    .range([0, twoElement?.clientWidth ?? 144]);

  /**
   * Converter for Y axis from inches to pixels.
   */
  $: y = d3
    .scaleLinear()
    .domain([0, 144])
    .range([twoElement?.clientHeight ?? 144, 0]);

  let lineGroup = new Two.Group();
  lineGroup.id = "line-group";
  let pointGroup = new Two.Group();
  pointGroup.id = "point-group";
  let shapeGroup = new Two.Group();
  shapeGroup.id = "shape-group";

  let startPoint: Point = {
    x: 56,
    y: 8,
    heading: "linear",
    startDeg: 90,
    endDeg: 180
  };
  let lines: Line[] = [

    {
      name: "Path 1",
      endPoint: { x: 56, y: 36, heading: "linear", startDeg: 90, endDeg: 180 },
      controlPoints: [],
      color: getRandomColor(),
    },
  ];

// Ensure lines is always an array
if (!Array.isArray(lines)) lines = [];

  
  function deletePath(index: number) {
    if (paths.length <= 1) return; // Keep at least one path
    paths = paths.filter((_, i) => i !== index);
    if (activePathIndex >= paths.length) {
      activePathIndex = paths.length - 1;
    }
    loadActivePathToLegacy();
    saveToHistory();
  }
  
  function duplicatePath(index: number) {
    const original = paths[index];
    const newColor = getRandomColor();
    const newPath: RobotPath = {
      id: `path-${Date.now()}`,
      name: `${original.name} (copy)`,
      color: newColor,
      startPoint: JSON.parse(JSON.stringify(original.startPoint)),
      lines: JSON.parse(JSON.stringify(original.lines)).map((l: Line) => ({ ...l, color: newColor })),
      visible: true,
    };
    // Sanitize duplicated path before storing
    sanitizePathObject(newPath);
    paths = [...paths, newPath];
    activePathIndex = paths.length - 1;
    loadActivePathToLegacy();
    saveToHistory();
  }
  
  function setActivePath(index: number) {
    syncPathFromLegacy(); // Save current path first
    activePathIndex = index;
    loadActivePathToLegacy(); // Load the new path's data
  }

  // Note: per-path robot sizes are edited directly in the Paths manager UI; do not sync editor size automatically.
  
  function togglePathVisibility(index: number) {
    paths[index].visible = !paths[index].visible;
    paths = paths; // trigger reactivity
  }
  
  function renamePathPrompt(index: number) {
    const newName = prompt('Enter new path name:', paths[index].name);
    if (newName && newName.trim()) {
      paths[index].name = newName.trim();
      paths = paths;
    }
  }
  
  function changePathColor(index: number, newColor: string) {
    paths[index].color = newColor;
    // Also update all line colors in that path
    paths[index].lines = paths[index].lines.map(line => ({ ...line, color: newColor }));
    paths = paths; // trigger reactivity
    // If this is the active path, sync to lines
    if (index === activePathIndex) {
      lines = lines.map(line => ({ ...line, color: newColor }));
    }
  }

  // Helper to handle color input events (avoid inline TS casts in template)
  function changePathColorFromEvent(index: number, e: Event) {
    const target = e.target as HTMLInputElement | null;
    if (!target) return;
    changePathColor(index, target.value);
  }

  // Helpers to update per-path robot sizes from template events without inline TS casts
  function updatePathRobotWidth(index: number, e: Event) {
    const target = e.target as HTMLInputElement | null;
    if (!target) return;
    const v = Number(target.value);
    paths[index].robotWidth = isNaN(v) ? robotWidth : v;
    paths = paths;
  }

  function updatePathRobotHeight(index: number, e: Event) {
    const target = e.target as HTMLInputElement | null;
    if (!target) return;
    const v = Number(target.value);
    paths[index].robotHeight = isNaN(v) ? robotHeight : v;
    paths = paths;
  }

  // Per-path sizes are edited directly in the UI; no lock/unlock helper is required.

  // Convex hull algorithm (Graham scan) for collision boundary
  function computeConvexHull(points: BasePoint[]): BasePoint[] {
    if (points.length < 3) return points;
    
    // Find the point with lowest y (and leftmost if tie)
    let start = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].y < points[start].y || 
          (points[i].y === points[start].y && points[i].x < points[start].x)) {
        start = i;
      }
    }
    
    const pivot = points[start];
    
    // Sort points by polar angle with respect to pivot
    const sorted = points
      .filter((_, i) => i !== start)
      .map(p => ({
        point: p,
        angle: Math.atan2(p.y - pivot.y, p.x - pivot.x),
        dist: Math.hypot(p.x - pivot.x, p.y - pivot.y)
      }))
      .sort((a, b) => a.angle - b.angle || a.dist - b.dist)
      .map(p => p.point);
    
    // Cross product to determine turn direction
    const cross = (o: BasePoint, a: BasePoint, b: BasePoint) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    
    const hull: BasePoint[] = [pivot];
    
    for (const p of sorted) {
      while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
        hull.pop();
      }
      hull.push(p);
    }
    
    return hull;
  }

  // Undo/Redo History System
  interface HistoryState {
    startPoint: Point;
    lines: Line[];
  }
  
  let undoStack: HistoryState[] = [];
  let redoStack: HistoryState[] = [];
                      // ...existing code...
    if (undoStack.length > MAX_HISTORY) {
      undoStack = undoStack.slice(1);
    }
    
    // Clear redo stack when new action is performed
    redoStack = [];
    lastSavedState = currentHash;

  
  function undo() {
    if (undoStack.length === 0) return;
    
    // Save current state to redo stack
    const currentState = {
      startPoint: deepClone(startPoint),
      lines: deepClone(lines)
    };
    redoStack = [...redoStack, currentState];
    
    // Restore previous state
    const prevState = undoStack[undoStack.length - 1];
    undoStack = undoStack.slice(0, -1);
    
    isUndoRedo = true;
    startPoint = deepClone(prevState.startPoint);
    lines = deepClone(prevState.lines);
    // Sanitize restored state
    sanitizePoint(startPoint);
    sanitizeLines(lines);
    lastSavedState = getStateHash();
    isUndoRedo = false;
  }
  
  function redo() {
    if (redoStack.length === 0) return;
    
    // Save current state to undo stack
    const currentState = {
      startPoint: deepClone(startPoint),
      lines: deepClone(lines)
    };
    undoStack = [...undoStack, currentState];
    
    // Restore next state
    const nextState = redoStack[redoStack.length - 1];
    redoStack = redoStack.slice(0, -1);
    
    isUndoRedo = true;
    startPoint = deepClone(nextState.startPoint);
    lines = deepClone(nextState.lines);
    // Sanitize restored state
    sanitizePoint(startPoint);
    sanitizeLines(lines);
    lastSavedState = getStateHash();
    isUndoRedo = false;
  }
  
  // Track pointer/mouse up to save state after drag operations
  function onPointerUp() {
    if (!isUndoRedo) {
      saveToHistory();
    }
  }
  
  // Save initial state
  onMount(() => {
    lastSavedState = getStateHash();
    saveToHistory();
    // Ensure multi-path storage is initialized from current editing state
    loadActivePathToLegacy();
    
    // Listen for pointer up globally to catch end of drag operations
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('mouseup', onPointerUp);
    
    return () => {
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mouseup', onPointerUp);
    };
  });

  // Helper function to get robot's 4 corners given center position, size, and rotation angle (in degrees)
  // Helper function to get robot's 4 corners given center position, size, and rotation angle (in degrees)
  // Compute robot corners by taking center point, length, width, and rotation.
  // length: robot front-to-back size (inches)
  // width: robot side-to-side size (inches)
  function getRobotCorners(centerX: number, centerY: number, length: number, width: number, angleDeg: number): BasePoint[] {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const halfL = length / 2;
    const halfW = width / 2;

    // Local coordinates of corners (relative to robot center, before rotation)
    // Order: front-left, front-right, back-right, back-left
    const cornersLocal = [
      { x: halfL, y: -halfW }, // front-left (forward is +x)
      { x: halfL, y: halfW },  // front-right
      { x: -halfL, y: halfW }, // back-right
      { x: -halfL, y: -halfW } // back-left
    ];

    return cornersLocal.map((c) => ({
      x: centerX + c.x * cos - c.y * sin,
      y: centerY + c.x * sin + c.y * cos,
    }));
  }

  // Calculate heading at a given point along the path
  function getHeadingAtPoint(lineIdx: number, t: number): number {
    const line = lines[lineIdx];
    const _startPoint = lineIdx === 0 ? startPoint : lines[lineIdx - 1].endPoint;
    
    switch (line.endPoint.heading) {
      case "linear":
        return -shortestRotation(
          line.endPoint.startDeg ?? 0,
          line.endPoint.endDeg ?? 0,
          t
        );
      case "constant":
        return -(line.endPoint.degrees ?? 0);
      case "tangential":
        const curvePoints = [_startPoint, ...line.controlPoints, line.endPoint];
        const currentPt = getCurvePoint(t, curvePoints);
        const nextT = t + (line.endPoint.reverse ? -0.01 : 0.01);
        const nextPt = getCurvePoint(Math.max(0, Math.min(1, nextT)), curvePoints);
        const dx = nextPt.x - currentPt.x;
        const dy = nextPt.y - currentPt.y;
        if (dx !== 0 || dy !== 0) {
          return -radiansToDegrees(Math.atan2(dy, dx));
        }
        
        return 0;
      default:
        return 0;
    }
  }

  // Calculate heading at a given point for any path (used in comparison mode)
  function getHeadingAtPointForPath(pathLines: Line[], pathStart: Point, lineIdx: number, t: number): number {
    const line = pathLines[lineIdx];
    const _startPoint = lineIdx === 0 ? pathStart : pathLines[lineIdx - 1].endPoint;
    
    switch (line.endPoint.heading) {
      case "linear":
        return -shortestRotation(
          line.endPoint.startDeg ?? 0,
          line.endPoint.endDeg ?? 0,
          t
        );
      case "constant":
        return -(line.endPoint.degrees ?? 0);
      case "tangential":
        const curvePoints = [_startPoint, ...line.controlPoints, line.endPoint];
        const currentPt = getCurvePoint(t, curvePoints);
        const nextT = t + (line.endPoint.reverse ? -0.01 : 0.01);
        const nextPt = getCurvePoint(Math.max(0, Math.min(1, nextT)), curvePoints);
        const dx = nextPt.x - currentPt.x;
        const dy = nextPt.y - currentPt.y;
        if (dx !== 0 || dy !== 0) {
          return -radiansToDegrees(Math.atan2(dy, dx));
        }
        return 0;
      default:
        return 0;
    }
  }


  // Center line crossing detection (robot corners)
  // Precompute if any part of the path ever crosses the center line
  $: centerLineWarning = (() => {
    if (!$centerLineWarningEnabled) return false;
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const percent = (i / steps) * 100;
      // Find robot position/heading at this percent
      let totalLineProgress = (lines.length * Math.min(percent, 99.999999999)) / 100;
      let currentLineIdx = Math.min(Math.trunc(totalLineProgress), lines.length - 1);
      let currentLine = lines[currentLineIdx];
      let linePercent = easeInOutQuad(totalLineProgress - Math.floor(totalLineProgress));
      let _startPoint = currentLineIdx === 0 ? startPoint : lines[currentLineIdx - 1].endPoint;
      let robotInchesXY = getCurvePoint(linePercent, [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]);
      let heading = 0;
      switch (currentLine.endPoint.heading) {
        case "linear":
          heading = -shortestRotation(currentLine.endPoint.startDeg ?? 0, currentLine.endPoint.endDeg ?? 0, linePercent);
          break;
        case "constant":
          heading = -(currentLine.endPoint.degrees ?? 0);
          break;
        case "tangential":
          const nextPointInches = getCurvePoint(linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01), [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]);
          const dx = nextPointInches.x - robotInchesXY.x;
          const dy = nextPointInches.y - robotInchesXY.y;
          if (dx !== 0 || dy !== 0) {
            heading = -radiansToDegrees(Math.atan2(dy, dx));
          }
          break;
      }
      const corners = getRobotCorners(robotInchesXY.x, robotInchesXY.y, robotWidth, robotHeight, heading);
      let left = false, right = false;
      for (const c of corners) {
        if (c.x < 72) left = true;
        if (c.x > 72) right = true;
      }
      if (left && right) return true;
    }
    return false;
  })();

  $: points = (() => {
    let _points = [];
    let startPointElem = new Two.Circle(
      x(startPoint.x),
      y(startPoint.y),
      x(pointRadius)
    );
    startPointElem.id = `point-0-0`;
    startPointElem.fill = startPoint.color ?? lines[0]?.color ?? "#000";
    startPointElem.noStroke();

    _points.push(startPointElem);

    lines.forEach((line, idx) => {
      [line.endPoint, ...line.controlPoints].forEach((point, idx1) => {
          if (idx1 > 0) {
          let pointGroup = new Two.Group();
          pointGroup.id = `point-${idx + 1}-${idx1}`;

          let pointElem = new Two.Circle(
            x(point.x),
            y(point.y),
            x(pointRadius)
          );
          pointElem.id = `point-${idx + 1}-${idx1}-background`;
          pointElem.fill = (point as any).color ?? line.color;
          pointElem.noStroke();

          let pointText = new Two.Text(
            `${idx1}`,
            x(point.x),
            y(point.y - 0.15),
            x(pointRadius)
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
            x(pointRadius)
          );
          pointElem.id = `point-${idx + 1}-${idx1}`;
            pointElem.fill = (point as any).color ?? line.color;
          pointElem.noStroke();
          _points.push(pointElem);
        }
        
      });
    });

    return _points;
  })();

  $: path = (() => {
    let _path: (Path | PathLine)[] = [];

    lines.forEach((line, idx) => {
      let _startPoint = idx === 0 ? startPoint : lines[idx - 1].endPoint;

      let lineElem: Path | PathLine;
      if (line.controlPoints.length > 2) {
        // Approximate an n-degree bezier curve by sampling it at 100 points
        const samples = 100;
        const cps = [_startPoint, ...line.controlPoints, line.endPoint];
        let points = [new Two.Anchor(x(_startPoint.x), y(_startPoint.y), 0, 0, 0, 0, Two.Commands.move)];
        for (let i = 1; i <= samples; ++i) {
          const point = getCurvePoint(i / samples, cps);
          points.push(new Two.Anchor(x(point.x), y(point.y), 0, 0, 0, 0, Two.Commands.line));
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
            Two.Commands.move
          ),
          new Two.Anchor(
            x(line.endPoint.x),
            y(line.endPoint.y),
            x(cp2.x),
            y(cp2.y),
            x(line.endPoint.x),
            y(line.endPoint.y),
            Two.Commands.curve
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
          y(line.endPoint.y)
        );
      }

      lineElem.id = `line-${idx + 1}`;
      lineElem.stroke = line.color;
      lineElem.linewidth = x(lineWidth);
      lineElem.noFill();

      _path.push(lineElem);
    });

    return _path;
  })();

  interface CollisionBox {
    x: number;
    y: number;
    heading: number;
    length: number; // front-back
    width: number;  // side-side
    color: string;
  }

  let robotXY: BasePoint = { x: 0, y: 0 };
  let robotHeading: number = 0;
  let robotPercent: number = 0; // Separate percent for robot position (pauses during waits)

  $: {
    // Use robotPercent for robot position (pauses during waits)
    // Use percent for progress bar/stopwatch (always advancing)
    const effectivePercent = typeof robotPercent !== 'undefined' ? robotPercent : percent;
    let totalLineProgress = (lines.length * Math.min(effectivePercent, 99.999999999)) / 100;
    let currentLineIdx = Math.min(Math.trunc(totalLineProgress), lines.length - 1);
    let currentLine = lines[currentLineIdx];

    let linePercent = easeInOutQuad(totalLineProgress - Math.floor(totalLineProgress));
    let _startPoint = currentLineIdx === 0 ? startPoint : lines[currentLineIdx - 1].endPoint;
    let robotInchesXY = getCurvePoint(linePercent, [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]);
    robotXY = { x: x(robotInchesXY.x), y: y(robotInchesXY.y) };

    switch (currentLine.endPoint.heading) {
      case "linear":
        robotHeading = -shortestRotation(
          currentLine.endPoint.startDeg,
          currentLine.endPoint.endDeg,
          linePercent
        );
        break;
      case "constant":
        robotHeading = -currentLine.endPoint.degrees;
        break;
      case "tangential":
        const nextPointInches = getCurvePoint(
          linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01),
          [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]
        );
        const nextPoint = { x: x(nextPointInches.x), y: y(nextPointInches.y) };

        const dx = nextPoint.x - robotXY.x;
        const dy = nextPoint.y - robotXY.y;

        if (dx !== 0 || dy !== 0) {
          const angle = Math.atan2(dy, dx);

          robotHeading = -radiansToDegrees(angle);
        }

        break;
    }
  }

  // Helper function to calculate robot position for any path (used in comparison mode)
  function getPathRobotPosition(pathData: RobotPath, currentPercent: number): { x: number; y: number; heading: number } {
    const pathLines = pathData.lines;
    const pathStart = pathData.startPoint;
    
    if (pathLines.length === 0) {
      return { x: x(pathStart.x), y: y(pathStart.y), heading: 0 };
    }
    
    const effectivePercent = Math.min(currentPercent, 99.999999999);
    let totalLineProgress = (pathLines.length * effectivePercent) / 100;
    let currentLineIdx = Math.min(Math.trunc(totalLineProgress), pathLines.length - 1);
    let currentLine = pathLines[currentLineIdx];

    let linePercent = easeInOutQuad(totalLineProgress - Math.floor(totalLineProgress));
    let _startPoint = currentLineIdx === 0 ? pathStart : pathLines[currentLineIdx - 1].endPoint;
    let robotInchesXY = getCurvePoint(linePercent, [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]);
    let posX = x(robotInchesXY.x);
    let posY = y(robotInchesXY.y);
    let heading = 0;

    switch (currentLine.endPoint.heading) {
      case "linear":
        heading = -shortestRotation(
          currentLine.endPoint.startDeg ?? 0,
          currentLine.endPoint.endDeg ?? 0,
          linePercent
        );
        break;
      case "constant":
        heading = -(currentLine.endPoint.degrees ?? 0);
        break;
      case "tangential":
        const nextPointInches = getCurvePoint(
          linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01),
          [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]
        );
        const nextPoint = { x: x(nextPointInches.x), y: y(nextPointInches.y) };
        const dx = nextPoint.x - posX;
        const dy = nextPoint.y - posY;
        if (dx !== 0 || dy !== 0) {
          heading = -radiansToDegrees(Math.atan2(dy, dx));
        }
        break;
    }

    return { x: posX, y: posY, heading };
  }

  function drawScene(
    twoInstance: Two,
    percentArg: number,
    robotPercentArg: number,
    x: d3.ScaleLinear<number, number, number>,
    y: d3.ScaleLinear<number, number, number>,
    robotXY: BasePoint,
    robotHeading: number,
    comparisonMode: boolean,
    paths: RobotPath[],
    activePathIndex: number,
    path: (Path | PathLine)[],
    points: any[],
    startPoint: Point,
    lines: Line[],
    lineWidth: number,
    pointRadius: number,
    robotWidth: number,
    robotHeight: number,
    $showAllCollisions: boolean,
    $collisionNextSegmentOnly: boolean
  ) {
    // computePathDurationMs is defined at top-level; use that to keep logic consistent
    // Determine the active path's stored robot size (if any) so collisions and image match
    const activeRobotW = (paths && paths[activePathIndex] && typeof paths[activePathIndex].robotWidth === 'number') ? paths[activePathIndex].robotWidth : robotWidth;
    const activeRobotH = (paths && paths[activePathIndex] && typeof paths[activePathIndex].robotHeight === 'number') ? paths[activePathIndex].robotHeight : robotHeight;
    // --- Begin drawing logic ---
    // Draw robot origin marker (center) during animation
    if (robotXY) {
      // By default, only show the robot collider at the next point
      // If showAllCollisions is enabled, show all static collision points
      if ($showAllCollisions && lines.length > 0) {
        // Sample N points per segment for better coverage
        const samplesPerSegment = 20;
        const staticColor = hexToRgba(get(collisionBoxColor), 0.3);
        for (let seg = 0; seg < lines.length; seg++) {
          let staticLine = lines[seg];
          let staticStartPoint = seg === 0 ? startPoint : lines[seg - 1].endPoint;
          for (let i = 0; i < samplesPerSegment; i++) {
            const t = i / samplesPerSegment;
            let staticLinePercent = easeInOutQuad(t);
            let staticRobotInchesXY = getCurvePoint(staticLinePercent, [staticStartPoint, ...staticLine.controlPoints, staticLine.endPoint]);
            let staticHeading = (() => {
              switch (staticLine.endPoint.heading) {
                case "linear":
                  return -shortestRotation(
                    staticLine.endPoint.startDeg ?? 0,
                    staticLine.endPoint.endDeg ?? 0,
                    staticLinePercent
                  );
                case "constant":
                  return -staticLine.endPoint.degrees;
                case "tangential": {
                  const staticNextPointInches = getCurvePoint(staticLinePercent + (staticLine.endPoint.reverse ? -0.01 : 0.01), [staticStartPoint, ...staticLine.controlPoints, staticLine.endPoint]);
                  const staticDx = staticNextPointInches.x - staticRobotInchesXY.x;
                  const staticDy = staticNextPointInches.y - staticRobotInchesXY.y;
                  if (staticDx !== 0 || staticDy !== 0) {
                    return -radiansToDegrees(Math.atan2(staticDy, staticDx));
                  }
                  return 0;
                }
                default:
                  return 0;
              }
            })();
            const staticAngleRad = (-staticHeading * Math.PI) / 180;
            const staticCos = Math.cos(staticAngleRad);
            const staticSin = Math.sin(staticAngleRad);
            // use active path's stored size (if present) for collision boxes so image and collisions match
            const staticHalfL = activeRobotW / 2;
            const staticHalfW = activeRobotH / 2;
            const staticCornersInches = [
              { x: staticRobotInchesXY.x + staticHalfL * staticCos - (-staticHalfW) * staticSin, y: staticRobotInchesXY.y + staticHalfL * staticSin + (-staticHalfW) * staticCos },
              { x: staticRobotInchesXY.x + staticHalfL * staticCos - staticHalfW * staticSin, y: staticRobotInchesXY.y + staticHalfL * staticSin + staticHalfW * staticCos },
              { x: staticRobotInchesXY.x + (-staticHalfL) * staticCos - staticHalfW * staticSin, y: staticRobotInchesXY.y + (-staticHalfL) * staticSin + staticHalfW * staticCos },
              { x: staticRobotInchesXY.x + (-staticHalfL) * staticCos - (-staticHalfW) * staticSin, y: staticRobotInchesXY.y + (-staticHalfL) * staticSin + (-staticHalfW) * staticCos }
            ];
            for (let j = 0; j < staticCornersInches.length; j++) {
              const staticA = staticCornersInches[j];
              const staticB = staticCornersInches[(j + 1) % staticCornersInches.length];
              const staticEdge = new Two.Line(x(staticA.x), y(staticA.y), x(staticB.x), y(staticB.y));
              staticEdge.stroke = hexToRgba(get(collisionBoxColor), 0.7);
              staticEdge.linewidth = x(0.18);
              staticEdge.id = `collider-all-${seg}-${i}-${j}`;
              twoInstance.add(staticEdge);
            }
          }
        }
      }

      // If current segment only is enabled, show overlays for the current segment
      if ($collisionNextSegmentOnly && lines.length > 0) {
        // Find current segment index (assume robotXY is on the current segment)
        // We'll use percentArg to determine where the robot is
        let totalLineProgress = (lines.length * Math.min(percentArg, 99.999999999)) / 100;
        let currentLineIdx = Math.min(Math.trunc(totalLineProgress), lines.length - 1);
        let currentLine = lines[currentLineIdx];
        let currentStartPoint = currentLineIdx === 0 ? startPoint : lines[currentLineIdx - 1].endPoint;
        const samplesPerSegment = 20;
        for (let i = 0; i < samplesPerSegment; i++) {
          const t = i / samplesPerSegment;
          let segPercent = easeInOutQuad(t);
          let segRobotInchesXY = getCurvePoint(segPercent, [currentStartPoint, ...currentLine.controlPoints, currentLine.endPoint]);
          let segHeading = (() => {
            switch (currentLine.endPoint.heading) {
              case "linear":
                return -shortestRotation(
                  currentLine.endPoint.startDeg ?? 0,
                  currentLine.endPoint.endDeg ?? 0,
                  segPercent
                );
              case "constant":
                return -currentLine.endPoint.degrees;
              case "tangential": {
                const segNextPointInches = getCurvePoint(segPercent + (currentLine.endPoint.reverse ? -0.01 : 0.01), [currentStartPoint, ...currentLine.controlPoints, currentLine.endPoint]);
                const segDx = segNextPointInches.x - segRobotInchesXY.x;
                const segDy = segNextPointInches.y - segRobotInchesXY.y;
                if (segDx !== 0 || segDy !== 0) {
                  return -radiansToDegrees(Math.atan2(segDy, segDx));
                }
                return 0;
              }
              default:
                return 0;
            }
          })();
          const segAngleRad = (-segHeading * Math.PI) / 180;
          const segCos = Math.cos(segAngleRad);
          const segSin = Math.sin(segAngleRad);
          const segHalfL = activeRobotW / 2;
          const segHalfW = activeRobotH / 2;
          const segCornersInches = [
            { x: segRobotInchesXY.x + segHalfL * segCos - (-segHalfW) * segSin, y: segRobotInchesXY.y + segHalfL * segSin + (-segHalfW) * segCos },
            { x: segRobotInchesXY.x + segHalfL * segCos - segHalfW * segSin, y: segRobotInchesXY.y + segHalfL * segSin + segHalfW * segCos },
            { x: segRobotInchesXY.x + (-segHalfL) * segCos - segHalfW * segSin, y: segRobotInchesXY.y + (-segHalfL) * segSin + segHalfW * segCos },
            { x: segRobotInchesXY.x + (-segHalfL) * segCos - (-segHalfW) * segSin, y: segRobotInchesXY.y + (-segHalfL) * segSin + (-segHalfW) * segCos }
          ];
          for (let j = 0; j < segCornersInches.length; j++) {
            const segA = segCornersInches[j];
            const segB = segCornersInches[(j + 1) % segCornersInches.length];
            const segEdge = new Two.Line(x(segA.x), y(segA.y), x(segB.x), y(segB.y));
            segEdge.stroke = hexToRgba(get(robotCollisionColor), 0.7);
            segEdge.linewidth = x(0.18);
            segEdge.id = `collider-current-${currentLineIdx}-${i}-${j}`;
            twoInstance.add(segEdge);
          }
        }
      }
      // Compute corners in inches, then convert to pixels
      const angleRad = (-robotHeading * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      const halfL = activeRobotW / 2;
      const halfW = activeRobotH / 2;
      // Robot center in inches
      const robotInchesXY = { x: x.invert(robotXY.x), y: y.invert(robotXY.y) };
      // Rectangle corners (front-left, front-right, back-right, back-left) in inches
      const cornersInches = [
        { x: robotInchesXY.x + halfL * cos - (-halfW) * sin, y: robotInchesXY.y + halfL * sin + (-halfW) * cos }, // front-left
        { x: robotInchesXY.x + halfL * cos - halfW * sin, y: robotInchesXY.y + halfL * sin + halfW * cos },       // front-right
        { x: robotInchesXY.x + (-halfL) * cos - halfW * sin, y: robotInchesXY.y + (-halfL) * sin + halfW * cos }, // back-right
        { x: robotInchesXY.x + (-halfL) * cos - (-halfW) * sin, y: robotInchesXY.y + (-halfL) * sin + (-halfW) * cos } // back-left
      ];
      // Draw robot overlays (split into independent toggles)
      if (get(showRobotOriginToCornerLines)) {
        // Draw lines from origin to each corner (convert both to pixels)
        cornersInches.forEach((corner, idx) => {
          const line = new Two.Line(robotXY.x, robotXY.y, x(corner.x), y(corner.y));
          line.stroke = get(robotCollisionColor);
          line.linewidth = x(0.15);
          line.id = `origin-to-corner-${idx}`;
          twoInstance.add(line);
        });
      }

      // Draw lines between corners to form the collider (separate toggle)
      if (get(showRobotColliderEdges)) {
        for (let i = 0; i < cornersInches.length; i++) {
          const a = cornersInches[i];
          const b = cornersInches[(i + 1) % cornersInches.length];
          const edge = new Two.Line(x(a.x), y(a.y), x(b.x), y(b.y));
          edge.stroke = get(collisionBoxColor);
          edge.linewidth = x(0.18);
          edge.id = `collider-edge-${i}`;
          twoInstance.add(edge);
        }
      }
      // Preserve backward-compatible single-flag overlay: if the legacy flag is set,
      // also draw both origin-to-corner lines and collider edges.
      if (get(showRobotCollisionOverlays)) {
        cornersInches.forEach((corner, idx) => {
          const line = new Two.Line(robotXY.x, robotXY.y, x(corner.x), y(corner.y));
          line.stroke = get(robotCollisionColor);
          line.linewidth = x(0.15);
          line.id = `origin-to-corner-legacy-${idx}`;
          twoInstance.add(line);
        });
        for (let i = 0; i < cornersInches.length; i++) {
          const a = cornersInches[i];
          const b = cornersInches[(i + 1) % cornersInches.length];
          const edge = new Two.Line(x(a.x), y(a.y), x(b.x), y(b.y));
          edge.stroke = get(collisionBoxColor);
          edge.linewidth = x(0.18);
          edge.id = `collider-edge-legacy-${i}`;
          twoInstance.add(edge);
        }
      }
      const originDot = new Two.Circle(robotXY.x, robotXY.y, x(0.7));
      originDot.fill = get(robotCollisionColor);
      originDot.noStroke();
      originDot.id = 'robot-origin-dot';
      twoInstance.add(originDot);
      // Draw facing direction arrow (always visible)
      const arrowLength = x(activeRobotW * 0.9);
      const arrowAngleRad = (robotHeading * Math.PI) / 180;
      const arrowEndX = robotXY.x + Math.cos(arrowAngleRad) * arrowLength;
      const arrowEndY = robotXY.y + Math.sin(arrowAngleRad) * arrowLength;
      const arrow = new Two.Line(robotXY.x, robotXY.y, arrowEndX, arrowEndY);
      arrow.stroke = '#ff6600';
      arrow.linewidth = x(0.22);
      arrow.id = 'robot-facing-arrow';
      twoInstance.add(arrow);
      // Arrowhead
      const headLength = x(1.2);
      const headAngle = Math.PI / 7;
      const leftHeadX = arrowEndX - headLength * Math.cos(arrowAngleRad - headAngle);
      const leftHeadY = arrowEndY - headLength * Math.sin(arrowAngleRad - headAngle);
      const rightHeadX = arrowEndX - headLength * Math.cos(arrowAngleRad + headAngle);
      const rightHeadY = arrowEndY - headLength * Math.sin(arrowAngleRad + headAngle);
      const arrowHeadLeft = new Two.Line(arrowEndX, arrowEndY, leftHeadX, leftHeadY);
      arrowHeadLeft.stroke = '#ff6600';
      arrowHeadLeft.linewidth = x(0.18);
      arrowHeadLeft.id = 'robot-facing-arrowhead-left';
      twoInstance.add(arrowHeadLeft);
      const arrowHeadRight = new Two.Line(arrowEndX, arrowEndY, rightHeadX, rightHeadY);
      arrowHeadRight.stroke = '#ff6600';
      arrowHeadRight.linewidth = x(0.18);
      arrowHeadRight.id = 'robot-facing-arrowhead-right';
      twoInstance.add(arrowHeadRight);
      // Show coordinates and rotation, offset further right
      if (get(showRobotLiveCoordinates)) {
        const degrees = robotHeading ? robotHeading.toFixed(1) : '0';
        const originLabel = new Two.Text(
          `(${(x.invert(robotXY.x)).toFixed(1)}, ${(y.invert(robotXY.y)).toFixed(1)})\n${degrees}°`,
          robotXY.x + x(5),
          robotXY.y - x(1.5),
          x(2.5)
        );
        originLabel.fill = get(robotCollisionColor);
        originLabel.size = x(1.2);
        originLabel.noStroke();
        originLabel.id = 'robot-origin-label';
        twoInstance.add(originLabel);
      }
    }

    // In comparison mode, draw non-active visible paths first, then active path on top
    if (comparisonMode) {
      // helper to draw a single path's lines
      const drawPathLines = (pathData: RobotPath, pathIdx: number, opts: { active: boolean }) => {
        pathData.lines.forEach((line, idx) => {
          let _startPoint = idx === 0 ? pathData.startPoint : pathData.lines[idx - 1].endPoint;
          let lineElem: Path | PathLine;
          if (line.controlPoints.length > 2) {
            const samples = 100;
            const cps = [_startPoint, ...line.controlPoints, line.endPoint];
            let linePoints = [new Two.Anchor(x(_startPoint.x), y(_startPoint.y), 0, 0, 0, 0, Two.Commands.move)];
            for (let i = 1; i <= samples; ++i) {
              const point = getCurvePoint(i / samples, cps);
              linePoints.push(new Two.Anchor(x(point.x), y(point.y), 0, 0, 0, 0, Two.Commands.line));
            }
            linePoints.forEach((point) => (point.relative = false));
            lineElem = new Two.Path(linePoints);
            lineElem.automatic = false;
          } else if (line.controlPoints.length > 0) {
            let cp1 = line.controlPoints[1]
              ? line.controlPoints[0]
              : quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint).Q1;
            let cp2 = line.controlPoints[1] ?? quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint).Q2;
            let linePoints = [
              new Two.Anchor(x(_startPoint.x), y(_startPoint.y), x(_startPoint.x), y(_startPoint.y), x(cp1.x), y(cp1.y), Two.Commands.move),
              new Two.Anchor(x(line.endPoint.x), y(line.endPoint.y), x(cp2.x), y(cp2.y), x(line.endPoint.x), y(line.endPoint.y), Two.Commands.curve),
            ];
            linePoints.forEach((point) => (point.relative = false));
            lineElem = new Two.Path(linePoints);
            lineElem.automatic = false;
          } else {
            lineElem = new Two.Line(x(_startPoint.x), y(_startPoint.y), x(line.endPoint.x), y(line.endPoint.y));
          }
          lineElem.id = `path-${pathIdx}-line-${idx + 1}`;
          lineElem.stroke = line.color ?? pathData.color;
          // Make active path slightly thicker and fully opaque for visibility
          lineElem.linewidth = x(lineWidth * (opts.active ? 1.6 : 1));
          lineElem.opacity = opts.active ? 1 : 0.45;
          lineElem.noFill();
          twoInstance.add(lineElem);
        });
      };

      // draw non-active first
      paths.forEach((pd, pidx) => {
        if (!pd.visible) return;
        if (pidx === activePathIndex) return;
        // compute per-path timing: pathDuration and playbarPercent mapping
        const pathDurationMs = computePathDurationMs(pd);
        const maxPathDurMs = Math.max(...paths.map((pp) => computePathDurationMs(pp)));
        const targetDurationMs = Math.min(maxPathDurMs, 30000);
        const globalElapsedMs = (percentArg / 100) * targetDurationMs;
        const elapsedForPathMs = Math.min(globalElapsedMs, pathDurationMs);
        const playbarPercentForPath = pathDurationMs > 0 ? (elapsedForPathMs / pathDurationMs) * 100 : 100;
        const { robotPercent: pathRobotPercent } = getRobotPercentAndWait(playbarPercentForPath, pd.lines);
        drawPathLines(pd, pidx, { active: false });
        // small markers for context
        let sp = new Two.Circle(x(pd.startPoint.x), y(pd.startPoint.y), x(pointRadius * 0.8));
        sp.fill = pd.startPoint.color ?? pd.color;
        sp.noStroke();
        sp.opacity = 0.7;
        twoInstance.add(sp);
        pd.lines.forEach((ln) => {
          const end = new Two.Circle(x(ln.endPoint.x), y(ln.endPoint.y), x(pointRadius * 0.6));
          end.fill = ln.endPoint.color ?? pd.color;
          end.noStroke();
          end.opacity = 0.6;
          twoInstance.add(end);
          ln.controlPoints.forEach((pt) => {
            const cp = new Two.Circle(x(pt.x), y(pt.y), x(pointRadius * 0.5));
            cp.fill = (pt as any).color ?? pd.color;
            cp.noStroke();
            cp.opacity = 0.5;
            twoInstance.add(cp);
          });
        });
        // Collision overlays for ghost path (whole-path)
        if (get(showAllCollisions) && pd.lines.length > 0) {
          const samplesPerSegment = 20;
          for (let seg = 0; seg < pd.lines.length; seg++) {
            let staticLine = pd.lines[seg];
            let staticStartPoint = seg === 0 ? pd.startPoint : pd.lines[seg - 1].endPoint;
            for (let i = 0; i < samplesPerSegment; i++) {
              const t = i / samplesPerSegment;
              let staticLinePercent = easeInOutQuad(t);
              let staticRobotInchesXY = getCurvePoint(staticLinePercent, [staticStartPoint, ...staticLine.controlPoints, staticLine.endPoint]);
              let staticHeading = (() => {
                switch (staticLine.endPoint.heading) {
                  case "linear":
                    return -shortestRotation(
                      staticLine.endPoint.startDeg ?? 0,
                      staticLine.endPoint.endDeg ?? 0,
                      staticLinePercent
                    );
                  case "constant":
                    return -staticLine.endPoint.degrees;
                  case "tangential": {
                    const staticNextPointInches = getCurvePoint(staticLinePercent + (staticLine.endPoint.reverse ? -0.01 : 0.01), [staticStartPoint, ...staticLine.controlPoints, staticLine.endPoint]);
                    const staticDx = staticNextPointInches.x - staticRobotInchesXY.x;
                    const staticDy = staticNextPointInches.y - staticRobotInchesXY.y;
                    if (staticDx !== 0 || staticDy !== 0) {
                      return -radiansToDegrees(Math.atan2(staticDy, staticDx));
                    }
                    return 0;
                  }
                  default:
                    return 0;
                }
              })();
              const staticAngleRad = (-staticHeading * Math.PI) / 180;
              const staticCos = Math.cos(staticAngleRad);
              const staticSin = Math.sin(staticAngleRad);
              const staticHalfL = (pd.robotWidth ?? robotWidth) / 2;
              const staticHalfW = (pd.robotHeight ?? robotHeight) / 2;
              const staticCornersInches = [
                { x: staticRobotInchesXY.x + staticHalfL * staticCos - (-staticHalfW) * staticSin, y: staticRobotInchesXY.y + staticHalfL * staticSin + (-staticHalfW) * staticCos },
                { x: staticRobotInchesXY.x + staticHalfL * staticCos - staticHalfW * staticSin, y: staticRobotInchesXY.y + staticHalfL * staticSin + staticHalfW * staticCos },
                { x: staticRobotInchesXY.x + (-staticHalfL) * staticCos - staticHalfW * staticSin, y: staticRobotInchesXY.y + (-staticHalfL) * staticSin + staticHalfW * staticCos },
                { x: staticRobotInchesXY.x + (-staticHalfL) * staticCos - (-staticHalfW) * staticSin, y: staticRobotInchesXY.y + (-staticHalfL) * staticSin + (-staticHalfW) * staticCos }
              ];
              for (let j = 0; j < staticCornersInches.length; j++) {
                const staticA = staticCornersInches[j];
                const staticB = staticCornersInches[(j + 1) % staticCornersInches.length];
                const staticEdge = new Two.Line(x(staticA.x), y(staticA.y), x(staticB.x), y(staticB.y));
                staticEdge.stroke = hexToRgba(get(collisionBoxColor), 0.35);
                staticEdge.linewidth = x(0.18);
                staticEdge.id = `ghost-collider-all-${seg}-${i}-${j}-${pidx}`;
                twoInstance.add(staticEdge);
              }
            }
          }
        }

        // Collision overlays for ghost path (current segment only)
        if (get(collisionNextSegmentOnly) && pd.lines.length > 0) {
          const effectivePercent = Math.min(pathRobotPercent, 99.999999999);
          let totalLineProgress = (pd.lines.length * effectivePercent) / 100;
          let currentLineIdx = Math.min(Math.trunc(totalLineProgress), pd.lines.length - 1);
          let currentLine = pd.lines[currentLineIdx];
          let currentStartPoint = currentLineIdx === 0 ? pd.startPoint : pd.lines[currentLineIdx - 1].endPoint;
          const segSamples = 20;
          for (let i = 0; i < segSamples; i++) {
            const t = i / segSamples;
            let segPercent = easeInOutQuad(t);
            let segRobotInchesXY = getCurvePoint(segPercent, [currentStartPoint, ...currentLine.controlPoints, currentLine.endPoint]);
            let segHeading = (() => {
              switch (currentLine.endPoint.heading) {
                case "linear":
                  return -shortestRotation(
                    currentLine.endPoint.startDeg ?? 0,
                    currentLine.endPoint.endDeg ?? 0,
                    segPercent
                  );
                case "constant":
                  return -currentLine.endPoint.degrees;
                case "tangential": {
                  const segNextPointInches = getCurvePoint(segPercent + (currentLine.endPoint.reverse ? -0.01 : 0.01), [currentStartPoint, ...currentLine.controlPoints, currentLine.endPoint]);
                  const segDx = segNextPointInches.x - segRobotInchesXY.x;
                  const segDy = segNextPointInches.y - segRobotInchesXY.y;
                  if (segDx !== 0 || segDy !== 0) {
                    return -radiansToDegrees(Math.atan2(segDy, segDx));
                  }
                  return 0;
                }
                default:
                  return 0;
              }
            })();
            const segAngleRad = (-segHeading * Math.PI) / 180;
            const segCos = Math.cos(segAngleRad);
            const segSin = Math.sin(segAngleRad);
            const segHalfL = (pd.robotWidth ?? robotWidth) / 2;
            const segHalfW = (pd.robotHeight ?? robotHeight) / 2;
            const segCornersInches = [
              { x: segRobotInchesXY.x + segHalfL * segCos - (-segHalfW) * segSin, y: segRobotInchesXY.y + segHalfL * segSin + (-segHalfW) * segCos },
              { x: segRobotInchesXY.x + segHalfL * segCos - segHalfW * segSin, y: segRobotInchesXY.y + segHalfL * segSin + segHalfW * segCos },
              { x: segRobotInchesXY.x + (-segHalfL) * segCos - segHalfW * segSin, y: segRobotInchesXY.y + (-segHalfL) * segSin + segHalfW * segCos },
              { x: segRobotInchesXY.x + (-segHalfL) * segCos - (-segHalfW) * segSin, y: segRobotInchesXY.y + (-segHalfL) * segSin + (-segHalfW) * segCos }
            ];
            for (let j = 0; j < segCornersInches.length; j++) {
              const segA = segCornersInches[j];
              const segB = segCornersInches[(j + 1) % segCornersInches.length];
              const segEdge = new Two.Line(x(segA.x), y(segA.y), x(segB.x), y(segB.y));
              segEdge.stroke = hexToRgba(get(robotCollisionColor), 0.35);
              segEdge.linewidth = x(0.18);
              segEdge.id = `ghost-collider-current-${currentLineIdx}-${i}-${j}-${pidx}`;
              twoInstance.add(segEdge);
            }
          }
        }
        // Draw a directional arrow for the ghost robot (shows facing)
        try {
          const otherPos = getPathRobotPosition(pd, pathRobotPercent);
          if (Number.isFinite(otherPos.x) && Number.isFinite(otherPos.y)) {
            const ghostRobotW = pd.robotWidth ?? robotWidth;
            const arrowLength = x(ghostRobotW * 0.9);
            const arrowAngleRad = (otherPos.heading * Math.PI) / 180;
            const arrowEndX = otherPos.x + Math.cos(arrowAngleRad) * arrowLength;
            const arrowEndY = otherPos.y + Math.sin(arrowAngleRad) * arrowLength;

            const ghostArrow = new Two.Line(otherPos.x, otherPos.y, arrowEndX, arrowEndY);
            ghostArrow.stroke = pd.color;
            ghostArrow.linewidth = x(0.18);
            ghostArrow.id = `ghost-arrow-${pidx}`;
            ghostArrow.opacity = 0.6;
            twoInstance.add(ghostArrow);

            const headLength = x(1.0);
            const headAngle = Math.PI / 7;
            const leftHeadX = arrowEndX - headLength * Math.cos(arrowAngleRad - headAngle);
            const leftHeadY = arrowEndY - headLength * Math.sin(arrowAngleRad - headAngle);
            const rightHeadX = arrowEndX - headLength * Math.cos(arrowAngleRad + headAngle);
            const rightHeadY = arrowEndY - headLength * Math.sin(arrowAngleRad + headAngle);
            const ghostHeadLeft = new Two.Line(arrowEndX, arrowEndY, leftHeadX, leftHeadY);
            ghostHeadLeft.stroke = pd.color;
            ghostHeadLeft.linewidth = x(0.14);
            ghostHeadLeft.opacity = 0.6;
            twoInstance.add(ghostHeadLeft);
            const ghostHeadRight = new Two.Line(arrowEndX, arrowEndY, rightHeadX, rightHeadY);
            ghostHeadRight.stroke = pd.color;
            ghostHeadRight.linewidth = x(0.14);
            ghostHeadRight.opacity = 0.6;
            twoInstance.add(ghostHeadRight);

            const originDotGhost = new Two.Circle(otherPos.x, otherPos.y, x(0.6));
            originDotGhost.fill = pd.color;
            originDotGhost.noStroke();
            originDotGhost.opacity = 0.6;
            twoInstance.add(originDotGhost);
          }
        } catch (e) {
          // don't break drawing if arrow generation fails
        }
      });

      // active path last (on top) — render the current editing path so main lines always show
      const activeToRender: RobotPath = {
        id: paths[activePathIndex]?.id ?? `editing-${Date.now()}`,
        name: paths[activePathIndex]?.name ?? "Editing",
        color: paths[activePathIndex]?.color ?? (lines[0]?.color ?? "#000"),
        startPoint: deepClone(startPoint),
        lines: deepClone(lines),
        visible: true,
      };
      drawPathLines(activeToRender, activePathIndex >= 0 ? activePathIndex : -1, { active: true });
      let startPointElem = new Two.Circle(x(activeToRender.startPoint.x), y(activeToRender.startPoint.y), x(pointRadius));
      startPointElem.id = `path-${activePathIndex}-point-0`;
      startPointElem.fill = activeToRender.startPoint.color ?? activeToRender.color;
      startPointElem.noStroke();
      twoInstance.add(startPointElem);

      // Draw points only for active path
      twoInstance.add(...points);
    } else {
      // Single path mode - original behavior
      twoInstance.add(...path);
      twoInstance.add(...points);
    }
    // --- End drawing logic ---
  
  }

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
    drawScene(
      two,
      percent,
      robotPercent,
      x,
      y,
      robotXY,
      robotHeading,
      comparisonMode,
      paths,
      activePathIndex,
      path,
      points,
      startPoint,
      lines,
      lineWidth,
      pointRadius,
      robotWidth,
      robotHeight,
      $showAllCollisions,
      $collisionNextSegmentOnly
    );
    two.update();
  })();

  let playing = false;

  // UI state for paths manager collapse
  let showPathsManager: boolean = false;

  let animationFrame: number;
  let startTime: number | null = null;
  let previousTime: number | null = null;
  let waitingUntil: number | null = null; // Timestamp when waiting ends
  let lastLineIdx: number = -1; // Track which line we were on
  let accumulatedWaitTime: number = 0; // Track how much wait time has been "used" for percent calculation

  // Calculate total wait time in seconds
  $: totalWaitSeconds = lines.reduce((sum, line) => sum + (line.waitTime || 0), 0);
  // Base movement time in ms (time for robotPercent to go 0-100)
  // robotPercent advances at (0.65 / lines.length) * (deltaTime * 0.1) per ms
  // So to go 100: 100 / ((0.65 / lines.length) * 0.1) = 100 * lines.length / 0.065 ms
  $: baseMovementMs = (100 * lines.length) / 0.065;
  // Total time including waits
  $: totalTimeMs = baseMovementMs + (totalWaitSeconds * 1000);
  // Ratio of movement time to total time
  $: movementRatio = baseMovementMs / totalTimeMs;

  // Sync robotPercent to percent when not playing (allows scrubbing the playbar)
  $: if (!playing) {
    // When scrubbing, map playbar percent to robot percent and wait state
    const { robotPercent: mappedRobotPercent } = getRobotPercentAndWait(percent, lines);
    robotPercent = Math.min(mappedRobotPercent, 99.999);
  }

  function animate(timestamp: number) {
    if (!startTime) {
      startTime = timestamp;
    }

    if (previousTime !== null) {
      const deltaTime = timestamp - previousTime;
      const robotPercentIncrement = (0.65 / lines.length) * (deltaTime * 0.1) * playbackSpeed;
      // When in comparison mode, advance the global percent uniformly over the target duration
      let percentIncrementForMovement = robotPercentIncrement * movementRatio;
      let percentIncrementForWait = (deltaTime / totalTimeMs) * 100 * playbackSpeed;
      if (comparisonMode) {
        // Compute targetDurationMs = min(max(pathDurations), 30s)
        const allDurations = paths.map((p) => computePathDurationMs(p));
        const maxPathDurMs = allDurations.length > 0 ? Math.max(...allDurations) : totalTimeMs;
        const targetDurationMs = Math.min(maxPathDurMs, 30000);
        percentIncrementForMovement = (deltaTime / targetDurationMs) * 100 * playbackSpeed;
        // During compare mode we don't treat waits separately for the global percent — the targetDurationMs already includes waits per-path
        percentIncrementForWait = (deltaTime / targetDurationMs) * 100 * playbackSpeed;
      }

      // Only reset when robot has actually finished the entire path (including final wait)
      const robotFinished = robotPercent >= 99.999 && waitingUntil === null;
      
      if (robotFinished && percent >= 99.9) {
        percent = 0;
        robotPercent = 0;
        lastLineIdx = -1;
        waitingUntil = null;
        accumulatedWaitTime = 0;
      } else {
        // Check if we're currently waiting (robot doesn't move, but progress bar does)
        if (waitingUntil !== null) {
          if (timestamp >= waitingUntil) {
            // Done waiting - continue moving
            waitingUntil = null;
          }
          // During wait: only percent advances, robotPercent stays put
          percent = Math.min(percent + percentIncrementForWait, 100);
        } else {
          // Not waiting - both advance together
          percent = Math.min(percent + percentIncrementForMovement, 100);
          
          if (robotPercent < 99.999) {
            robotPercent = Math.min(robotPercent + robotPercentIncrement, 99.999999);
            
            let totalLineProgress = (lines.length * Math.min(robotPercent, 99.999999)) / 100;
            let currentLineIdx = Math.min(Math.trunc(totalLineProgress), lines.length - 1);
            
            // Check if we just finished a line (moved to a new line)
            if (currentLineIdx > lastLineIdx && lastLineIdx >= 0) {
              const finishedLine = lines[lastLineIdx];
              if (finishedLine.waitTime && finishedLine.waitTime > 0) {
                // Start waiting - robot stays at end of finished line (scaled by playback speed)
                waitingUntil = timestamp + (finishedLine.waitTime * 1000 / playbackSpeed);
              }
            }
            lastLineIdx = currentLineIdx;
          } else {
            // Robot finished, check if we need to wait at the final point
            const lastLine = lines[lines.length - 1];
            if (lastLine.waitTime && lastLine.waitTime > 0 && lastLineIdx === lines.length - 1) {
              // Check if we already triggered the final wait
              if (lastLineIdx !== -2) { // Use -2 as marker that final wait was triggered
                waitingUntil = timestamp + (lastLine.waitTime * 1000 / playbackSpeed);
                lastLineIdx = -2; // Mark final wait as triggered
              }
            }
          }
        }
      }
    }

    previousTime = timestamp;

    if (playing) {
      requestAnimationFrame(animate);
    }
  }

  function play() {
    if (!playing) {
      playing = true;
      startTime = null;
      previousTime = null;
      waitingUntil = null;
      accumulatedWaitTime = 0;
      // When starting from slider position, sync robotPercent using mapping
      const { robotPercent: mappedRobotPercent } = getRobotPercentAndWait(percent, lines);
      robotPercent = Math.min(mappedRobotPercent, 99.999);
      // Initialize lastLineIdx based on current robotPercent
      let totalLineProgress = (lines.length * Math.min(robotPercent, 99.999999999)) / 100;
      lastLineIdx = Math.min(Math.trunc(totalLineProgress), lines.length - 1);
      animationFrame = requestAnimationFrame(animate);
    }
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(animationFrame);
  }

  // GIF capture function
  let gifRecordingProgress = 0;
  let gifFps = 30; // Configurable FPS for GIF export
  
  async function captureGif(): Promise<void> {
  let framesAdded = 0;

    isGifExporting = true;
    if (!fieldContainer) {
      console.error('GIF Export: fieldContainer not found.');
      return;
    }

    console.log('GIF Export: Starting export...');
    const wasPlaying = playing;
    if (wasPlaying) {
      console.log('GIF Export: Pausing playback for export.');
      pause();
    }

    const savedPercent = percent;
    const savedRobotPercent = robotPercent;

    // Always use 1x speed for GIF export, regardless of playbackSpeed
    const exportPlaybackSpeed = 1;
    const exportBasePathDuration = (100 * lines.length) / (0.65 * 0.1 * 1000);
    const exportTotalWaitTime = lines.reduce((sum, line) => sum + (line.waitTime || 0), 0);
    const exportTotalPathDuration = exportBasePathDuration + exportTotalWaitTime;
    const exportMovementRatio = exportBasePathDuration / (exportBasePathDuration + exportTotalWaitTime);
    const totalFrames = Math.round(exportTotalPathDuration * gifFps);
    const frameDelay = Math.round(1000 / gifFps); // ms per frame
    console.log(`GIF Export: totalFrames=${totalFrames}, frameDelay=${frameDelay}`);

    // Create offscreen canvases and compositing canvas
    const width = fieldContainer.clientWidth;
    const height = fieldContainer.clientHeight;
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    overlayCanvas.style.display = 'none';
    document.body.appendChild(overlayCanvas); // Attach overlay canvas to DOM (hidden)
    const backgroundCanvas = document.createElement('canvas');
    backgroundCanvas.width = width;
    backgroundCanvas.height = height;
    backgroundCanvas.style.display = 'none';
    document.body.appendChild(backgroundCanvas);
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = width;
    finalCanvas.height = height;
    finalCanvas.style.display = 'none';
    document.body.appendChild(finalCanvas);
    console.log('GIF Export: Created overlay/background/final canvases and attached to DOM (hidden)', { width, height });

    // Preload the field image and robot image before starting the export loop
    // Try multiple field images for debugging (webp and fallback)
    const viteBase = import.meta.env.BASE_URL || '/Pedro-Visualzier-18127/';
    const fieldImagePaths = [
      `${viteBase}fields/decode.webp`,
      `${viteBase}fields/centerstage.webp`,
      `${viteBase}fields/intothedeep.webp`
    ];
    let fieldImg = new Image();
    fieldImg.crossOrigin = 'anonymous';
    let fieldImageLoaded = false;
    let fieldImageTried = 0;
    let selectedFieldPath = null;
    for (const path of fieldImagePaths) {
      fieldImg = new Image();
      fieldImg.crossOrigin = 'anonymous';
      fieldImg.src = path;
      await new Promise((resolve) => {
        fieldImg.onload = () => {
          fieldImageLoaded = true;
          selectedFieldPath = path;
          console.log('GIF Export: Field image loaded successfully:', path);
          resolve(null);
        };
        fieldImg.onerror = (e) => {
          fieldImageLoaded = false;
          console.error('GIF Export: Failed to load field image for GIF export:', path, e);
          resolve(null);
        };
        if (fieldImg.complete && fieldImg.naturalWidth !== 0) {
          fieldImageLoaded = true;
          resolve(null);
        }
      });
      fieldImageTried++;
      if (fieldImageLoaded) break;
    }

    // Preload the robot image (if any)
    let robotImg: HTMLImageElement | null = null;
    if (robotImageSrc) {
      robotImg = new Image();
      robotImg.crossOrigin = 'anonymous';
      robotImg.src = robotImageSrc;
      await new Promise((resolve) => {
        robotImg!.onload = () => {
          console.log('GIF Export: Robot image loaded for export.');
          resolve(null);
        };
        robotImg!.onerror = (e) => {
          console.warn('GIF Export: Failed to load robot image for export', e);
          resolve(null);
        };
        if (robotImg && robotImg.complete && robotImg.naturalWidth !== 0) resolve(null);
      });
    }

    // Create a new Two.js instance with canvas renderer
    const twoExport = new Two({
      width,
      height,
      type: Two.Types.canvas,
      autostart: false,
      domElement: overlayCanvas
    });
    // Do NOT call appendTo, since we're providing the canvas directly
    console.log('GIF Export: Created Two.js canvas renderer (direct to canvas)');

    // Build export-specific Two.js path and point primitives (do not reuse the main UI ones)
    const exportPoints: any[] = (() => {
      let _points: any[] = [];
      let startPointElem = new Two.Circle(
        x(startPoint.x),
        y(startPoint.y),
        x(pointRadius)
      );
      startPointElem.id = `point-0-0-export`;
      startPointElem.fill = startPoint.color ?? lines[0]?.color ?? "#000";
      startPointElem.noStroke();
      _points.push(startPointElem);
      lines.forEach((line, idx) => {
        [line.endPoint, ...line.controlPoints].forEach((point, idx1) => {
          if (idx1 > 0) {
            let pointGroup = new Two.Group();
            pointGroup.id = `point-${idx + 1}-${idx1}-export`;

            let pointElem = new Two.Circle(
              x(point.x),
              y(point.y),
              x(pointRadius)
            );
            pointElem.id = `point-${idx + 1}-${idx1}-background-export`;
            pointElem.fill = (point as any).color ?? line.color;
            pointElem.noStroke();

            let pointText = new Two.Text(
              `${idx1}`,
              x(point.x),
              y(point.y - 0.15),
              x(pointRadius)
            );
            pointText.id = `point-${idx + 1}-${idx1}-text-export`;
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
              x(pointRadius)
            );
            pointElem.id = `point-${idx + 1}-${idx1}-export`;
            pointElem.fill = (point as any).color ?? line.color;
            pointElem.noStroke();
            _points.push(pointElem);
          }
        });
      });
      console.log('GIF Export: Created exportPoints count', _points.length);
        console.log('GIF Export: Created exportPoints count', _points.length);
        return _points;
    })();

    const exportPath: (Path | PathLine)[] = (() => {
      let _path: (Path | PathLine)[] = [];
      lines.forEach((line, idx) => {
        let _startPoint = idx === 0 ? startPoint : lines[idx - 1].endPoint;
        let lineElem: Path | PathLine;
        if (line.controlPoints.length > 2) {
          const samples = 100;
          const cps = [_startPoint, ...line.controlPoints, line.endPoint];
          let points = [new Two.Anchor(x(_startPoint.x), y(_startPoint.y), 0, 0, 0, 0, Two.Commands.move)];
          for (let i = 1; i <= samples; ++i) {
            const point = getCurvePoint(i / samples, cps);
            points.push(new Two.Anchor(x(point.x), y(point.y), 0, 0, 0, 0, Two.Commands.line));
          }
          points.forEach((point) => (point.relative = false));
          lineElem = new Two.Path(points);
          lineElem.automatic = false;
        } else if (line.controlPoints.length > 0) {
          let cp1 = line.controlPoints[1]
            ? line.controlPoints[0]
            : quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint).Q1;
          let cp2 =
            line.controlPoints[1] ?? quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint).Q2;
          let points = [
            new Two.Anchor(x(_startPoint.x), y(_startPoint.y), x(_startPoint.x), y(_startPoint.y), x(cp1.x), y(cp1.y), Two.Commands.move),
            new Two.Anchor(x(line.endPoint.x), y(line.endPoint.y), x(cp2.x), y(cp2.y), x(line.endPoint.x), y(line.endPoint.y), Two.Commands.curve),
          ];
          points.forEach((point) => (point.relative = false));
          lineElem = new Two.Path(points);
          lineElem.automatic = false;
        } else {
          lineElem = new Two.Line(x(_startPoint.x), y(_startPoint.y), x(line.endPoint.x), y(line.endPoint.y));
        }
        lineElem.id = `path-${idx}`;
        lineElem.stroke = line.color;
        lineElem.linewidth = x(lineWidth);
        lineElem.opacity = 1;
        lineElem.noFill();
        _path.push(lineElem);
      });
      console.log('GIF Export: Created exportPath count', _path.length);
        console.log('GIF Export: Created exportPath count', _path.length);
        return _path;
    })();

      // NOTE: don't add shapes up front - drawScene will add them each frame to the twoExport instance

    // Create GIF encoder
    let workerScriptPath = workerUrl;
    const gif = new GIF({
      workers: 4,
      quality: 15, // Lower = better quality (1-20), 15 is much faster
      width,
      height,
      workerScript: workerScriptPath
    });
    console.log('GIF Export: Created GIF encoder');

    try {
      for (let i = 0; i <= totalFrames; i++) {

        // For GIF export, use the same percent for both robot and collision overlays to keep them in sync
        percent = (i / totalFrames) * 100;
        robotPercent = percent;

        // Compute robotXY and robotHeading for this frame
        let effectivePercent = typeof robotPercent !== 'undefined' ? robotPercent : percent;
        let totalLineProgress = (lines.length * Math.min(effectivePercent, 99.999999999)) / 100;
        let currentLineIdx = Math.min(Math.trunc(totalLineProgress), lines.length - 1);
        let currentLine = lines[currentLineIdx];
        let linePercent = easeInOutQuad(totalLineProgress - Math.floor(totalLineProgress));
        let _startPoint = currentLineIdx === 0 ? startPoint : lines[currentLineIdx - 1].endPoint;
        let robotInchesXY = getCurvePoint(linePercent, [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]);
        let frameRobotXY = { x: x(robotInchesXY.x), y: y(robotInchesXY.y) };
        let frameRobotHeading = 0;
        switch (currentLine.endPoint.heading) {
          case "linear":
            frameRobotHeading = -shortestRotation(
              currentLine.endPoint.startDeg,
              currentLine.endPoint.endDeg,
              linePercent
            );
            break;
          case "constant":
            frameRobotHeading = -currentLine.endPoint.degrees;
            break;
          case "tangential":
            const nextPointInches = getCurvePoint(
              linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01),
              [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]
            );
            const nextPoint = { x: x(nextPointInches.x), y: y(nextPointInches.y) };
            const dx = nextPoint.x - frameRobotXY.x;
            const dy = nextPoint.y - frameRobotXY.y;
            if (dx !== 0 || dy !== 0) {
              frameRobotHeading = -radiansToDegrees(Math.atan2(dy, dx));
            }
            break;
        }

        // Clear the canvas and Two.js scene
        twoExport.clear();

        // Render the field image as a Two.js Image added to the export scene, or fallback to a neutral background
        let twoFieldImage = null;
        if (fieldImageLoaded && fieldImg) {
          try {
            // Draw field image onto background canvas per-frame
            const bgCtx = backgroundCanvas.getContext('2d');
            if (bgCtx) {
              bgCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
              bgCtx.drawImage(fieldImg, 0, 0, backgroundCanvas.width, backgroundCanvas.height);
            }
            console.log('GIF Export: Drew field image into background canvas', { path: selectedFieldPath });
          } catch (e) {
            console.error('GIF Export: Failed to draw field image to background canvas', e);
          }
        } else {
          // If no field image available, clear with a neutral color to make missing field visible in exported frames
            const ctx = backgroundCanvas.getContext('2d');
          if (ctx) {
              ctx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
              ctx.fillStyle = '#dddddd';
              ctx.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
            console.warn('GIF Export: No field image loaded; filled with neutral background for export.');
          }
        }
          // Debug: log per-frame info
          console.log(`GIF Export: Frame ${i+1}/${totalFrames+1} - fieldLoaded=${fieldImageLoaded} path=${selectedFieldPath}`);
          // Draw overlays/robot and update two.js
          try {
            drawScene(
              twoExport,
              percent,
              robotPercent,
              x,
              y,
              frameRobotXY,
              frameRobotHeading,
              comparisonMode,
              paths,
              activePathIndex,
              exportPath,
              exportPoints,
              startPoint,
              lines,
              lineWidth,
              pointRadius,
              robotWidth,
              robotHeight,
              $showAllCollisions,
              $collisionNextSegmentOnly
            );
            twoExport.update();
            // Compose background + overlay to final canvas
            try {
              const finalCtx = finalCanvas.getContext('2d');
              const overlayCtx = overlayCanvas.getContext('2d');
              const bgCtx = backgroundCanvas.getContext('2d');
              if (finalCtx) {
                finalCtx.clearRect(0, 0, finalCanvas.width, finalCanvas.height);
                if (bgCtx) finalCtx.drawImage(backgroundCanvas, 0, 0);
                if (overlayCtx) finalCtx.drawImage(overlayCanvas, 0, 0);
              }
            } catch (e) {
              console.error('GIF Export: Failed to composite final canvas', e);
            }
            const ctxDebug = finalCanvas.getContext('2d');
            // Compose robot image onto overlay canvas so it appears above the Two.js shapes
            try {
              const overlayCtx = overlayCanvas.getContext('2d');
              if (overlayCtx && robotImg && robotImg.naturalWidth) {
                // Robot pixel dimensions (converted from field inches to pixels)
                const robotW = x(robotWidth);
                const robotH = x(robotHeight);
                overlayCtx.drawImage(robotImg, frameRobotXY.x - robotW / 2, frameRobotXY.y - robotH / 2, robotW, robotH);
                console.log('GIF Export: Drew robot image to overlay', { x: frameRobotXY.x, y: frameRobotXY.y, w: robotW, h: robotH });
              }
            } catch (e) {
              console.warn('GIF Export: Failed to draw robot image on overlay', e);
            }
            if (ctxDebug) {
              try {
                const px = ctxDebug.getImageData(Math.floor(width / 2), Math.floor(height / 2), 1, 1).data;
                console.log('GIF Export: center pixel RGBA', px);
                if (i === 0 && px[3] === 0) {
                  try {
                    const snapshot = finalCanvas.toDataURL('image/png');
                    console.log('GIF Export: finalCanvas snapshot dataURL (first frame):', snapshot.substring(0, 200) + '...');
                  } catch (e) {
                    console.warn('GIF Export: Could not create finalCanvas dataURL snapshot', e);
                  }
                }
              } catch (e) {
                console.warn('GIF Export: Could not read center pixel (canvas may be tainted):', e);
              }
            }
            gif.addFrame(finalCanvas, { delay: frameDelay, copy: true });
            framesAdded++;
          } catch (err) {
            console.error('GIF Export: Failed to render frame or add to GIF', err);
          }
        gifRecordingProgress = Math.round((i / totalFrames) * 100);
        await Promise.resolve(); // allow Svelte to update UI
        if (i % 10 === 0 || i === totalFrames) {
          console.log(`GIF Export: Added frame ${i + 1} / ${totalFrames + 1}`);
        }
      }

      let gifFinished = false;
      let gifTimeout: ReturnType<typeof setTimeout>;
      gif.on('finished', (blob: Blob) => {
        console.log('GIF Export: gif.on("finished") event fired.');
        gifFinished = true;
        isGifExporting = false;
        if (framesAdded === 0) {
          console.error('GIF Export: No frames were added. Export failed.');
          alert('GIF export failed: No frames were added.');
          return;
        }
        console.log('GIF Export: Finished encoding, starting download.');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `path-animation-${gifFps}fps-${Date.now()}.gif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('GIF Export: Download triggered.');
        clearTimeout(gifTimeout);
      });

      // Timeout fallback: alert if GIF export takes too long
      gifTimeout = setTimeout(() => {
        if (!gifFinished) {
          isGifExporting = false;
          console.error('GIF Export: Timed out waiting for GIF to finish.');
          alert('GIF export timed out. This may be due to a browser or memory issue. Try reducing the number of frames or closing other tabs.');
        }
      }, 60000); // 60 seconds

      gif.on('abort', () => {
        console.log('GIF Export: gif.on("abort") event fired.');
        isGifExporting = false;
        console.error('GIF Export: Encoding aborted.');
      });
      gif.on('error', (err: any) => {
        console.log('GIF Export: gif.on("error") event fired.', err);
        isGifExporting = false;
        console.error('GIF Export: Encoding error:', err);
      });

      console.log('GIF Export: About to call gif.render().');
      console.log('GIF Export: gif.workerScript =', (import.meta.env.BASE_URL || '/') + 'gif.worker.js');
      console.log('GIF Export: gif object:', gif);
      // Check if the worker script is accessible
      fetch((import.meta.env.BASE_URL || '/') + 'gif.worker.js')
        .then(r => {
          if (!r.ok) {
            console.error('GIF Export: gif.worker.js not found or not accessible!', r.status);
          } else {
            console.log('GIF Export: gif.worker.js is accessible.');
          }
        })
        .catch(e => {
          console.error('GIF Export: Error fetching gif.worker.js', e);
        });
      
      console.log('GIF Export: Starting GIF render...');
      if (framesAdded > 0) {
        gif.render();
      } else {
        console.error('GIF Export: No frames to render. Skipping gif.render().');
        alert('GIF export failed: No frames to render.');
      }

    } finally {
      percent = savedPercent;
      robotPercent = savedRobotPercent;
      if (wasPlaying) play();
      isGifExporting = false;
      if (overlayCanvas && overlayCanvas.parentNode) {
        overlayCanvas.parentNode.removeChild(overlayCanvas);
        console.log('GIF Export: Overlay canvas removed from DOM.');
      }
      if (backgroundCanvas && backgroundCanvas.parentNode) {
        backgroundCanvas.parentNode.removeChild(backgroundCanvas);
        console.log('GIF Export: Background canvas removed from DOM.');
      }
      if (finalCanvas && finalCanvas.parentNode) {
        finalCanvas.parentNode.removeChild(finalCanvas);
        console.log('GIF Export: Final canvas removed from DOM.');
      }
      console.log('GIF Export: State restored after export.');
    }
  }
  
  // Reactive binding for Navbar
  $: totalPathDuration = basePathDuration + totalWaitTime;
  $: basePathDuration = (100 * lines.length) / (0.65 * 0.1 * 1000);
  $: totalWaitTime = lines.reduce((sum, line) => sum + (line.waitTime || 0), 0);

  async function fpa(l: FPALine, s: FPASettings): Promise<Line> {
    let status = 'Starting optimization...';
    let result = null;
    // Convert to arrays, not JSON strings - this was the main issue!
    // If no obstacle vertices, create a small default obstacle outside the field
    const inputWaypoints = [l.startPoint, ...l.controlPoints, l.endPoint].map(p => [p.x, p.y]);

    // Extract heading degrees based on Point type
    let startHeadingDeg = 0;
    let endHeadingDeg = 0;

    if (l.startPoint.heading === "linear") {
      startHeadingDeg = l.startPoint.startDeg ?? 0;
    } else if (l.startPoint.heading === "constant") {
      startHeadingDeg = (l.startPoint as any).degrees ?? 0;
    }

    if (l.endPoint.heading === "linear") {
      endHeadingDeg = l.endPoint.endDeg ?? 0;
    } else if (l.endPoint.heading === "constant") {
      endHeadingDeg = (l.endPoint as any).degrees ?? 0;
    }

    console.log('FPA Optimization Parameters:');
    console.log('Waypoints:', inputWaypoints);
    console.log('Start heading:', startHeadingDeg);
    console.log('End heading:', endHeadingDeg);
    console.log('Settings:', s);

    const payload = {
                waypoints: inputWaypoints,
                start_heading_degrees: startHeadingDeg,
                end_heading_degrees: endHeadingDeg,
                x_velocity: s.xVelocity,
                y_velocity: s.yVelocity,
                angular_velocity: s.aVelocity,
                friction_coefficient: s.kFriction,
                robot_width: s.rWidth,
                robot_height: s.rHeight,
                min_coord_field: 0,
                max_coord_field: 144,
                interpolation: l.interpolation === "tangential" ? "tangent" : l.interpolation
    };
    try {
      result = await runOptimization(payload);
      status = 'Optimization Complete!';
    } catch (e: any) {
      status = 'Error: ' + e.message;
      throw e;
    }

    // result is already parsed JSON data, no need to call .json()
    const resultData = result;

    // Handle the new API format that returns optimized_waypoints
    let optimizedWaypoints;
    if (resultData.optimized_waypoints) {
      optimizedWaypoints = resultData.optimized_waypoints;
    } else if (Array.isArray(resultData)) {
      // Legacy format support
      optimizedWaypoints = resultData;
    } else {
      throw new Error('Unexpected result format from optimization API');
    }

    // Handle the different Point types based on heading
    let endPoint: Point;

    if (l.interpolation === "tangential") {
      endPoint = {
        x: optimizedWaypoints[optimizedWaypoints.length - 1][0],
        y: optimizedWaypoints[optimizedWaypoints.length - 1][1],
        heading: "tangential",
        reverse: l.endPoint.reverse ?? false
      };
    } else if (l.interpolation === "constant") {
      endPoint = {
        x: optimizedWaypoints[optimizedWaypoints.length - 1][0],
        y: optimizedWaypoints[optimizedWaypoints.length - 1][1],
        heading: "constant",
        degrees: (l.endPoint as any).degrees ?? 0
      };
    } else {
      // linear
      endPoint = {
        x: optimizedWaypoints[optimizedWaypoints.length - 1][0],
        y: optimizedWaypoints[optimizedWaypoints.length - 1][1],
        heading: "linear",
        startDeg: l.endPoint.startDeg ?? 0,
        endDeg: l.endPoint.endDeg ?? 0
      };
    }

    return {
      name: l.name,
      endPoint,
      color: l.color,
      controlPoints: optimizedWaypoints.slice(1, optimizedWaypoints.length - 1).map((p: number[]) => ({ x: p[0], y: p[1] }))
    }

    /*return {
        endPoint: { x: 36, y: 80, heading: "linear", startDeg: 0, endDeg: 0 },
        controlPoints: [],
        color: getRandomColor(),
      }*/
  }
  

    function sleep(ms: number) {
        return new Promise(res => setTimeout(res, ms));
    }

    export async function createTask(payload: any) {
        try {
            console.log('Creating optimization task with payload:', payload);
            const response = await fetch('https://fpa.pedropathing.com/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            console.log('Response status:', response.status);

            // Handle offline response from service worker
            if (response.status === 503) {
                const errorData = await response.json();
                if (errorData.error === 'offline') {
                    throw new Error('OFFLINE: ' + errorData.message);
                }
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Job created with ID:', data.job_id);
            return data.job_id;
        } catch (error) {
            console.error('Failed to create optimization task:', error);
            throw error;
        }
    }

    export async function pollForResult(jobId: string, pollInterval = 1000, maxTries = 60) {
        for (let i = 0; i < maxTries; i++) {
            try {
                const response = await fetch(`https://fpa.pedropathing.com/job/${jobId}`);

                // Handle offline response from service worker
                if (response.status === 503) {
                    const errorData = await response.json();
                    if (errorData.error === 'offline') {
                       console.log('OFFLINE: ' + errorData.message)
                        throw new Error('OFFLINE: ' + errorData.message);
                    }
                }

                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                const data = await response.json();
                if (data.status === 'completed' && data.result) {
                    return data.result;
                } else if (data.status === 'error') {
                    throw new Error('Optimization failed with error.');
                }
                await sleep(pollInterval);
            } catch (error) {
                console.error(`Polling attempt ${i + 1} failed:`, error);
                if (i === maxTries - 1) throw error; // Re-throw on last attempt
                await sleep(pollInterval);
            }
        }
        console.log('Polling timed out after', maxTries, 'attempts.')
        throw new Error('Timeout waiting for job result.');
    }

    // 3. Run Optimization - creates task, then polls for result and returns it
    export async function runOptimization(payload: any, pollInterval = 1000, maxTries = 60) {
        const jobId = await createTask(payload);
        const result = await pollForResult(jobId, pollInterval, maxTries);
        return result;
    }

  onMount(() => {
    two = new Two({
      fitted: true,
      type: Two.Types.svg,
    }).appendTo(twoElement);

    updateRobotImage();

    let currentElem: string | null = null;
    let isDown = false;

    two.renderer.domElement.addEventListener("mousemove", (evt: MouseEvent) => {
      const elem = document.elementFromPoint(evt.clientX, evt.clientY);
          if (isDown && currentElem) {
            const { x: xPos, y: yPos } = getMousePos(evt, two.renderer.domElement);
              // Handle path point dragging
              const line = Number(currentElem.split("-")[1]) - 1;
              const point = Number(currentElem.split("-")[2]);

              if (line === -1) {
                const p = clampXY(x.invert(xPos), y.invert(yPos));
                startPoint.x = p.x;
                startPoint.y = p.y;
              } else {
                if (point === 0) {
                  const p = clampXY(x.invert(xPos), y.invert(yPos));
                  lines[line].endPoint.x = p.x;
                  lines[line].endPoint.y = p.y;
                } else {
                  const p = clampXY(x.invert(xPos), y.invert(yPos));
                  lines[line].controlPoints[point - 1].x = p.x;
                  lines[line].controlPoints[point - 1].y = p.y;
                }
              }
      } else {
        if (elem?.id.startsWith("point") || elem?.id.startsWith("obstacle")) {
          two.renderer.domElement.style.cursor = "pointer";
          currentElem = elem.id;
        } else {
          two.renderer.domElement.style.cursor = $clickToPlaceMode ? "crosshair" : "auto";
          currentElem = null;
        }
      }
    });
    two.renderer.domElement.addEventListener("mousedown", () => {
      isDown = true;
    });
      two.renderer.domElement.addEventListener("mouseup", () => {
        isDown = false;
        saveToHistory(); // Save state after dragging point
      });
    // Drag point handler (fix teleportation)
    two.renderer.domElement.addEventListener("mousemove", (evt: MouseEvent) => {
      if (isDown && currentElem) {
        const { x: xPos, y: yPos } = getMousePos(evt, two.renderer.domElement);
        const parts = currentElem.split("-");
        const lineIdx = Number(parts[1]) - 1;
        const pointIdx = Number(parts[2]);
        if (lineIdx === -1) {
          const p = clampXY(x.invert(xPos), y.invert(yPos));
          startPoint.x = p.x;
          startPoint.y = p.y;
        } else {
          if (pointIdx === 0) {
            const p = clampXY(x.invert(xPos), y.invert(yPos));
            lines[lineIdx].endPoint.x = p.x;
            lines[lineIdx].endPoint.y = p.y;
          } else {
            const p = clampXY(x.invert(xPos), y.invert(yPos));
            lines[lineIdx].controlPoints[pointIdx - 1].x = p.x;
            lines[lineIdx].controlPoints[pointIdx - 1].y = p.y;
          }
        }
      }
    });
    // Click-to-place handler
    two.renderer.domElement.addEventListener("click", (evt: MouseEvent) => {
      if (!$clickToPlaceMode) return;
      const elem = document.elementFromPoint(evt.clientX, evt.clientY);
      if (elem?.id.startsWith("point")) return;
      const { x: xPos, y: yPos } = getMousePos(evt, two.renderer.domElement);
      const rawX = x.invert(xPos);
      const rawY = y.invert(yPos);
      const { x: newX, y: newY } = clampXY(rawX, rawY);
      lines = [
        ...lines,
        {
          name: `Path ${lines.length + 1}`,
          endPoint: {
            x: newX,
            y: newY,
            heading: "tangential",
            reverse: false,
          },
          controlPoints: [],
          color: getRandomColor(),
        },
      ];
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

    const updateScale = () => {
        x = d3
          .scaleLinear()
          .domain([0, 144])
          .range([0, twoElement?.clientWidth ?? 144]);

        y = d3
          .scaleLinear()
          .domain([0, 144])
          .range([twoElement?.clientHeight ?? 144, 0]);
      };

      const observer = new ResizeObserver(() => {
        updateScale();
      });

      observer.observe(twoElement);
  });

  function saveFile() {
    // Save robot size in export, but not in code display
    const jsonString = JSON.stringify({ startPoint, lines, robotWidth, robotHeight });

    const blob = new Blob([jsonString], { type: "application/json" });

    const linkObj = document.createElement("a");

    const url = URL.createObjectURL(blob);

    linkObj.href = url;
    linkObj.download = "trajectory.pp";

    document.body.appendChild(linkObj);

    linkObj.click();

    document.body.removeChild(linkObj);

    URL.revokeObjectURL(url);
  }

  function loadFile(evt: Event) {
    const elem = evt.target as HTMLInputElement;
    const file = elem.files?.[0];

    if (file) {
      const reader = new FileReader();

      reader.onload = function (e: ProgressEvent<FileReader>) {
        try {
          const result = e.target?.result as string;

          const jsonObj: {
            startPoint: Point;
            lines: Line[];
            robotWidth?: number;
            robotHeight?: number;
            shapes?: Shape[];
          } = JSON.parse(result);
          // Sanitize loaded coordinates to avoid out-of-bounds values
          sanitizePoint(jsonObj.startPoint);
          sanitizeLines(jsonObj.lines);
          startPoint = jsonObj.startPoint;
          lines = jsonObj.lines;
          if (typeof jsonObj.robotWidth === 'number') robotWidth = jsonObj.robotWidth;
          if (typeof jsonObj.robotHeight === 'number') robotHeight = jsonObj.robotHeight;
        } catch (err) {
          console.error(err);
        }
      };

      reader.readAsText(file);
    }
  }

  // Reactive robot image source
  let robotImageSrc: string = localStorage.getItem('robot.png') || '/robot.png';

  function loadRobot(evt: Event) {
    const elem = evt.target as HTMLInputElement;
    const file = elem.files?.[0];

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'];
    
    if (file && validTypes.includes(file.type)) {
      const reader = new FileReader();

      reader.onload = function (e: ProgressEvent<FileReader>) {
        const result = e.target?.result as string;
        localStorage.setItem('robot.png', result);
        robotImageSrc = result;
      };

      reader.readAsDataURL(file);
    } else {
      console.error("Invalid file type. Please upload a PNG, JPG, WEBP, GIF, or SVG file.");
      alert("Invalid file type. Please upload a PNG, JPG, WEBP, GIF, or SVG image.");
    }
  }

  function updateRobotImage() {
    const storedImage = localStorage.getItem('robot.png');
    if (storedImage) {
      robotImageSrc = storedImage;
    }
  }

  function addNewLine() {
    saveToHistory(); // Save state before making change
    let prev = lines[lines.length - 1]?.endPoint;
    let prevEndDeg = (prev && (prev.heading === 'linear' ? prev.endDeg : prev.heading === 'constant' ? prev.degrees : 0)) || 0;
    lines = [
      ...lines,
      {
        endPoint: {
          x: _.random(36, 108),
          y: _.random(36, 108),
          heading: "linear",
          startDeg: prevEndDeg,
          endDeg: prevEndDeg,
        } as Point,
        controlPoints: [],
        color: getRandomColor(),
      },
    ];
  }

  function addControlPoint() {
    if (lines.length > 0) {
      saveToHistory(); // Save state before making change
      const lastLine = lines[lines.length - 1];
      lastLine.controlPoints.push({
        x: _.random(36, 108),
        y: _.random(36, 108),
      });
      lines = [...lines]; // Trigger reactivity
    }
  }

  function removeControlPoint() {
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      if (lastLine.controlPoints.length > 0) {
        saveToHistory(); // Save state before making change
        lastLine.controlPoints.pop();
        lines = [...lines]; // Trigger reactivity
      }
    }
  }

hotkeys('w', function(event, handler){
  event.preventDefault();
  addNewLine();
});


hotkeys('a', function(event, handler){
  event.preventDefault();
  addControlPoint();
  two.update();
});

hotkeys('s', function(event, handler){
  event.preventDefault();
  removeControlPoint();
  two.update();
});

hotkeys('ctrl+z, command+z', function(event, handler){
  event.preventDefault();
  undo();
});

hotkeys('ctrl+y, command+y, ctrl+shift+z, command+shift+z', function(event, handler){
  event.preventDefault();
  redo();
});

// Reactive bindings for undo/redo button states
$: canUndo = undoStack.length > 0;
$: canRedo = redoStack.length > 0;

</script>


<Navbar bind:lines bind:startPoint bind:settings bind:robotWidth bind:robotHeight bind:percent bind:gifFps {saveFile} {loadFile} {loadRobot} {undo} {redo} {canUndo} {canRedo} {captureGif}/>

{#if centerLineWarning}
  <div class="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-2 rounded-lg shadow-lg border-2 border-red-800 font-bold text-lg animate-pulse">
    ⚠️ Path crosses center line!
  </div>
{/if}

{#if isGifExporting}
  <div style="position:fixed;top:0;left:0;width:100vw;z-index:9999;background:rgba(30,30,30,0.95);height:38px;display:flex;align-items:center;justify-content:center;transition:opacity 0.2s;">
    <div style="width:60vw;max-width:600px;background:#222;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px #0003;">
      <div style="height:18px;width:100%;background:#444;">
        <div style="height:100%;background:#4fd1c5;transition:width 0.2s;width: {gifRecordingProgress}%;"></div>
      </div>
      <div style="color:#fff;font-size:13px;padding:2px 12px 2px 12px;text-align:center;letter-spacing:0.5px;">
        Exporting GIF... {gifRecordingProgress}%
      </div>
    </div>
  </div>
{/if}

<div class="w-screen h-screen pt-16 pb-2 px-0 flex flex-row items-stretch overflow-hidden">
  <!-- LEFT: Field — flush to left, square sized by viewport height -->
  <div class="flex-shrink-0" style="height:calc(100vh - 4rem); width:calc(100vh - 4rem);">
    <div bind:this={fieldContainer} class="h-full w-full relative">
      <div bind:this={twoElement} class="w-full h-full bg-transparent relative overflow-visible">
        <img
          src="/Pedro-Visualzier-18127/fields/decode.webp"
          alt="Field"
          class="absolute top-0 left-0 w-full h-full z-10 pointer-events-none"
        />
        <MathTools {x} {y} {twoElement} {robotXY} />

        <!-- Primary Robot (active path) -->
        <img
          src={robotImageSrc}
          alt="Robot"
          style={`position: absolute; top: ${robotXY.y}px; left: ${robotXY.x}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${x(paths[activePathIndex]?.robotWidth ?? robotWidth)}px; height: ${x(paths[activePathIndex]?.robotHeight ?? robotHeight)}px; object-fit: fill;`}
        />

        <!-- Comparison mode: render ghost robots for other visible paths -->
        {#if comparisonMode}
          {#each paths as otherPath, idx}
                {#if idx !== activePathIndex && otherPath.visible}
                  {@const otherRobot = getPathRobotPosition(otherPath, computePathRobotPercentForGlobal(otherPath, percent))}
                  {#if Number.isFinite(otherRobot.x) && Number.isFinite(otherRobot.y)}
                    <div
                      class="absolute pointer-events-none"
                      style={`top: ${otherRobot.y}px; left: ${otherRobot.x}px; transform: translate(-50%, -50%) rotate(${otherRobot.heading}deg); z-index: 19; width: ${x(otherPath.robotWidth ?? robotWidth)}px; height: ${x(otherPath.robotHeight ?? robotHeight)}px; opacity: 0.45; border: 2px dashed ${otherPath.color}; border-radius: 4px;`}
                    >
                      <div class="w-full h-full flex items-center justify-center text-xs font-bold" style="color: {otherPath.color}">
                        {idx + 1}
                      </div>
                    </div>
                  {/if}
                {/if}
          {/each}
        {/if}
      </div>
    </div>
  </div>

  <!-- RIGHT: Controls / panels — fill remaining space -->
  <div class="flex-1 overflow-auto p-4">
    <div class="ui-shrink">
        <!-- Paths manager: collapsible controls for path save/compare -->
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <button
                class="px-2 py-1 rounded bg-blue-500 text-white text-sm"
                on:click={addNewPath}
              >
                + Add
              </button>
              <button class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-800 text-sm" on:click={() => { comparisonMode = !comparisonMode }}>
                {#if comparisonMode}Exit Compare{:else}Compare{/if}
              </button>
            </div>

            <div>
              <button class="text-sm font-semibold" on:click={() => (showPathsManager = !showPathsManager)}>
                {#if showPathsManager}▾ Paths{/if}{#if !showPathsManager}▸ Paths{/if}
              </button>
            </div>
          </div>

          {#if showPathsManager}
            <div class="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-md shadow-sm">
              {#each paths as p, idx}
                <div
                  class={`paths-row ${idx === activePathIndex ? 'selected' : ''} mb-2`}
                  role="button"
                  tabindex="0"
                  on:click={() => setActivePath(idx)}
                  on:keydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActivePath(idx);
                    }
                  }}
                >
                  <div class="idx-btn" style={`background:${p.color};`} aria-hidden>{idx + 1}</div>
                  <div class="flex-1 text-sm truncate">{p.name}</div>
                  <input title="Toggle Visible" type="checkbox" checked={p.visible} on:change={(e) => { e.stopPropagation(); togglePathVisibility(idx); }} />
                  <input
                    title="Color"
                    class="path-color"
                    type="color"
                    value={p.color}
                    on:input={(e) => { e.stopPropagation(); changePathColorFromEvent(idx, e); }}
                  />
                  <div class="flex items-center gap-1">
                    <input
                      type="number"
                      title="Robot width (inches)"
                      min="8"
                      max="36"
                      step="0.5"
                      value={p.robotWidth ?? robotWidth}
                      on:input={(e) => { e.stopPropagation(); updatePathRobotWidth(idx, e); }}
                      class="w-16 rounded-md pl-1.5 bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm"
                    />
                    <input
                      type="number"
                      title="Robot height (inches)"
                      min="8"
                      max="36"
                      step="0.5"
                      value={p.robotHeight ?? robotHeight}
                      on:input={(e) => { e.stopPropagation(); updatePathRobotHeight(idx, e); }}
                      class="w-16 rounded-md pl-1.5 bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm"
                    />
                  </div>
                  <button title="Delete" class="px-2 text-red-500" on:click={(e) => { e.stopPropagation(); deletePath(idx); }}>🗑</button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      <ControlTab
        bind:playing
        {play}
        {pause}
        bind:startPoint
        bind:lines
        bind:robotWidth
        bind:robotHeight
        bind:settings
        bind:percent
        bind:robotXY
        bind:robotHeading
        bind:playbackSpeed
        {x}
        {y}
      />
    </div>
  </div>
</div>

<style>
  .paths-row{
    display:flex;
    align-items:center;
    gap:0.5rem;
    padding:0.25rem 0.5rem;
    border-radius:0.5rem;
    cursor:pointer;
  }
  .paths-row:hover{ background: rgba(0,0,0,0.03); }
  .paths-row.selected{ background: rgba(99,102,241,0.06); box-shadow: inset 0 0 0 2px rgba(99,102,241,0.12); }
  .paths-row .idx-btn{
    width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700;
  }
  input.path-color{ -webkit-appearance:none; appearance:none; border:none; width:26px; height:26px; padding:0; border-radius:50%; background:transparent; }
  input.path-color::-webkit-color-swatch{ border-radius:50%; border:none; }
  input.path-color::-webkit-color-swatch-wrapper{ padding:0; }
  /* Keep inputs from stretching in dark mode */
  .paths-row input[type="checkbox"]{ width:auto; }
</style>
