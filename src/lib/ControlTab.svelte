<script lang="ts">
  import type {
    Point,
    Line,
    BasePoint,
    Settings,
    Shape,
    SequenceItem,
    PathChain,
  } from "../types";
  import _ from "lodash";
  import { getRandomColor } from "../utils";
  import ObstaclesSection from "./components/ObstaclesSection.svelte";
  import RobotPositionDisplay from "./components/RobotPositionDisplay.svelte";
  import StartingPointSection from "./components/StartingPointSection.svelte";
  import PathLineSection from "./components/PathLineSection.svelte";
  import WaitRow from "./components/WaitRow.svelte";
  import { calculatePathTime, formatTime } from "../utils";
  import {
    showRuler,
    showProtractor,
    showGrid,
    protractorLockToRobot,
    snapToGrid,
    gridSize,
  } from "../stores";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let pathChains: PathChain[] = [];
  export let robotWidth: number = 16;
  export let robotHeight: number = 16;
  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
  export let settings: Settings;
  export let optimizeLine: (lineId: string, targetControlPointIndex?: number) => void;
  export let optimizingLineIds: Record<string, boolean> = {};
  export let panelMode: "both" | "scene" | "paths" = "both";

  export let shapes: Shape[];
  export let recordChange: () => void;

  let activeTab: "scene" | "paths" = "paths";
  $: resolvedTab = panelMode === "both" ? activeTab : panelMode;
  $: if (panelMode !== "both" && activeTab !== panelMode) {
    activeTab = panelMode;
  }

  const makeChainId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const defaultChainName = "Main Chain";

  let selectedChainId = "";
  let chainNameDraft = "";
  let chainColorDraft = "#22c55e";
  let selectedChain: PathChain | null = null;
  let previousSelectedChainId = "";
  let chainOptions: Array<{ id: string; name: string; color: string }> = [];

  const getChainById = (chainId: string): PathChain | null =>
    pathChains.find((chain) => chain.id === chainId) || null;

  function getLinePrimaryChainId(lineId: string): string {
    for (const chain of pathChains) {
      if ((chain.lineIds || []).includes(lineId)) return chain.id;
    }
    return pathChains[0]?.id || "";
  }

  function syncLineColorsToChains() {
    const chainColorById = new Map(pathChains.map((chain) => [chain.id, chain.color || "#22c55e"]));
    let changed = false;
    const nextLines = lines.map((line) => {
      const ownerId = getLinePrimaryChainId(line.id || "");
      const targetColor = chainColorById.get(ownerId) || line.color;
      if (line.color !== targetColor) {
        changed = true;
        return { ...line, color: targetColor };
      }
      return line;
    });
    if (changed) {
      lines = nextLines;
    }
  }

  function ensureDefaultChain() {
    if (pathChains.length === 0) {
      pathChains = [
        {
          id: makeChainId(),
          name: defaultChainName,
          color: getRandomColor(),
          lineIds: lines.map((ln) => ln.id!).filter(Boolean),
        },
      ];
      selectedChainId = pathChains[0]?.id || "";
      return;
    }

    if (!selectedChainId || !pathChains.some((c) => c.id === selectedChainId)) {
      selectedChainId = pathChains[0]?.id || "";
    }
  }

  $: {
    const normalized = pathChains.map((chain) => ({
      ...chain,
      color: chain.color || getRandomColor(),
      lineIds: chain.lineIds || [],
    }));
    if (JSON.stringify(normalized) !== JSON.stringify(pathChains)) {
      pathChains = normalized;
    }
  }

  $: ensureDefaultChain();

  $: selectedChain =
    pathChains.find((chain) => chain.id === selectedChainId) || pathChains[0] || null;

  $: if (selectedChainId !== previousSelectedChainId) {
    chainNameDraft = selectedChain?.name || "";
    chainColorDraft = selectedChain?.color || "#22c55e";
    previousSelectedChainId = selectedChainId;
  }

  function ensureLineInDefaultChain(lineId: string) {
    if (!lineId || !pathChains.length) return;
    assignLineToChain(lineId, pathChains[0].id);
  }

  function removeLineFromChains(lineId: string) {
    if (!lineId) return;
    const updated = pathChains.map((chain) => ({
        ...chain,
        lineIds: chain.lineIds.filter((id) => id !== lineId),
      }));
    pathChains = updated;
    ensureDefaultChain();
    syncLineColorsToChains();
  }

  function assignLineToChain(lineId: string, chainId: string) {
    if (!lineId || !chainId) return;
    pathChains = pathChains.map((chain) => ({
      ...chain,
      lineIds: chain.lineIds.filter((id) => id !== lineId),
    }));

    const target = getChainById(chainId);
    if (!target) return;

    pathChains = pathChains.map((chain) => {
      if (chain.id !== chainId) return chain;
      return {
        ...chain,
        lineIds: Array.from(new Set([...(chain.lineIds || []), lineId])),
      };
    });

    syncLineColorsToChains();
    recordChange?.();
  }

  function addPathChain() {
    const newChain: PathChain = {
      id: makeChainId(),
      name: `Chain ${pathChains.length + 1}`,
      color: getRandomColor(),
      lineIds: [],
    };
    pathChains = [...pathChains, newChain];
    selectedChainId = newChain.id;
    recordChange?.();
  }

  function getDistinctChainColor(preferred?: string): string {
    const disallowed = new Set(pathChains.map((chain) => (chain.color || "").toLowerCase()));
    if (preferred) {
      disallowed.add(preferred.toLowerCase());
    }

    let candidate = getRandomColor();
    let attempts = 0;
    while (disallowed.has(candidate.toLowerCase()) && attempts < 16) {
      candidate = getRandomColor();
      attempts += 1;
    }
    return candidate;
  }

  function duplicateSelectedPathChain() {
    if (!selectedChain) return;

    const sourceLineIds = selectedChain.lineIds || [];
    const selectedLineSet = new Set(sourceLineIds);
    const lineLookup = new Map(lines.map((line) => [line.id, line]));
    const idMap = new Map<string, string>();
    const clonedLines: Line[] = [];

    // Keep duplication order aligned with timeline, then append any non-sequenced lines.
    const orderedSourceIds: string[] = [];
    sequence.forEach((item) => {
      if (item.kind === "path" && selectedLineSet.has(item.lineId)) {
        orderedSourceIds.push(item.lineId);
      }
    });
    sourceLineIds.forEach((lineId) => {
      if (!orderedSourceIds.includes(lineId)) {
        orderedSourceIds.push(lineId);
      }
    });

    orderedSourceIds.forEach((sourceId, index) => {
      const sourceLine = lineLookup.get(sourceId);
      if (!sourceLine) return;
      const clone = JSON.parse(JSON.stringify(sourceLine)) as Line;
      const newLineId = makeId();
      clone.id = newLineId;
      clone.name = `${sourceLine.name || `Path ${lines.length + index + 1}`} Copy`;
      idMap.set(sourceId, newLineId);
      clonedLines.push(clone);
    });

    const newSequence: SequenceItem[] = [...sequence];
    const appendedCloneItems: SequenceItem[] = [];

    // Keep original run order untouched, then append all cloned paths after it.
    orderedSourceIds.forEach((sourceId) => {
      const clonedId = idMap.get(sourceId);
      if (clonedId) {
        appendedCloneItems.push({ kind: "path", lineId: clonedId });
      }
    });
    newSequence.push(...appendedCloneItems);

    lines = [...lines, ...clonedLines];
    sequence = newSequence;
    syncLinesToSequence(newSequence);

    const duplicateChain: PathChain = {
      id: makeChainId(),
      name: `${selectedChain.name} Copy`,
      color: getDistinctChainColor(selectedChain.color),
      lineIds: orderedSourceIds.map((sourceId) => idMap.get(sourceId)).filter(Boolean) as string[],
    };

    const selectedIndex = pathChains.findIndex((chain) => chain.id === selectedChain.id);
    if (selectedIndex >= 0) {
      pathChains = [
        ...pathChains.slice(0, selectedIndex + 1),
        duplicateChain,
        ...pathChains.slice(selectedIndex + 1),
      ];
    } else {
      pathChains = [...pathChains, duplicateChain];
    }

    selectedChainId = duplicateChain.id;
    syncLineColorsToChains();
    recordChange?.();
  }

  function removeSelectedPathChain() {
    if (!selectedChain || pathChains.length <= 1) return;
    const fallbackChainId = pathChains.find((chain) => chain.id !== selectedChain.id)?.id;
    const orphanedLines = [...(selectedChain.lineIds || [])];
    pathChains = pathChains.filter((chain) => chain.id !== selectedChain.id);

    if (fallbackChainId) {
      orphanedLines.forEach((lineId) => assignLineToChain(lineId, fallbackChainId));
    }

    selectedChainId = pathChains[0]?.id || "";
    syncLineColorsToChains();
    recordChange?.();
  }

  function updateSelectedChainName() {
    if (!selectedChain) return;
    const nextName = chainNameDraft.trim();
    if (!nextName) return;
    pathChains = pathChains.map((chain) =>
      chain.id === selectedChain.id ? { ...chain, name: nextName } : chain,
    );
    recordChange?.();
  }

  function updateSelectedChainColor() {
    if (!selectedChain) return;
    pathChains = pathChains.map((chain) =>
      chain.id === selectedChain.id ? { ...chain, color: chainColorDraft } : chain,
    );
    syncLineColorsToChains();
    recordChange?.();
  }

  $: chainOptions = pathChains.map((chain) => ({
    id: chain.id,
    name: chain.name,
    color: chain.color || "#22c55e",
  }));

  $: syncLineColorsToChains();

  // Reference exported but unused props to silence Svelte unused-export warnings

  $: robotWidth;
  $: robotHeight;

  // Compute timeline markers for the UI (start of each travel segment)
  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);
  $: markers = (() => {
    const _markers: { percent: number; color: string; name: string }[] = [];
    if (
      !timePrediction ||
      !timePrediction.timeline ||
      timePrediction.totalTime <= 0
    )
      return _markers;

    timePrediction.timeline.forEach((ev) => {
      if ((ev as any).type === "travel") {
        const end = (ev as any).endTime as number;
        const pct = (end / timePrediction.totalTime) * 100;
        const lineIndex = (ev as any).lineIndex as number;
        const line = lines[lineIndex];
        const color = line?.color || "#ffffff";
        const name = line?.name || `Path ${lineIndex + 1}`;
        _markers.push({ percent: pct, color, name });
      }
    });

    return _markers;
  })();

  $: pathCount = lines.length;
  $: waitCount = sequence.filter((item) => item.kind === "wait").length;
  $: obstacleCount = shapes.length;
  $: totalDurationLabel = formatTime(timePrediction?.totalTime || 0);


  // State for collapsed sections
  let collapsedSections = {
    obstacles: shapes.map(() => true),
    lines: lines.map(() => false),
    controlPoints: lines.map(() => true), // Start with control points collapsed
  };

  // Collapsed state for obstacles (default collapsed)
  let collapsedObstacles = shapes.map(() => true);
  let obstaclesDropdownOpen = false;
  const gridSizeOptions = [0, 1, 3, 6, 12, 24];

  function cycleGridSize() {
    if (!$showGrid) {
      showGrid.set(true);
      gridSize.set(gridSizeOptions[1]);
      return;
    }
    const currentIndex = gridSizeOptions.indexOf($gridSize);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= gridSizeOptions.length) {
      showGrid.set(false);
      return;
    }
    const nextSize = gridSizeOptions[nextIndex];
    gridSize.set(nextSize);
    if (nextSize === 0) {
      showGrid.set(false);
    }
  }

  // Reactive statements to update UI state when lines or shapes change from file load
  $: if (lines.length !== collapsedSections.lines.length) {
    collapsedSections = {
      obstacles: collapsedSections.obstacles ?? shapes.map(() => true),
      lines: lines.map(() => false),
      controlPoints: lines.map(() => true),
    };
  }

  // Keep obstacle collapse state aligned with shapes list
  $: if (shapes.length !== collapsedObstacles.length) {
    collapsedObstacles = shapes.map(() => true);
  }

  $: if (!collapsedSections.obstacles || shapes.length !== collapsedSections.obstacles.length) {
    collapsedSections = {
      ...collapsedSections,
      obstacles: shapes.map(() => true),
    };
  }

  const makeId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  function getWait(i: any) {
    return i as any;
  }

  function insertLineAfter(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    const currentLine = lines[lineIndex];

    // Find the next path item in the sequence after seqIndex
    let nextPathSeqIndex = -1;
    for (let i = seqIndex + 1; i < sequence.length; i++) {
      if (sequence[i].kind === "path") {
        nextPathSeqIndex = i;
        break;
      }
    }

    // If there is no next path in sequence, fall back to addLine behavior (append new randomized point)
    let newPoint: Point | null = null;
    if (nextPathSeqIndex !== -1) {
      const nextLineId = (sequence[nextPathSeqIndex] as any).lineId;
      const nextLine = lines.find((l) => l.id === nextLineId);
      if (
        nextLine &&
        nextLine.endPoint &&
        currentLine &&
        currentLine.endPoint
      ) {
        const a = currentLine.endPoint;
        const b = nextLine.endPoint;
        const midX = (Number(a.x) + Number(b.x)) / 2;
        const midY = (Number(a.y) + Number(b.y)) / 2;
        newPoint = {
          x: midX,
          y: midY,
          heading: "tangential",
          reverse: false,
        };
      }
    }

    if (!newPoint) {
      // fallback: random nearby point from current end
      if (currentLine && currentLine.endPoint) {
        newPoint = {
          x: (currentLine.endPoint.x ?? 72) + _.random(-12, 12),
          y: (currentLine.endPoint.y ?? 72) + _.random(-12, 12),
          heading: "tangential",
          reverse: false,
        };
      } else {
        newPoint = {
          x: _.random(0, 141.5),
          y: _.random(0, 141.5),
          heading: "tangential",
          reverse: false,
        };
      }
    }

    const newLine = {
      id: makeId(),
      endPoint: newPoint,
      controlPoints: [],
      color: getRandomColor(),
      name: `Path ${lines.length + 1}`,
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Insert the new line after the current one and a sequence item after current seq index
    const newLines = [...lines];
    newLines.splice(lineIndex + 1, 0, newLine);
    lines = newLines;

    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;
    ensureLineInDefaultChain(newLine.id!);

    collapsedSections.lines.splice(lineIndex + 1, 0, false);
    collapsedSections.controlPoints.splice(lineIndex + 1, 0, true);

    // Force reactivity
    collapsedSections = { ...collapsedSections };
  }

  // Insert a midpoint between this path and the next path in sequence
  function insertMidpointAfter(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    const currentLine = lines[lineIndex];

    // Find the next path in sequence
    let nextPathSeqIndex = -1;
    for (let i = seqIndex + 1; i < sequence.length; i++) {
      if (sequence[i].kind === "path") {
        nextPathSeqIndex = i;
        break;
      }
    }

    if (nextPathSeqIndex === -1) {
      // no next path -> do nothing or fallback
      return;
    }

    const nextLineId = (sequence[nextPathSeqIndex] as any).lineId;
    const nextLine = lines.find((l) => l.id === nextLineId);
    if (!currentLine || !nextLine) return;

    const a = currentLine.endPoint;
    const b = nextLine.endPoint;
    const midX = (Number(a.x) + Number(b.x)) / 2;
    const midY = (Number(a.y) + Number(b.y)) / 2;

    const newLine: Line = {
      id: makeId(),
      endPoint: {
        x: midX,
        y: midY,
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      name: `Path ${lines.length + 1}`,
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Insert into lines right after current line index
    const newLines = [...lines];
    newLines.splice(lineIndex + 1, 0, newLine);
    lines = newLines;

    // Insert into sequence right after seqIndex
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;
    ensureLineInDefaultChain(newLine.id!);

    collapsedSections.lines.splice(lineIndex + 1, 0, false);
    collapsedSections.controlPoints.splice(lineIndex + 1, 0, true);

    collapsedSections = { ...collapsedSections };
    recordChange();
  }

  function removeLine(idx: number) {
    const removedId = lines[idx]?.id;
    let _lns = lines;
    lines.splice(idx, 1);
    lines = _lns;
    if (removedId) {
      sequence = sequence.filter(
        (s) => s.kind === "wait" || s.lineId !== removedId,
      );
      removeLineFromChains(removedId);
    }
    collapsedSections.lines.splice(idx, 1);
    collapsedSections.controlPoints.splice(idx, 1);
    recordChange();
  }

  function addLine() {
    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: {
        x: _.random(0, 141.5),
        y: _.random(0, 141.5),
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };
    lines = [...lines, newLine];
    sequence = [...sequence, { kind: "path", lineId: newLine.id! }];
    ensureLineInDefaultChain(newLine.id!);
    collapsedSections.lines.push(false);
    collapsedSections.controlPoints.push(true);
    recordChange();
  }

  // Add a control point to the line represented by `seqIndex` in the sequence
  function addControlPointToLine(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    if (lineIndex === -1) return;
    const line = lines[lineIndex];
    line.controlPoints = line.controlPoints || [];
    const prevPt = lineIndex === 0 ? startPoint : lines[lineIndex - 1].endPoint;
    const endPt = line.endPoint || { x: 72, y: 72 };
    const mx = ((prevPt?.x ?? 72) + (endPt?.x ?? 72)) / 2;
    const my = ((prevPt?.y ?? 72) + (endPt?.y ?? 72)) / 2;
    line.controlPoints.push({
      x: mx + _.random(-4, 4),
      y: my + _.random(-4, 4),
    });
    collapsedSections.controlPoints[lineIndex] = false;
    lines = [...lines];
    collapsedSections = { ...collapsedSections };
    recordChange?.();
  }

  // Add a control point to the last path in `lines` (fallback: create a new line)
  function addControlPointToLastLine() {
    if (!lines || lines.length === 0) {
      // No lines exist: create a new line instead
      addLine();
      return;
    }

    // Prefer adding to the first line whose control points are expanded (user is focusing it)
    let targetIdx = collapsedSections.controlPoints.findIndex(
      (v) => v === false,
    );
    if (targetIdx === -1) targetIdx = lines.length - 1;

    const line = lines[targetIdx];
    line.controlPoints = line.controlPoints || [];
    // Insert a control point near the line midpoint for convenience
    const prevPt = targetIdx === 0 ? startPoint : lines[targetIdx - 1].endPoint;
    const endPt = line.endPoint || { x: 72, y: 72 };
    const mx = ((prevPt?.x ?? 72) + (endPt?.x ?? 72)) / 2;
    const my = ((prevPt?.y ?? 72) + (endPt?.y ?? 72)) / 2;
    line.controlPoints.push({
      x: mx + _.random(-4, 4),
      y: my + _.random(-4, 4),
    });
    // Ensure control points UI is expanded for this line
    collapsedSections.controlPoints[targetIdx] = false;
    lines = [...lines];
    collapsedSections = { ...collapsedSections };
    recordChange?.();
  }

  function addWait() {
    const wait = {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 0,
      locked: false,
    } as SequenceItem;
    sequence = [...sequence, wait];
  }

  function addWaitAtStart() {
    const wait = {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 0,
      locked: false,
    } as SequenceItem;
    sequence = [wait, ...sequence];
  }

  function addPathAtStart() {
    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: {
        x: _.random(0, 141.5),
        y: _.random(0, 141.5),
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };
    lines = [newLine, ...lines];
    sequence = [{ kind: "path", lineId: newLine.id! }, ...sequence];
    ensureLineInDefaultChain(newLine.id!);
    collapsedSections.lines = [false, ...collapsedSections.lines];
    collapsedSections.controlPoints = [
      true,
      ...collapsedSections.controlPoints,
    ];
    recordChange();
  }

  function insertWaitAfter(seqIndex: number) {
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 0,
      locked: false,
    });
    sequence = newSeq;
  }

  function insertPathAfter(seqIndex: number) {
    // Create a new line with default settings
    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Add the new line to the lines array
    lines = [...lines, newLine];

    // Insert the new path in the sequence after the wait
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;
    ensureLineInDefaultChain(newLine.id!);

    // Add UI state for the new line
    collapsedSections.lines.push(false);
    collapsedSections.controlPoints.push(true);

    // Force reactivity
    collapsedSections = { ...collapsedSections };
    recordChange();
  }

  function syncLinesToSequence(newSeq: SequenceItem[]) {
    const pathOrder = newSeq
      .filter((item) => item.kind === "path")
      .map((item) => item.lineId);

    const indexedLines = lines.map((line, idx) => ({
      line,
      collapsed: collapsedSections.lines[idx],
      control: collapsedSections.controlPoints[idx],
    }));

    const byId = new Map(indexedLines.map((entry) => [entry.line.id, entry]));
    const reordered: typeof indexedLines = [];

    pathOrder.forEach((id) => {
      const entry = byId.get(id);
      if (entry) {
        reordered.push(entry);
        byId.delete(id);
      }
    });

    // Append any lines that are not currently in the sequence to preserve data
    reordered.push(...byId.values());

    lines = reordered.map((entry) => entry.line);
    collapsedSections = {
      ...collapsedSections,
      lines: reordered.map((entry) => entry.collapsed ?? false),
      controlPoints: reordered.map((entry) => entry.control ?? true),
    };
    // No collapsedEventMarkers to update
  }

  function moveSequenceItem(seqIndex: number, delta: number) {
    const targetIndex = seqIndex + delta;
    if (targetIndex < 0 || targetIndex >= sequence.length) return;

    // Prevent moving if either the source or target is a locked path or a locked wait
    const isLockedSequenceItem = (index: number) => {
      const it = sequence[index];
      if (!it) return false;
      if (it.kind === "path") {
        const ln = lines.find((l) => l.id === it.lineId);
        return ln?.locked ?? false;
      }
      // wait
      if (it.kind === "wait") {
        return (it as any).locked ?? false;
      }
      return false;
    };

    if (isLockedSequenceItem(seqIndex) || isLockedSequenceItem(targetIndex))
      return;

    const newSeq = [...sequence];
    const [item] = newSeq.splice(seqIndex, 1);
    newSeq.splice(targetIndex, 0, item);
    sequence = newSeq;

    syncLinesToSequence(newSeq);
    recordChange?.();
  }
</script>

<div class="w-full h-full flex flex-col justify-start items-center gap-1.5 min-w-0 text-[12px] leading-tight">
  <div class="w-full h-full overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 shadow-lg flex flex-col">
    <div class="border-b border-neutral-200 dark:border-neutral-700 px-2.5 py-2 bg-neutral-50 dark:bg-neutral-900">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">Workspace</p>
          <h2 class="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-50">Path Inspector</h2>
          <p class="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            {panelMode === "scene"
              ? "Scene and setup controls."
              : panelMode === "paths"
                ? "Paths, timeline, and playback controls."
                : "Keep scene edits, path edits, and playback controls separated."}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
          <div class="rounded-full border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-800">
            {pathCount} paths
          </div>
          <div class="rounded-full border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-800">
            {waitCount} waits
          </div>
          <div class="rounded-full border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-800">
            {obstacleCount} obstacles
          </div>
          <div class="rounded-full border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-800">
            {totalDurationLabel}
          </div>
        </div>
      </div>

      {#if panelMode === "both"}
        <div class="mt-2 flex rounded-xl bg-neutral-100 dark:bg-neutral-800 p-1">
        <button
          on:click={() => (activeTab = "scene")}
          class="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200"
          class:bg-white={activeTab === "scene"}
          class:dark:bg-neutral-900={activeTab === "scene"}
          class:text-neutral-900={activeTab === "scene"}
          class:dark:text-neutral-50={activeTab === "scene"}
          class:shadow-sm={activeTab === "scene"}
          class:text-neutral-500={activeTab !== "scene"}
          class:dark:text-neutral-300={activeTab !== "scene"}
        >
          Scene
        </button>
        <button
          on:click={() => (activeTab = "paths")}
          class="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200"
          class:bg-white={activeTab === "paths"}
          class:dark:bg-neutral-900={activeTab === "paths"}
          class:text-neutral-900={activeTab === "paths"}
          class:dark:text-neutral-50={activeTab === "paths"}
          class:shadow-sm={activeTab === "paths"}
          class:text-neutral-500={activeTab !== "paths"}
          class:dark:text-neutral-300={activeTab !== "paths"}
        >
          Paths & Timeline
        </button>
        </div>
      {/if}
    </div>

    <div class="flex-1 overflow-y-auto overflow-x-hidden p-2">
      {#if resolvedTab === "scene"}
        <div class="space-y-2">
          <section class="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2 shadow-sm">
            <div class="flex flex-wrap items-center gap-2">
              <button
                title={$showGrid ? `Grid: ${$gridSize}\" (click to cycle)` : "Toggle Grid"}
                on:click={cycleGridSize}
                class="inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]"
                class:border-blue-300={$showGrid}
                class:text-blue-700={$showGrid}
                class:bg-blue-50={$showGrid}
                class:border-neutral-300={!$showGrid}
                class:text-neutral-700={!$showGrid}
                class:bg-neutral-50={!$showGrid}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="3" y1="15" x2="21" y2="15"></line>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                  <line x1="15" y1="3" x2="15" y2="21"></line>
                </svg>
                {#if $showGrid}
                  <span class="text-[10px]">{$gridSize}\"</span>
                {/if}
              </button>

              <button
                title="Toggle Ruler"
                on:click={() => showRuler.update((v) => !v)}
                class="inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]"
                class:border-blue-300={$showRuler}
                class:text-blue-700={$showRuler}
                class:bg-blue-50={$showRuler}
                class:border-neutral-300={!$showRuler}
                class:text-neutral-700={!$showRuler}
                class:bg-neutral-50={!$showRuler}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0z"
                  ></path>
                  <path d="m14.5 12.5 2-2"></path>
                  <path d="m11.5 9.5 2-2"></path>
                  <path d="m8.5 6.5 2-2"></path>
                  <path d="m17.5 15.5 2-2"></path>
                </svg>
              </button>

              <button
                title="Toggle Compass"
                on:click={() => showProtractor.update((v) => !v)}
                class="inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]"
                class:border-blue-300={$showProtractor}
                class:text-blue-700={$showProtractor}
                class:bg-blue-50={$showProtractor}
                class:border-neutral-300={!$showProtractor}
                class:text-neutral-700={!$showProtractor}
                class:bg-neutral-50={!$showProtractor}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 21a9 9 0 1 1 0-18c2.52 0 4.93 1 6.74 2.74L21 8"></path>
                  <path d="M12 3v6l3.7 2.7"></path>
                </svg>
              </button>

              {#if $showProtractor}
                <button
                  title={$protractorLockToRobot ? "Unlock Compass from Robot" : "Lock Compass to Robot"}
                  on:click={() => protractorLockToRobot.update((v) => !v)}
                  class="inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]"
                  class:border-amber-300={$protractorLockToRobot}
                  class:text-amber-700={$protractorLockToRobot}
                  class:bg-amber-50={$protractorLockToRobot}
                  class:border-neutral-300={!$protractorLockToRobot}
                  class:text-neutral-700={!$protractorLockToRobot}
                  class:bg-neutral-50={!$protractorLockToRobot}
                >
                  Lock
                </button>
              {/if}
            </div>
          </section>

          <section class="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2 shadow-sm">
            <button
              on:click={() => (obstaclesDropdownOpen = !obstaclesDropdownOpen)}
              class="w-full flex items-center justify-between gap-2 text-left"
              aria-expanded={obstaclesDropdownOpen}
            >
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">Obstacles</p>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={2}
                stroke="currentColor"
                class="size-4 transition-transform duration-200"
                class:rotate-180={obstaclesDropdownOpen}
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m19.5 8.25-7.5 7.5-7.5-7.5"
                />
              </svg>
            </button>

            {#if obstaclesDropdownOpen}
              <div class="mt-2 border-t border-neutral-200 dark:border-neutral-700 pt-2">
                <ObstaclesSection bind:shapes bind:collapsedObstacles />
              </div>
            {/if}
          </section>

          <section class="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2 shadow-sm">
            <RobotPositionDisplay {robotXY} {robotHeading} {x} {y} />
          </section>

          <section class="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2 shadow-sm">
            <StartingPointSection bind:startPoint />
          </section>
        </div>
      {:else}
        <div class="flex h-full min-h-0 flex-col gap-2">
          <section class="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2 shadow-sm">
            <div class="flex items-center justify-between gap-3 mb-2">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">Path Chains</p>
                <p class="text-xs text-neutral-500 dark:text-neutral-400">Assign related paths to a shared color and workflow.</p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-1.5">
              <select
                bind:value={selectedChainId}
                class="min-w-0 flex-1 px-2 py-1.5 text-xs rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
              >
                {#each pathChains as chain (chain.id)}
                  <option value={chain.id}>{chain.name} ({(chain.lineIds || []).length})</option>
                {/each}
              </select>
              <button on:click={addPathChain} class="px-2 py-1.5 text-xs rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900/80 dark:text-emerald-100">New</button>
              <button on:click={duplicateSelectedPathChain} class="px-2 py-1.5 text-xs rounded-lg bg-indigo-100 text-indigo-800 dark:bg-indigo-900/80 dark:text-indigo-100">Duplicate</button>
              <button
                on:click={removeSelectedPathChain}
                disabled={pathChains.length <= 1}
                class="px-2 py-1.5 text-xs rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-900/80 dark:text-rose-100 disabled:opacity-40"
              >
                Remove
              </button>
            </div>

            {#if selectedChain}
              <div class="mt-2 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  type="text"
                  bind:value={chainNameDraft}
                  on:input={updateSelectedChainName}
                  class="w-full px-2 py-1.5 text-xs rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
                  placeholder="Chain name"
                />

                <div class="flex items-center gap-2">
                  <input
                    type="color"
                    bind:value={chainColorDraft}
                    on:input={updateSelectedChainColor}
                    class="w-10 h-8 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
                    title="Path chain color"
                  />
                  <span class="text-xs text-neutral-500 dark:text-neutral-400">Path color</span>
                </div>
              </div>
            {/if}
          </section>

          <section class="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2 shadow-sm flex min-h-0 flex-1 flex-col">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">Sequence</p>
                <p class="text-xs text-neutral-500 dark:text-neutral-400">Reorder paths and waits in the order they will run.</p>
              </div>

              <div class="flex flex-wrap items-center gap-1.5">
                <button
                  on:click={addLine}
                  class="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width={2}
                    stroke="currentColor"
                    class="size-4"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                  Add Path
                </button>

                <button
                  on:click={addWait}
                  class="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="size-4"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 7v5l3 2"
                    />
                  </svg>
                  Add Wait
                </button>
              </div>
            </div>

            <div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {#each sequence as item, sIdx}
                <div class="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm p-1.5">
                  {#if item.kind === "path"}
                    {#each lines.filter((l) => l.id === item.lineId) as ln (ln.id)}
                      <PathLineSection
                        bind:line={ln}
                        idx={lines.findIndex((l) => l.id === ln.id)}
                        bind:lines
                        bind:collapsed={
                          collapsedSections.lines[lines.findIndex((l) => l.id === ln.id)]
                        }
                        bind:collapsedControlPoints={
                          collapsedSections.controlPoints[
                            lines.findIndex((l) => l.id === ln.id)
                          ]
                        }
                        onRemove={() =>
                          removeLine(lines.findIndex((l) => l.id === ln.id))}
                        onInsertAfter={() => addControlPointToLine(sIdx)}
                        onInsertMidpoint={() => insertMidpointAfter(sIdx)}
                        onAddWaitAfter={() => insertWaitAfter(sIdx)}
                        onMoveUp={() => moveSequenceItem(sIdx, -1)}
                        onMoveDown={() => moveSequenceItem(sIdx, 1)}
                        canMoveUp={sIdx !== 0}
                        canMoveDown={sIdx !== sequence.length - 1}
                        optimizeLine={optimizeLine}
                        optimizing={optimizingLineIds?.[ln.id ?? ""] ?? false}
                        chainOptions={chainOptions}
                        selectedChainId={getLinePrimaryChainId(ln.id || "")}
                        onChainChange={(chainId) => assignLineToChain(ln.id || "", chainId)}
                        {recordChange}
                      />
                    {/each}
                  {:else}
                    <WaitRow
                      name={getWait(item).name}
                      durationMs={getWait(item).durationMs}
                      locked={getWait(item).locked ?? false}
                      onToggleLock={() => {
                        const newSeq = [...sequence];
                        newSeq[sIdx] = {
                          ...getWait(item),
                          locked: !(getWait(item).locked ?? false),
                        };
                        sequence = newSeq;
                        recordChange?.();
                      }}
                      onChange={(newName, newDuration) => {
                        const newSeq = [...sequence];
                        newSeq[sIdx] = {
                          ...getWait(item),
                          name: newName,
                          durationMs: Math.max(0, Number(newDuration) || 0),
                        };
                        sequence = newSeq;
                      }}
                      onRemove={() => {
                        const newSeq = [...sequence];
                        newSeq.splice(sIdx, 1);
                        sequence = newSeq;
                      }}
                      onInsertAfter={() => {
                        const newSeq = [...sequence];
                        newSeq.splice(sIdx + 1, 0, {
                          kind: "wait",
                          id: makeId(),
                          name: "Wait",
                          durationMs: 0,
                          locked: false,
                        });
                        sequence = newSeq;
                      }}
                      onAddPathAfter={() => insertPathAfter(sIdx)}
                      onMoveUp={() => moveSequenceItem(sIdx, -1)}
                      onMoveDown={() => moveSequenceItem(sIdx, 1)}
                      canMoveUp={sIdx !== 0}
                      canMoveDown={sIdx !== sequence.length - 1}
                    />
                  {/if}
                </div>
              {/each}
            </div>
          </section>
        </div>
      {/if}
    </div>
  </div>
</div>
