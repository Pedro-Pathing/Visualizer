<script lang="ts">
  import { run } from "svelte/legacy";

  import type {
    AtomicPath,
    CompoundPath,
    Path,
    BasePoint,
    Settings,
    Shape,
    SequenceItem,
    StartPose,
  } from "../types";
  import type * as d3 from "d3";
  import ObstaclesSection from "./components/ObstaclesSection.svelte";
  import RobotPositionDisplay from "./components/RobotPositionDisplay.svelte";
  import StartingPointSection from "./components/StartingPointSection.svelte";
  import PlaybackControls from "./components/PlaybackControls.svelte";
  import { calculateVisualizationPathTime, normalizePaths } from "../utils";
  import SelectedPathInspector from "./components/SelectedPathInspector.svelte";
  import SelectedGroupInspector from "./components/SelectedGroupInspector.svelte";
  import { curveThroughPoints } from "../utils/math";
  import {
    atomicSegments,
    findPathById,
    replaceSegment,
    updatePath,
  } from "../utils/pathTraversal";

  interface Props {
    percent: number;
    playing: boolean;
    play: () => any;
    pause: () => any;
    startPoint: StartPose;
    lines: Path[];
    sequence: SequenceItem[];
    selectedLineId?: string | null;
    /** The primary selection, which may be a group. */
    selectedPathId?: string | null;
    /** Selection is owned by the app, so changes are reported rather than bound. */
    onSelectPath: (id: string | null) => void;
    onUngroup: () => void;
    selectedPointIndex?: number;
    robotXY: BasePoint;
    robotHeading: number;
    x: d3.ScaleLinear<number, number>;
    y: d3.ScaleLinear<number, number>;
    settings: Settings;
    handleSeek: (percent: number) => void;
    loopAnimation: boolean;
    shapes: Shape[];
    recordChange: () => void;
  }

  let {
    percent = $bindable(),
    playing = $bindable(),
    play,
    pause,
    startPoint = $bindable(),
    lines = $bindable(),
    sequence = $bindable(),
    selectedLineId = null,
    selectedPathId = null,
    onSelectPath,
    onUngroup,
    selectedPointIndex = $bindable(0),
    robotXY,
    robotHeading,
    x,
    y,
    settings,
    handleSeek,
    loopAnimation = $bindable(),
    shapes = $bindable(),
    recordChange,
  }: Props = $props();

  let curveTension = $state(1.0);
  let obstaclesOpen = $state(true);

  // The inspector follows whatever is selected: a group shows group controls,
  // anything else falls back to the first drivable curve.
  let selectedPath: Path | null = $derived(
    findPathById(lines, selectedPathId) ?? atomicSegments(lines)[0] ?? null,
  );
  let selectedGroup: CompoundPath | null = $derived(
    selectedPath?.kind === "compound" ? selectedPath : null,
  );
  let selectedLine: AtomicPath | null = $derived(
    selectedPath?.kind === "atomic" ? selectedPath : null,
  );
  let selectedLineIndex = $derived(
    selectedLine
      ? lines.findIndex((candidate) => candidate.id === selectedLine!.id)
      : -1,
  );
  let selectedLinePathIndex = $derived(selectedLineIndex);
  let selectedPoint: BasePoint | null = $derived.by(() => {
    const line = selectedLine;
    if (!line) return null;
    return selectedPointIndex === 0
      ? line.endPoint
      : line.controlPoints[selectedPointIndex - 1] || null;
  });
  let selectedPointLabel = $derived(
    selectedLine && selectedPoint
      ? selectedPointIndex === 0
        ? "Endpoint"
        : `Control Point ${selectedPointIndex}`
      : "Selected Point",
  );

  // Keep the selected point index inside the current line's range.
  run(() => {
    if (
      selectedLine &&
      selectedPointIndex > selectedLine.controlPoints.length
    ) {
      selectedPointIndex = selectedLine.controlPoints.length;
    }
    if (selectedPointIndex < 0) {
      selectedPointIndex = 0;
    }
  });

  function commitSelectedPointChange() {
    lines = [...lines];
    recordChange?.();
  }

  function toggleSelectedPointLock() {
    const line = selectedLine;
    if (!line || !selectedPoint) return;

    const pointIndex = selectedPointIndex;
    // Rebuild the point rather than mutating in place: the inspector reads the
    // lock state off the line, so it has to see a fresh object to update.
    lines = replaceSegment(lines, line.id, (segment) => {
      if (pointIndex === 0) {
        return {
          ...segment,
          endPoint: { ...segment.endPoint, locked: !segment.endPoint.locked },
        };
      }
      const controlPoints = segment.controlPoints.map((point, index) =>
        index === pointIndex - 1 ? { ...point, locked: !point.locked } : point,
      );
      return { ...segment, controlPoints };
    });
    recordChange?.();
  }

  // Compute timeline markers for the UI (start of each travel segment)
  let timePrediction = $derived(
    calculateVisualizationPathTime(startPoint, lines, settings, sequence),
  );
  let markers = $derived(
    (() => {
      const _markers: { percent: number; color: string; name: string }[] = [];
      if (
        !timePrediction ||
        !timePrediction.timeline ||
        timePrediction.totalTime <= 0
      )
        return _markers;

      timePrediction.timeline.forEach((ev) => {
        if (ev.type === "travel") {
          const pct = (ev.endTime / timePrediction.totalTime) * 100;
          const index = lines.findIndex((line) => line.id === ev.lineId);
          const line = lines[index];
          const color = line?.color || "#ffffff";
          const name = line?.name || `Path ${index + 1}`;
          _markers.push({ percent: pct, color, name });
        }
      });

      return _markers;
    })(),
  );

  // Collapsed state for obstacles (default collapsed)
  let collapsedObstacles = $state(shapes.map(() => true));

  // Keep obstacle collapse state aligned with shapes list
  run(() => {
    if (shapes.length !== collapsedObstacles.length) {
      collapsedObstacles = shapes.map(() => true);
    }
  });

  // Convert the complete ordered path to smooth cubics that pass through each
  // endpoint, using all endpoints as through-points rather than control points.
  function curveFromSelected(tension = 1.0) {
    if (!selectedLine || selectedLineIndex == null) return;

    const orderedLines = atomicSegments(lines);
    const poses = [startPoint, ...orderedLines.map((line) => line.endPoint)];

    const segments = curveThroughPoints(tension, poses);
    if (segments.length !== orderedLines.length || orderedLines.length < 2) {
      alert(
        "Curve generation needs at least two path points.",
      );
      return;
    }

    const firstLine = orderedLines[0];
    const finalPoint = orderedLines[orderedLines.length - 1].endPoint;
    const maxThroughPoints = Math.max(
      1,
      Math.round(settings.curveThroughMaxPoints ?? 4),
    );
    const startClearance = 2;
    const candidateThroughPoints = orderedLines
      .slice(0, -1)
      .map((line) => ({ ...line.endPoint }))
      .filter(
        (point) =>
          Math.hypot(point.x - startPoint.x, point.y - startPoint.y) >=
          startClearance,
      );
    const throughLine: AtomicPath = {
      ...firstLine,
      endPoint: { ...finalPoint },
      controlPoints: [],
      throughPoints: candidateThroughPoints.slice(0, maxThroughPoints),
    };

    lines = normalizePaths([throughLine]);
    sequence = [{ kind: "path", lineId: throughLine.id }];
    onSelectPath(throughLine.id);
    selectedPointIndex = 0;
    recordChange();
    alert(`Created a Paths.through curve through ${poses.length - 2} middle points.`);
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
    }
    recordChange();
  }

  function deleteSelectedLine() {
    if (!selectedLine) return;
    if (lines.length <= 1) return;

    // Select whatever now occupies the deleted segment's slot, or the last one.
    const removedIndex = selectedLineIndex;
    removeLine(removedIndex);
    onSelectPath(lines[Math.min(removedIndex, lines.length - 1)]?.id ?? null);
    selectedPointIndex = 0;
    recordChange();
  }

  function deleteSelectedControlPoint() {
    if (!selectedLine || selectedPointIndex <= 0) return;

    const controlPointIndex = selectedPointIndex - 1;
    if (!selectedLine.controlPoints[controlPointIndex]) return;

    selectedLine.controlPoints.splice(controlPointIndex, 1);
    lines = [...lines];
    selectedPointIndex = Math.min(
      selectedPointIndex,
      selectedLine.controlPoints.length,
    );
    recordChange();
  }
