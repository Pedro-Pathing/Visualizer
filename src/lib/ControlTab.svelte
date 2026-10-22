<script lang="ts">
  import { run } from "svelte/legacy";

  import type {
    AtomicPath,
    BasePoint,
    CompoundPath,
    Path,
    Settings,
  } from "../types";
  import ObstaclesSection from "./components/ObstaclesSection.svelte";
  import RobotPositionDisplay from "./components/RobotPositionDisplay.svelte";
  import StartingPointSection from "./components/StartingPointSection.svelte";
  import PlaybackControls from "./components/PlaybackControls.svelte";
  import { normalizePaths } from "../utils";
  import SelectedPathInspector from "./components/SelectedPathInspector.svelte";
  import SelectedGroupInspector from "./components/SelectedGroupInspector.svelte";
  import { curveThroughPoints } from "../utils/math";
  import { atomicSegments, findPathById } from "../utils/pathTraversal";
  import {
    pointAt,
    removePath,
    updatePathById,
    updatePoint,
    updateSegment,
    type PointAddress,
  } from "../model/commands";
  import type { Obstacle } from "../model/collision";
  import { useProject } from "../state/project.svelte";
  import { useEditor } from "../state/editor.svelte";
  import { usePlayback } from "../state/playback.svelte";

  interface Props {
    settings: Settings;
  }

  let { settings }: Props = $props();

  const project = useProject();
  const editor = useEditor();
  const playback = usePlayback();
  let { startPoint, lines, shapes } = $derived(project.doc);

  let curveTension = $state(1.0);
  let obstaclesOpen = $state(true);

  const onSelectPath = (id: string | null) => editor.select(id ? [id] : []);

  // The inspector follows whatever is selected: a group shows group controls,
  // anything else falls back to the first drivable curve.
  let selectedPath: Path | null = $derived(
    findPathById(lines, editor.primarySelectedId) ??
      atomicSegments(lines)[0] ??
      null,
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
  let selectedAddress: Extract<PointAddress, { kind: "path" }> | null = $derived(
    selectedLine
      ? {
          kind: "path",
          lineId: selectedLine.id,
          index: editor.selectedPointIndex,
        }
      : null,
  );
  let selectedPoint: BasePoint | null = $derived(
    selectedAddress ? pointAt(project.doc, selectedAddress) : null,
  );
  let selectedPointLabel = $derived(
    selectedLine && selectedPoint
      ? editor.selectedPointIndex === 0
        ? "Endpoint"
        : `Control Point ${editor.selectedPointIndex}`
      : "Selected Point",
  );

  function changeSelectedPoint(patch: Partial<BasePoint>) {
    if (!selectedAddress) return;
    const field = Object.keys(patch).join();
    project.apply(updatePoint(selectedAddress, patch), {
      coalesce: `${selectedAddress.lineId}.${selectedAddress.index}.${field}`,
    });
  }

  function toggleSelectedPointLock() {
    if (!selectedAddress || !selectedPoint) return;
    project.apply(
      updatePoint(selectedAddress, { locked: !selectedPoint.locked }),
    );
  }

  /** Name and heading edits merge while typing, per path and field. */
  function editPath(id: string, field: string, update: (path: Path) => Path) {
    project.apply(updatePathById(id, update), { coalesce: `${id}.${field}` });
  }

  // Compute timeline markers for the UI (start of each travel segment)
  let timePrediction = $derived(playback.prediction);
  function collisionLabel(obstacle: Obstacle) {
    if (obstacle.kind === "wall") return "Hits the field wall";
    const shape = shapes.find((candidate) => candidate.id === obstacle.shapeId);
    return `Hits ${shape?.name || "an obstacle"}`;
  }
  let collisionBands = $derived(
    playback.duration > 0
      ? playback.collisions.map((collision) => ({
          start: (collision.start / playback.duration) * 100,
          end: (collision.end / playback.duration) * 100,
          label: collisionLabel(collision.obstacle),
        }))
      : [],
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
  let collapsedObstacles = $state(project.doc.shapes.map(() => true));

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

    project.apply((doc) => ({
      ...doc,
      lines: normalizePaths([throughLine]),
      sequence: [{ kind: "path", lineId: throughLine.id }],
    }));
    onSelectPath(throughLine.id);
    editor.selectedPointIndex = 0;
    alert(`Created a Paths.through curve through ${poses.length - 2} middle points.`);
  }

  function deleteSelectedLine() {
    if (!selectedLine) return;
    const segments = atomicSegments(lines);
    if (segments.length <= 1) return;

    // Select whatever now occupies the deleted segment's slot, or the last one.
    const removedAt = segments.findIndex((line) => line.id === selectedLine.id);
    project.apply(removePath(selectedLine.id));
    const remaining = atomicSegments(project.doc.lines);
    onSelectPath(remaining[Math.min(removedAt, remaining.length - 1)]?.id ?? null);
    editor.selectedPointIndex = 0;
  }

  function deleteSelectedControlPoint() {
    if (!selectedLine || editor.selectedPointIndex <= 0) return;

    const controlPointIndex = editor.selectedPointIndex - 1;
    if (!selectedLine.controlPoints[controlPointIndex]) return;

    const controlPoints = selectedLine.controlPoints.filter(
      (_, index) => index !== controlPointIndex,
    );
    project.apply(
      updateSegment(selectedLine.id, (segment) => ({
        ...segment,
        controlPoints,
      })),
    );
    editor.selectedPointIndex = Math.min(
      editor.selectedPointIndex,
      controlPoints.length,
    );
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
          <ObstaclesSection bind:collapsedObstacles />
        {/if}
      {/if}
    </div>

    <div class="grid w-full grid-cols-1 gap-2 lg:grid-cols-2">
      <div class="w-full border border-[#333333] bg-[#222222] p-3">
        <StartingPointSection />
      </div>
      <div class="w-full border border-[#333333] bg-[#222222] p-3">
        <RobotPositionDisplay pose={playback.robotPose} />
      </div>
    </div>

    {#if selectedGroup}
      <SelectedGroupInspector
        {selectedGroup}
        segmentCount={atomicSegments(selectedGroup.segments).length}
        onNameInput={(name) =>
          editPath(selectedGroup.id, "name", (path) => ({ ...path, name }))}
        onHeadingOverrideChange={(heading) =>
          editPath(selectedGroup.id, "heading", (path) =>
            path.kind === "compound" ? { ...path, heading } : path,
          )}
        onUngroup={() => editor.ungroupSelected()}
      />
    {:else}
      <SelectedPathInspector
        {selectedLine}
        {selectedLinePathIndex}
        {selectedPoint}
        bind:selectedPointIndex={editor.selectedPointIndex}
        {selectedPointLabel}
        lineCount={lines.length}
        {settings}
        bind:curveTension
        onNameInput={(name) => {
          if (selectedLine) {
            editPath(selectedLine.id, "name", (path) => ({ ...path, name }));
          }
        }}
        onHeadingChange={(heading) => {
          if (selectedLine) {
            editPath(selectedLine.id, "heading", (path) => ({
              ...path,
              heading,
            }));
          }
        }}
        onVisualizationWaitChange={(durationMs) => {
          if (selectedLine) {
            editPath(selectedLine.id, "wait", (path) => ({
              ...path,
              waitAfterMs: durationMs,
            }));
          }
        }}
        onCurveFromSelected={curveFromSelected}
        onDeleteSelectedLine={deleteSelectedLine}
        onDeleteControlPoint={deleteSelectedControlPoint}
        onToggleLock={toggleSelectedPointLock}
        onPointChange={changeSelectedPoint}
      />
    {/if}
  </div>

  <PlaybackControls
    playing={playback.playing}
    play={() => playback.play()}
    pause={() => playback.pause()}
    bind:percent={playback.percent}
    handleSeek={(percent) => playback.seek(percent)}
    bind:loopAnimation={playback.loop}
    {markers}
    bands={collisionBands}
    totalTime={playback.duration}
    distance={timePrediction.totalDistance}
  />
</div>
