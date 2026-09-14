<script lang="ts">
  import type {
    PiecewiseHeadingInterpolation,
    PiecewiseHeadingInterpolationType,
    PiecewiseHeadingSegment,
  } from "../../types";
  import {
    MIN_SEGMENT_LENGTH,
    createDefaultPiecewiseHeadingInterpolation,
    normalizePiecewiseHeadingInterpolation,
    piecewiseSegmentEndAngle,
    segmentSupportsContinuation,
    segmentSupportsReverse,
    validatePiecewiseHeadingInterpolation,
  } from "../../utils/headingInterpolation";
  import { fieldFrame } from "../../stores";
  import { headingToCanonical, headingToDocFrame } from "../../utils/frame";
  import CoordinateInput from "./ui/CoordinateInput.svelte";

  interface Props {
    config: PiecewiseHeadingInterpolation;
    locked?: boolean;
    /** `commit` marks an edit that should get its own undo entry. */
    onConfigChange: (
      next: PiecewiseHeadingInterpolation,
      commit: boolean,
    ) => void;
  }

  let { config, locked = false, onConfigChange }: Props = $props();

  const showAngle = (degrees: number) =>
    headingToDocFrame(degrees, $fieldFrame);
  const storeAngle = (value: unknown) =>
    headingToCanonical(Number(value), $fieldFrame);

  let advancedMode = $state(false);
  let activeBoundaryIndex: number | null = null;
  let trackElement: HTMLDivElement | undefined = $state();

  const FIELD_CLASS =
    "w-full rounded border border-[#444444] bg-[#111111] px-2 py-1 text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50 read-only:text-gray-400";
  const ACTION_CLASS =
    "rounded border border-[#444444] px-2 py-1 font-semibold text-gray-100 hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50";
  const LABEL_CLASS = "text-gray-500";

  const interpolationOptions: Array<{
    value: PiecewiseHeadingInterpolationType;
    label: string;
  }> = [
    { value: "linear", label: "Linear" },
    { value: "constant", label: "Constant" },
    { value: "tangential", label: "Tangent" },
    { value: "facing-point", label: "Facing Point" },
  ];

  $effect(() => {
    if (
      !config ||
      !Array.isArray(config.segments) ||
      config.segments.length === 0
    ) {
      onConfigChange(createDefaultPiecewiseHeadingInterpolation(), false);
    }
  });

  let segments = $derived(
    normalizePiecewiseHeadingInterpolation(config).segments,
  );
  let validationMessage = $derived(
    validatePiecewiseHeadingInterpolation(config) || "",
  );

  function commitConfig(next: PiecewiseHeadingInterpolation, commit = false) {
    onConfigChange(normalizePiecewiseHeadingInterpolation(next), commit);
  }

  /** Null when the angle depends on path geometry the editor does not have. */
  function linkedStartAngle(index: number): number | null {
    const segment = segments[index];
    if (!segment?.continueFromPrevious || index === 0) return null;
    return piecewiseSegmentEndAngle(segments, index - 1);
  }

  function segmentAtProgress(progress: number): number {
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const isLast = index === segments.length - 1;
      if (
        progress >= segment.startProgress &&
        (progress < segment.endProgress || isLast)
      ) {
        return index;
      }
    }
    return segments.length - 1;
  }

  function segmentTemplate(
    source: PiecewiseHeadingSegment,
    startProgress: number,
    endProgress: number,
  ): PiecewiseHeadingSegment {
    return {
      startProgress,
      endProgress,
      interpolationType: source.interpolationType,
      reversed: source.reversed,
      parameters: source.parameters
        ? structuredClone(source.parameters)
        : undefined,
    };
  }

  function splitSegmentAt(index: number, progress: number): boolean {
    if (locked) return false;
    const normalized = normalizePiecewiseHeadingInterpolation(config);
    const target = normalized.segments[index];

    if (
      !target ||
      progress <= target.startProgress + MIN_SEGMENT_LENGTH ||
      progress >= target.endProgress - MIN_SEGMENT_LENGTH
    ) {
      return false;
    }

    const left = segmentTemplate(target, target.startProgress, progress);
    const right = segmentTemplate(target, progress, target.endProgress);
    normalized.segments.splice(index, 1, left, right);
    commitConfig(normalized, true);
    return true;
  }

  // Halves the last segment: appending after it would start the new segment at
  // 1, leaving it zero-length and immediately dropped.
  function addSegment() {
    if (locked) return;
    const index = segments.length - 1;
    const last = segments[index];
    if (!last) return;
    splitSegmentAt(index, (last.startProgress + last.endProgress) / 2);
  }

  function removeSegment(index: number) {
    if (locked) return;
    const normalized = normalizePiecewiseHeadingInterpolation(config);
    if (normalized.segments.length <= 1) return;

    normalized.segments.splice(index, 1);
    commitConfig(normalized, true);
  }

  function getProgressFromPointer(
    event: PointerEvent,
    element: HTMLElement,
  ): number {
    const rect = element.getBoundingClientRect();
    const raw = (event.clientX - rect.left) / Math.max(rect.width, 1);
    return Math.max(0, Math.min(1, raw));
  }

  function beginBoundaryDrag(boundaryIndex: number, event: PointerEvent) {
    if (locked || !trackElement) return;
    // Without this the press also reaches the track and splits a segment.
    event.preventDefault();
    event.stopPropagation();
    activeBoundaryIndex = boundaryIndex;
    // `event.currentTarget` is the handle, and is nulled once dispatch ends.
    const track = trackElement;
    let moved = false;

    const moveHandler = (moveEvent: PointerEvent) => {
      if (activeBoundaryIndex === null) return;
      const normalized = normalizePiecewiseHeadingInterpolation(config);
      const progress = getProgressFromPointer(moveEvent, track);
      const previous = normalized.segments[activeBoundaryIndex - 1];
      const next = normalized.segments[activeBoundaryIndex];
      if (!previous || !next) return;

      const clamped = Math.min(
        Math.max(progress, previous.startProgress + MIN_SEGMENT_LENGTH),
        next.endProgress - MIN_SEGMENT_LENGTH,
      );

      previous.endProgress = clamped;
      next.startProgress = clamped;
      moved = true;
      commitConfig(normalized);
    };

    const upHandler = () => {
      activeBoundaryIndex = null;
      window.removeEventListener("pointermove", moveHandler);
      window.removeEventListener("pointerup", upHandler);
      if (moved) commitConfig(config, true);
    };

    window.addEventListener("pointermove", moveHandler);
    window.addEventListener("pointerup", upHandler);
  }

  function handleTimelineClick(event: PointerEvent) {
    if (locked) return;
    const progress = getProgressFromPointer(
      event,
      event.currentTarget as HTMLElement,
    );
    splitSegmentAt(segmentAtProgress(progress), progress);
  }

  /**
   * `replaceParameters` swaps the parameter bag wholesale, so switching
   * interpolation type leaves none of the previous type's angles behind.
   */
  function updateSegment(
    index: number,
    patch: Partial<PiecewiseHeadingSegment>,
    replaceParameters = false,
  ) {
    if (locked) return;
    const normalized = normalizePiecewiseHeadingInterpolation(config);
    const segment = normalized.segments[index];
    if (!segment) return;

    normalized.segments[index] = {
      ...segment,
      ...patch,
      parameters: replaceParameters
        ? patch.parameters
        : patch.parameters
          ? {
              ...(segment.parameters || {}),
              ...patch.parameters,
            }
          : segment.parameters,
    };

    // These fields fire on `change`, not `input`, so each call is a finished edit.
    commitConfig(normalized, true);
  }

  function setInterpolationType(
    index: number,
    interpolationType: PiecewiseHeadingInterpolationType,
  ) {
    const segment = segments[index];
    if (!segment) return;

    const nextParameters = (() => {
      if (interpolationType === "constant")
        return { degrees: segment.parameters?.degrees ?? 0 };
      if (interpolationType === "linear") {
        return {
          startDeg: segment.parameters?.startDeg ?? 0,
          endDeg: segment.parameters?.endDeg ?? 0,
        };
      }
      if (interpolationType === "facing-point") {
        return {
          point: segment.parameters?.point
            ? { ...segment.parameters.point }
            : { x: 0, y: 0 },
        };
      }
      return undefined;
    })();

    updateSegment(
      index,
      {
        interpolationType,
        reversed: segmentSupportsReverse(interpolationType)
          ? !!segment.reversed
          : false,
        parameters: nextParameters,
      },
      true,
    );
  }