</script>

<div class="min-h-0 flex-1 flex flex-col justify-start items-center gap-2 h-full">
  <div
    class="min-h-0 flex-1 flex flex-col justify-start items-start w-full bg-[#1a1a1a] border border-[#333333] p-3 overflow-y-auto overflow-x-hidden gap-3"
  >
    <div class="w-full flex flex-col gap-2">
      {#if settings.experimentalFeatures?.obstacles}
        <button
          class="flex items-center justify-between gap-2 w-full border border-[#333333] bg-[#222222] px-3 py-2 text-xs text-gray-200"
          onclick={() => (obstaclesOpen = !obstaclesOpen)}
          title={obstaclesOpen
            ? "Hide obstacle editor"
            : "Show obstacle editor"}
        >
          <span class="font-semibold uppercase tracking-wide">Obstacles</span>
          <span class="text-[11px] text-gray-400"
            >{obstaclesOpen ? "Hide" : "Show"}</span
          >
        </button>
        {#if obstaclesOpen}
          <ObstaclesSection bind:shapes bind:collapsedObstacles />
        {/if}
      {/if}
    </div>

    <div class="grid w-full grid-cols-1 gap-2 lg:grid-cols-2">
      <div class="w-full border border-[#333333] bg-[#222222] p-3">
        <StartingPointSection bind:startPoint />
      </div>
      <div class="w-full border border-[#333333] bg-[#222222] p-3">
        <RobotPositionDisplay {robotXY} {robotHeading} {x} {y} />
      </div>
    </div>

    {#if selectedGroup}
      <SelectedGroupInspector
        {selectedGroup}
        segmentCount={atomicSegments(selectedGroup.segments).length}
        onNameInput={(name) => {
          lines = updatePath(lines, selectedGroup.id, (path) => ({
            ...path,
            name,
          }));
        }}
        onHeadingOverrideChange={(heading) => {
          lines = updatePath(lines, selectedGroup.id, (path) =>
            path.kind === "compound" ? { ...path, heading } : path,
          );
          recordChange?.();
        }}
        onLinesChanged={() => (lines = [...lines])}
        onRecordChange={() => recordChange?.()}
        {onUngroup}
      />
    {:else}
      <SelectedPathInspector
        {selectedLine}
        {selectedLinePathIndex}
        {selectedPoint}
        bind:selectedPointIndex
        {selectedPointLabel}
        lineCount={lines.length}
        {settings}
        bind:curveTension
        onNameInput={(name) => {
          if (selectedLine) selectedLine.name = name;
          lines = [...lines];
        }}
        onLinesChanged={() => (lines = [...lines])}
        onRecordChange={() => recordChange?.()}
        onVisualizationWaitChange={(durationMs) => {
          if (!selectedLine) return;
          lines = updatePath(lines, selectedLine.id, (path) => ({
            ...path,
            waitAfterMs: durationMs,
          }));
        }}
        onCurveFromSelected={curveFromSelected}
        onDeleteSelectedLine={deleteSelectedLine}
        onDeleteControlPoint={deleteSelectedControlPoint}
        onToggleLock={toggleSelectedPointLock}
        onCommitPointChange={commitSelectedPointChange}
      />
    {/if}
  </div>

  <PlaybackControls
    {playing}
    {play}
    {pause}
    bind:percent
    {handleSeek}
    bind:loopAnimation
    {markers}
    totalTime={timePrediction?.totalTime ?? 0}
  />
</div>
