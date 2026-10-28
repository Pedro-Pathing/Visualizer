<script lang="ts">
  import { ChevronRight, Plus, Trash2, TriangleAlert } from "@lucide/svelte";
  import Button from "./ui/Button.svelte";
  import IconButton from "./ui/IconButton.svelte";
  import {
    checkboxClass,
    fieldClass,
    labelClass,
    sectionClass,
  } from "./ui/styles";
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

  interface Props {
    config: PiecewiseHeadingInterpolation;
    locked?: boolean;
    onConfigChange: (next: PiecewiseHeadingInterpolation) => void;
  }

  let { config, locked = false, onConfigChange }: Props = $props();

  let activeBoundaryIndex: number | null = null;
  let trackElement: HTMLDivElement | undefined = $state();
  /** The segment whose fields are expanded; the rest show a summary row. */
  let openIndex: number | null = $state(null);

  const numberFieldClass = [fieldClass, "font-mono read-only:text-body"];
  const checkboxLabelClass = "flex items-center gap-2 text-xs text-heading";

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
      onConfigChange(createDefaultPiecewiseHeadingInterpolation());
    }
  });

  let segments = $derived(
    normalizePiecewiseHeadingInterpolation(config).segments,
  );
  let validationMessage = $derived(
    validatePiecewiseHeadingInterpolation(config) || "",
  );

  function commitConfig(next: PiecewiseHeadingInterpolation) {
    onConfigChange(normalizePiecewiseHeadingInterpolation(next));
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
    commitConfig(normalized);
    if (openIndex !== null && openIndex > index) openIndex += 1;
    return true;
  }

  // Halves the last segment: appending after it would start the new segment at
  // 1, leaving it zero-length and immediately dropped.
  function addSegment() {
    if (locked) return;
    const index = segments.length - 1;
    const last = segments[index];
    if (!last) return;
    if (splitSegmentAt(index, (last.startProgress + last.endProgress) / 2)) {
      openIndex = index + 1;
    }
  }

  function removeSegment(index: number) {
    if (locked) return;
    const normalized = normalizePiecewiseHeadingInterpolation(config);
    if (normalized.segments.length <= 1) return;

    normalized.segments.splice(index, 1);
    commitConfig(normalized);
    if (openIndex === index) openIndex = null;
    else if (openIndex !== null && openIndex > index) openIndex -= 1;
  }

  function toggleSegment(index: number) {
    openIndex = openIndex === index ? null : index;
  }

  function typeLabel(type: PiecewiseHeadingInterpolationType): string {
    return (
      interpolationOptions.find((option) => option.value === type)?.label ??
      type
    );
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
      if (moved) commitConfig(config);
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
    commitConfig(normalized);
  }

  function updateSegmentStart(index: number, value: number) {
    if (locked || !Number.isFinite(value)) return;
    const normalized = normalizePiecewiseHeadingInterpolation(config);
    if (index === 0) {
      normalized.segments[0].startProgress = 0;
      commitConfig(normalized);
      return;
    }
    const previous = normalized.segments[index - 1];
    const current = normalized.segments[index];
    if (!previous || !current) return;
    const boundary = Math.min(
      Math.max(value, previous.startProgress + MIN_SEGMENT_LENGTH),
      current.endProgress - MIN_SEGMENT_LENGTH,
    );
    previous.endProgress = boundary;
    current.startProgress = boundary;
    commitConfig(normalized);
  }

  function updateSegmentEnd(index: number, value: number) {
    if (locked || !Number.isFinite(value)) return;
    const normalized = normalizePiecewiseHeadingInterpolation(config);
    const current = normalized.segments[index];
    if (!current) return;
    if (index === normalized.segments.length - 1) {
      current.endProgress = 1;
      commitConfig(normalized);
      return;
    }
    const next = normalized.segments[index + 1];
    const boundary = Math.min(
      Math.max(value, current.startProgress + MIN_SEGMENT_LENGTH),
      next.endProgress - MIN_SEGMENT_LENGTH,
    );
    current.endProgress = boundary;
    next.startProgress = boundary;
    commitConfig(normalized);
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

<div class={[sectionClass, "flex w-full flex-col gap-2"]}>
  <p class="text-xs text-body">
    Click the timeline to split a segment. Drag a marker to move a boundary.
  </p>

  <div
    bind:this={trackElement}
    class={[
      "relative h-5 rounded-md border border-border bg-base",
      locked ? "cursor-not-allowed opacity-50" : "cursor-copy",
    ]}
    role="button"
    tabindex="0"
    aria-label="Piecewise progress timeline"
    onpointerdown={handleTimelineClick}
  >
    <div class="absolute inset-0 overflow-hidden rounded-[inherit]">
      {#each segments as segment, index (index)}
        <div
          class={[
            "absolute top-0 h-full",
            openIndex === index
              ? "bg-primary/30"
              : index % 2 === 0
                ? "bg-body/20"
                : "bg-body/10",
          ]}
          style={`left:${segment.startProgress * 100}%; width:${Math.max((segment.endProgress - segment.startProgress) * 100, 0.2)}%;`}
        ></div>
      {/each}
    </div>
    {#each segments as segment, index (index)}
      {#if index > 0}
        <button
          type="button"
          class="absolute top-1/2 z-10 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full bg-heading transition hover:bg-primary disabled:cursor-not-allowed"
          style={`left:${segment.startProgress * 100}%`}
          onpointerdown={(event) => beginBoundaryDrag(index, event)}
          disabled={locked}
          aria-label={`Drag boundary ${index}`}
        ></button>
      {/if}
    {/each}
  </div>

  {#if validationMessage}
    <p class="flex items-start gap-1.5 text-xs text-body">
      <TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
      {validationMessage}
    </p>
  {/if}

  <ul class="flex flex-col gap-1.5">
    {#each segments as segment, index (index)}
      {@const linkedStart = linkedStartAngle(index)}
      {@const open = openIndex === index}
      <li class="rounded-lg border border-border bg-surface">
        <div class="flex items-center gap-1 pr-1">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition outline-none hover:bg-body/10 focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-expanded={open}
            onclick={() => toggleSegment(index)}
          >
            <ChevronRight
              class={[
                "size-3.5 shrink-0 text-body transition-transform",
                open && "rotate-90",
              ]}
            />
            <span class="font-mono text-body tabular-nums">{index + 1}</span>
            <span class="min-w-0 flex-1 truncate font-medium text-heading">
              {typeLabel(segment.interpolationType)}
            </span>
            <span class="font-mono text-body tabular-nums">
              {segment.startProgress.toFixed(2)}–{segment.endProgress.toFixed(
                2,
              )}
            </span>
          </button>
          <IconButton
            label="Delete segment"
            size="sm"
            class="hover:text-danger!"
            disabled={locked || segments.length <= 1}
            onclick={() => removeSegment(index)}
          >
            <Trash2 />
          </IconButton>
        </div>

        {#if open}
          <div class="flex flex-col gap-2 border-t border-border p-2">
            <div class="grid grid-cols-2 gap-2">
              <label class="flex flex-col gap-1">
                <span class={labelClass}>Start</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.001"
                  class={numberFieldClass}
                  value={segment.startProgress.toFixed(3)}
                  disabled={locked}
                  title={index === 0
                    ? "The first segment always starts at 0."
                    : "Moves the boundary shared with the previous segment."}
                  onchange={(event) =>
                    updateSegmentStart(
                      index,
                      Number(event.currentTarget.value),
                    )}
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class={labelClass}>End</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.001"
                  class={numberFieldClass}
                  value={segment.endProgress.toFixed(3)}
                  disabled={locked}
                  title={index === segments.length - 1
                    ? "The last segment always ends at 1."
                    : undefined}
                  onchange={(event) =>
                    updateSegmentEnd(index, Number(event.currentTarget.value))}
                />
              </label>
            </div>

            <label class="flex flex-col gap-1">
              <span class={labelClass}>Interpolation</span>
              <select
                class={fieldClass}
                value={segment.interpolationType}
                disabled={locked}
                onchange={(event) =>
                  setInterpolationType(
                    index,
                    event.currentTarget
                      .value as PiecewiseHeadingInterpolationType,
                  )}
              >
                {#each interpolationOptions as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>

            {#if segmentSupportsReverse(segment.interpolationType) || (index > 0 && segmentSupportsContinuation(segment.interpolationType))}
              <div class="flex flex-wrap gap-x-4 gap-y-1.5">
                {#if segmentSupportsReverse(segment.interpolationType)}
                  <label class={checkboxLabelClass}>
                    <input
                      type="checkbox"
                      class={checkboxClass}
                      checked={!!segment.reversed}
                      disabled={locked}
                      onchange={(event) =>
                        updateSegment(index, {
                          reversed: event.currentTarget.checked,
                        })}
                    />
                    Reverse
                  </label>
                {/if}
                {#if index > 0 && segmentSupportsContinuation(segment.interpolationType)}
                  <label class={checkboxLabelClass}>
                    <input
                      type="checkbox"
                      class={checkboxClass}
                      checked={!!segment.continueFromPrevious}
                      disabled={locked}
                      onchange={(event) =>
                        updateSegment(index, {
                          continueFromPrevious: event.currentTarget.checked,
                        })}
                    />
                    Continue from previous
                  </label>
                {/if}
              </div>
            {/if}

            {#if segment.interpolationType === "linear"}
              <div class="grid grid-cols-2 gap-2">
                <label class="flex flex-col gap-1">
                  <span class={labelClass}>Start (deg)</span>
                  <input
                    type="number"
                    step="1"
                    class={numberFieldClass}
                    value={segment.continueFromPrevious
                      ? (linkedStart?.toFixed(1) ?? "")
                      : (segment.parameters?.startDeg ?? 0)}
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
                          startDeg: Number(event.currentTarget.value),
                        },
                      })}
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class={labelClass}>End (deg)</span>
                  <input
                    type="number"
                    step="1"
                    class={numberFieldClass}
                    value={segment.parameters?.endDeg ?? 0}
                    disabled={locked}
                    onchange={(event) =>
                      updateSegment(index, {
                        parameters: {
                          endDeg: Number(event.currentTarget.value),
                        },
                      })}
                  />
                </label>
              </div>
            {:else if segment.interpolationType === "constant"}
              <label class="flex flex-col gap-1">
                <span class={labelClass}>Heading (deg)</span>
                <input
                  type="number"
                  step="1"
                  class={numberFieldClass}
                  value={segment.continueFromPrevious
                    ? (linkedStart?.toFixed(1) ?? "")
                    : (segment.parameters?.degrees ?? 0)}
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
                        degrees: Number(event.currentTarget.value),
                      },
                    })}
                />
              </label>
            {:else if segment.interpolationType === "facing-point"}
              <div class="grid grid-cols-2 gap-2">
                <label class="flex flex-col gap-1">
                  <span class={labelClass}>Target X</span>
                  <input
                    type="number"
                    step="0.1"
                    class={numberFieldClass}
                    value={segment.parameters?.point?.x ?? 0}
                    disabled={locked}
                    onchange={(event) =>
                      updateSegment(index, {
                        parameters: {
                          point: {
                            x: Number(event.currentTarget.value),
                            y: segment.parameters?.point?.y ?? 0,
                          },
                        },
                      })}
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class={labelClass}>Target Y</span>
                  <input
                    type="number"
                    step="0.1"
                    class={numberFieldClass}
                    value={segment.parameters?.point?.y ?? 0}
                    disabled={locked}
                    onchange={(event) =>
                      updateSegment(index, {
                        parameters: {
                          point: {
                            x: segment.parameters?.point?.x ?? 0,
                            y: Number(event.currentTarget.value),
                          },
                        },
                      })}
                  />
                </label>
              </div>
            {:else}
              <p class="text-xs text-body">Follows the path tangent.</p>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  <div>
    <Button size="sm" variant="ghost" disabled={locked} onclick={addSegment}>
      <Plus class="size-3.5" /> Add segment
    </Button>
  </div>
</div>