</script>

<div
  class="w-full space-y-2 border border-[#333333] bg-[#1a1a1a] px-2 py-2 text-[11px] leading-tight text-gray-300"
>
  <div
    class="flex flex-wrap items-start justify-between gap-2 border-b border-[#333333] pb-2"
  >
    <div>
      <div class="font-semibold text-gray-100">Piecewise Heading</div>
      <div class="text-[10px] {LABEL_CLASS}">
        Click the timeline to add a boundary. Drag markers to adjust segment
        breaks.
      </div>
    </div>
    <label class="flex items-center gap-2 text-[10px] text-gray-400">
      <input type="checkbox" bind:checked={advancedMode} disabled={locked} />
      Advanced progress editing
    </label>
  </div>

  <div
    bind:this={trackElement}
    class="relative h-4 rounded border border-[#444444] bg-[#111111]"
    role="button"
    tabindex="0"
    aria-label="Piecewise progress timeline"
    onpointerdown={handleTimelineClick}
  >
    {#each segments as segment, index (index)}
      <div
        class="absolute top-0 h-full {index % 2 === 0
          ? 'bg-green-600/40'
          : 'bg-green-600/20'}"
        style={`left:${segment.startProgress * 100}%; width:${Math.max((segment.endProgress - segment.startProgress) * 100, 0.2)}%;`}
      ></div>
      {#if index > 0}
        <button
          type="button"
          class="absolute top-1/2 z-10 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-[#666666] bg-[#dddddd] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          style={`left:${segment.startProgress * 100}%`}
          onpointerdown={(event) => beginBoundaryDrag(index, event)}
          disabled={locked}
          aria-label={`Drag boundary ${index}`}
        ></button>
      {/if}
    {/each}
  </div>

  {#if validationMessage}
    <div
      class="border border-amber-700 bg-amber-950/40 px-2 py-1 text-[10px] text-amber-300"
    >
      {validationMessage}
    </div>
  {/if}

  <div class="space-y-2">
    {#each segments as segment, index (index)}
      {@const linkedStart = linkedStartAngle(index)}
      <div class="border border-[#333333] bg-[#222222] px-2 py-2">
        <div class="flex items-center justify-between gap-2">
          <div class="font-semibold text-gray-100">
            Segment {index + 1}
          </div>
          <button
            class="{ACTION_CLASS} text-[10px]"
            onclick={() => removeSegment(index)}
            disabled={locked || segments.length <= 1}
          >
            Delete
          </button>
        </div>

        <div class="mt-2 grid gap-2 sm:grid-cols-2">
          <label class="space-y-1">
            <div class={LABEL_CLASS}>Start progress</div>
            <input
              type="number"
              class={FIELD_CLASS}
              value={segment.startProgress.toFixed(3)}
              readonly
              disabled={locked}
              title="Segments run back to back, so this follows the previous segment's end."
            />
          </label>
          <label class="space-y-1">
            <div class={LABEL_CLASS}>End progress</div>
            <input
              type="number"
              min="0"
              max="1"
              step="0.001"
              class={FIELD_CLASS}
              value={segment.endProgress.toFixed(3)}
              readonly={!advancedMode || index === segments.length - 1}
              disabled={locked}
              title={index === segments.length - 1
                ? "The last segment always ends at 1."
                : undefined}
              onchange={(event) =>
                updateSegment(index, {
                  endProgress: Number(
                    (event.currentTarget as HTMLInputElement).value,
                  ),
                })}
            />
          </label>
        </div>

        <div class="mt-2 grid gap-2 sm:grid-cols-2">
          <label class="space-y-1 sm:col-span-1">
            <div class={LABEL_CLASS}>Interpolation type</div>
            <select
              class={FIELD_CLASS}
              value={segment.interpolationType}
              disabled={locked}
              onchange={(event) =>
                setInterpolationType(
                  index,
                  (event.currentTarget as HTMLSelectElement)
                    .value as PiecewiseHeadingInterpolationType,
                )}
            >
              {#each interpolationOptions as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>

          {#if segmentSupportsReverse(segment.interpolationType)}
            <label
              class="flex items-center gap-2 self-end rounded border border-[#444444] px-2 py-1 text-gray-300"
            >
              <input
                type="checkbox"
                checked={!!segment.reversed}
                disabled={locked}
                onchange={(event) =>
                  updateSegment(index, {
                    reversed: (event.currentTarget as HTMLInputElement).checked,
                  })}
              />
              Reverse
            </label>
          {/if}
        </div>

        {#if index > 0 && segmentSupportsContinuation(segment.interpolationType)}
          <label
            class="mt-2 flex items-center gap-2 rounded border border-[#444444] px-2 py-1 text-gray-300"
          >
            <input
              type="checkbox"
              checked={!!segment.continueFromPrevious}
              disabled={locked}
              onchange={(event) =>
                updateSegment(index, {
                  continueFromPrevious: (
                    event.currentTarget as HTMLInputElement
                  ).checked,
                })}
            />
            Continue from previous segment
          </label>
        {/if}

        {#if segment.interpolationType === "linear"}
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <label class="space-y-1">
              <div class={LABEL_CLASS}>Start heading (deg)</div>
              <input
                type="number"
                step="1"
                class={FIELD_CLASS}
                value={segment.continueFromPrevious
                  ? linkedStart === null
                    ? ""
                    : showAngle(linkedStart).toFixed(1)
                  : showAngle(segment.parameters?.startDeg ?? 0)}
                readonly={segment.continueFromPrevious}
                placeholder={segment.continueFromPrevious
                  ? "follows the path"
                  : undefined}
                title={segment.continueFromPrevious && linkedStart === null
                  ? "The previous segment ends at an angle set by the path shape, so this resolves in the animation."
                  : undefined}
                disabled={locked}
                onchange={(event) =>
                  updateSegment(index, {
                    parameters: {
                      startDeg: storeAngle(
                        (event.currentTarget as HTMLInputElement).value,
                      ),
                    },
                  })}
              />
            </label>
            <label class="space-y-1">
              <div class={LABEL_CLASS}>End heading (deg)</div>
              <input
                type="number"
                step="1"
                class={FIELD_CLASS}
                value={showAngle(segment.parameters?.endDeg ?? 0)}
                disabled={locked}
                onchange={(event) =>
                  updateSegment(index, {
                    parameters: {
                      endDeg: storeAngle(
                        (event.currentTarget as HTMLInputElement).value,
                      ),
                    },
                  })}
              />
            </label>
          </div>
        {:else if segment.interpolationType === "constant"}
          <div class="mt-2">
            <label class="space-y-1">
              <div class={LABEL_CLASS}>Heading (deg)</div>
              <input
                type="number"
                step="1"
                class={FIELD_CLASS}
                value={segment.continueFromPrevious
                  ? linkedStart === null
                    ? ""
                    : showAngle(linkedStart).toFixed(1)
                  : showAngle(segment.parameters?.degrees ?? 0)}
                readonly={segment.continueFromPrevious}
                placeholder={segment.continueFromPrevious
                  ? "follows the path"
                  : undefined}
                title={segment.continueFromPrevious && linkedStart === null
                  ? "The previous segment ends at an angle set by the path shape, so this resolves in the animation."
                  : undefined}
                disabled={locked}
                onchange={(event) =>
                  updateSegment(index, {
                    parameters: {
                      degrees: storeAngle(
                        (event.currentTarget as HTMLInputElement).value,
                      ),
                    },
                  })}
              />
            </label>
          </div>
        {:else if segment.interpolationType === "facing-point"}
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            {#each ["x", "y"] as const as axis (axis)}
              <label class="space-y-1">
                <div class={LABEL_CLASS}>Target {axis.toUpperCase()}</div>
                <CoordinateInput
                  point={segment.parameters?.point ?? { x: 0, y: 0 }}
                  {axis}
                  onChange={(point) =>
                    updateSegment(index, { parameters: { point } })}
                  class={FIELD_CLASS}
                  disabled={locked}
                  bounded={false}
                />
              </label>
            {/each}
          </div>
        {:else}
          <div class="mt-2 text-[10px] text-gray-500">
            This segment uses the path tangent. No extra parameters are
            required.
          </div>
        {/if}

        {#if !advancedMode && index < segments.length - 1}
          <div class="mt-2 text-[10px] text-gray-500">
            Drag the timeline to move this segment's end, or enable advanced
            mode to type it.
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="flex justify-end">
    <button class={ACTION_CLASS} onclick={addSegment} disabled={locked}>
      Add Segment
    </button>
  </div>
</div>
