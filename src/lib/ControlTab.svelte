<script lang="ts">
  import type {
    Point,
    Line,
    BasePoint,
    Settings,
    Shape,
    SequenceItem,
  } from "../types";
  import _ from "lodash";
  import { getRandomColor } from "../utils";
  import ObstaclesSection from "./components/ObstaclesSection.svelte";
  import RobotPositionDisplay from "./components/RobotPositionDisplay.svelte";
  import StartingPointSection from "./components/StartingPointSection.svelte";
  import PathLineSection from "./components/PathLineSection.svelte";
  import PlaybackControls from "./components/PlaybackControls.svelte";
  import WaitRow from "./components/WaitRow.svelte";
  import { calculatePathTime } from "../utils";

  export let percent: number;
  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let robotWidth: number = 16;
  export let robotHeight: number = 16;
  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
  export let settings: Settings;
  export let handleSeek: (percent: number) => void;
  export let loopAnimation: boolean;

  export let shapes: Shape[];
  export let recordChange: () => void;

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

  // State for collapsed sections
  let collapsedSections = {
    obstacles: shapes.map(() => true),
    lines: lines.map(() => false),
    controlPoints: lines.map(() => true), // Start with control points collapsed
  };

  // Collapsed state for obstacles (default collapsed)
  let collapsedObstacles = shapes.map(() => true);

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
          x: _.random(0, 144),
          y: _.random(0, 144),
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
        x: _.random(0, 144),
        y: _.random(0, 144),
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
        x: _.random(0, 144),
        y: _.random(0, 144),
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

<div class="flex-1 flex flex-col justify-start items-center gap-2 h-full">
  <div
    class="flex flex-col justify-start items-start w-full rounded-lg bg-neutral-50 dark:bg-neutral-900 shadow-md p-4 overflow-y-scroll overflow-x-hidden h-full gap-6"
  >
    <ObstaclesSection bind:shapes bind:collapsedObstacles />

    <RobotPositionDisplay {robotXY} {robotHeading} {x} {y} />

    <StartingPointSection bind:startPoint {addPathAtStart} {addWaitAtStart} />

    <!-- Unified sequence render: paths and waits -->
    {#each sequence as item, sIdx}
      <div class="w-full">
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

    <!-- Add Line Button -->
    <div class="flex flex-row items-center gap-4">
      <button
        on:click={addLine}
        class="font-semibold text-green-500 text-sm flex flex-row justify-start items-center gap-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        <p>Add Path</p>
      </button>

      <button
        on:click={addWait}
        class="font-semibold text-amber-500 text-sm flex flex-row justify-start items-center gap-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-5"
        >
          <circle cx="12" cy="12" r="9" />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 7v5l3 2"
          />
        </svg>
        <p>Add Wait</p>
      </button>
    </div>
  </div>

  <PlaybackControls
    bind:playing
    {play}
    {pause}
    bind:percent
    {handleSeek}
    bind:loopAnimation
    {markers}
    totalTime={timePrediction?.totalTime ?? 0}
  />
</div>
