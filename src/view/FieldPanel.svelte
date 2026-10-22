<script lang="ts">
  import type { BasePoint, Settings } from "../types";
  import { FIELD_SIZE, LINE_WIDTH } from "../config/defaults";
  import { gridSize, showGrid, snapToGrid } from "../stores";
  import {
    pointAt,
    setShapes,
    updatePoint,
    type PointAddress,
  } from "../model/commands";
  import { atomicSegments } from "../utils/pathTraversal";
  import { robotFootprint } from "../model/collision";
  import {
    generateGhostPathPoints,
    generateOnionLayers,
  } from "../model/sweep";
  import { robotPoseAt } from "../sim/pose";
  import { smoothStrokePreview } from "../lib/pen/strokeFitting";
  import { selectVisibleOnionLayers } from "../lib/scene/onion";
  import { showToast } from "../lib/toast";
  import { distanceBetweenPoints } from "../utils/math";
  import { useProject } from "../state/project.svelte";
  import { useEditor } from "../state/editor.svelte";
  import { usePlayback } from "../state/playback.svelte";
  import type { Overlays } from "../state/overlays.svelte";
  import ContextMenu from "../lib/components/ui/ContextMenu.svelte";
  import type { MenuEntry } from "../lib/components/ui/menu";
  import { surfaceClass } from "../lib/components/ui/styles";
  import FieldMapImage from "../lib/components/FieldMapImage.svelte";
  import FieldLoadingOverlay from "../lib/components/FieldLoadingOverlay.svelte";
  import RobotSprite from "../lib/components/RobotSprite.svelte";
  import MathTools from "../lib/MathTools.svelte";
  import PathStrokes from "./scene/PathStrokes.svelte";
  import PathMarkers from "./scene/PathMarkers.svelte";
  import Obstacles from "./scene/Obstacles.svelte";
  import { polylinePath } from "./scene/svgPath";
  import {
    COLLISION_COLOR,
    FIELD_POINT_COLOR,
    GHOST_COLOR,
    PEN_PREVIEW_COLOR,
  } from "./scene/colors";
  import ToolRail from "./ToolRail.svelte";
  import FieldViewToggles from "./FieldViewToggles.svelte";
  import PlaybackBar from "./PlaybackBar.svelte";
  import { fieldMapSource } from "./fieldMap";
  import { snapPoint } from "./snap";
  import { createViewport } from "./viewport";

  interface Props {
    settings: Settings;
    overlays: Overlays;
    /** The field element, for exporting it as an image. */
    element?: HTMLDivElement;
    /** The field's size on screen, in pixels. */
    pixels?: number;
  }

  let {
    settings,
    overlays,
    element = $bindable(),
    pixels = $bindable(FIELD_SIZE),
  }: Props = $props();

  const project = useProject();
  const editor = useEditor();
  const playback = usePlayback();

  let stageWidth = $state(FIELD_SIZE);
  let stageHeight = $state(FIELD_SIZE);
  $effect.pre(() => {
    pixels = Math.max(1, Math.floor(Math.min(stageWidth, stageHeight) - 16));
  });
  let viewport = $derived(createViewport(pixels));
  let { x, y } = $derived(viewport);

  let doc = $derived(project.doc);
  let obstaclesOn = $derived(Boolean(settings.experimentalFeatures?.obstacles));
  let fieldMapSrc = $derived(fieldMapSource(settings));
  let robotImageSrc = $derived(settings.robotImage || "/robot.png");
  let loadedFieldMap = $state("");
  let loadedRobotImage = $state("");
  let assetsReady = $derived(
    loadedFieldMap === fieldMapSrc && loadedRobotImage === robotImageSrc,
  );

  let ghost = $derived(
    settings.showGhostPaths && !overlays.active
      ? generateGhostPathPoints(doc.startPoint, doc.lines, settings.rHeight, 50)
      : [],
  );
  let overlayGhosts = $derived(
    settings.showGhostPaths && overlays.active
      ? overlays.items.map((overlay) =>
          generateGhostPathPoints(
            overlay.doc.startPoint,
            overlay.doc.lines,
            settings.rHeight,
            50,
          ),
        )
      : [],
  );
  let onionLayers = $derived(
    settings.showOnionLayers && !overlays.active
      ? selectVisibleOnionLayers(
          generateOnionLayers(
            doc.startPoint,
            doc.lines,
            settings.rWidth,
            settings.rHeight,
            settings.onionLayerSpacing || 6,
          ),
          playback.prediction,
          playback.percent,
          settings.onionNextPointOnly,
        )
      : [],
  );
  let penPreview = $derived(
    editor.tool === "pen" && editor.penStroke.length >= 2
      ? smoothStrokePreview(editor.penStroke, 4)
      : [],
  );
  /** Each collision as the stretch of path the robot overlaps, plus where it first touches. */
  let collisionMarks = $derived(
    playback.collisions.map((collision) => {
      const samples = 24;
      const trace = Array.from({ length: samples + 1 }, (_, i) => {
        const pose = robotPoseAt(
          collision.start + ((collision.end - collision.start) * i) / samples,
          playback.prediction.timeline,
          doc.startPoint,
          doc.lines,
          settings,
        );
        return { x: pose.x, y: pose.y };
      });
      return {
        trace,
        footprint: robotFootprint(collision.firstContact, settings),
      };
    }),
  );

  /** Screen pose for a robot sprite; sprites rotate clockwise. */
  const sprite = (pose: { x: number; y: number; heading: number }) => ({
    xy: { x: x(pose.x), y: y(pose.y) },
    heading: -pose.heading,
  });

  type DragTarget =
    | { kind: "project"; address: PointAddress }
    | { kind: "overlay"; index: number; address: PointAddress };
  let drag = $state<{ target: DragTarget; offset: BasePoint } | null>(null);
  let pendingMove: (() => void) | null = null;

  function fieldPoint(event: PointerEvent | MouseEvent): BasePoint {
    const rect = element!.getBoundingClientRect();
    return {
      x: x.invert(event.clientX - rect.left),
      y: y.invert(event.clientY - rect.top),
    };
  }

  function snapped(point: BasePoint): BasePoint {
    return snapPoint(point, {
      snapToGrid: $snapToGrid,
      showGrid: $showGrid,
      gridSize: $gridSize,
    });
  }

  function beginDrag(target: DragTarget, event: PointerEvent) {
    const source =
      target.kind === "project" ? doc : overlays.items[target.index]?.doc;
    const point = source && pointAt(source, target.address);
    if (!point) return;
    const mouse = fieldPoint(event);
    drag = { target, offset: { x: point.x - mouse.x, y: point.y - mouse.y } };
    (event.currentTarget as Element)
      .closest("svg")
      ?.setPointerCapture(event.pointerId);
  }

  type PressTarget = "path" | "shape" | "field";
  /** The open context menu, and what the right-click that opened it landed on. */
  let menu = $state<{
    x: number;
    y: number;
    target: PressTarget;
    at: BasePoint;
  } | null>(null);
  let pressedTarget: PressTarget = "field";

  function onProjectPointDown(
    address: PointAddress,
    locked: boolean,
    event: PointerEvent,
  ) {
    if (editor.tool !== "select") return;
    event.stopPropagation();
    pressedTarget = "path";
    if (address.kind === "path") {
      editor.selectPoint(address.lineId, address.index);
    }
    if (!locked && event.button === 0) {
      beginDrag({ kind: "project", address }, event);
    }
  }

  function onSegmentDown(lineId: string, event: PointerEvent) {
    if (editor.tool !== "select") return;
    event.stopPropagation();
    pressedTarget = "path";
    editor.selectPoint(lineId, 0);
  }

  function onShapePress(shapeId: string, event: PointerEvent) {
    if (editor.tool !== "select") return;
    event.stopPropagation();
    pressedTarget = "shape";
    editor.selectShape(shapeId);
  }

  function onContextMenu(event: MouseEvent) {
    event.preventDefault();
    if (editor.tool !== "select" || overlays.active) return;
    menu = {
      x: event.clientX,
      y: event.clientY,
      target: pressedTarget,
      at: snapped(fieldPoint(event)),
    };
  }

  let menuEntries = $derived.by((): MenuEntry[] => {
    if (!menu) return [];
    const { target, at } = menu;
    const line = editor.selectedLine;
    if (target === "shape" && editor.selectedShape) {
      const shapeId = editor.selectedShape.id;
      return [
        {
          label: "Delete obstacle",
          danger: true,
          run: () => {
            project.apply(
              setShapes(doc.shapes.filter((shape) => shape.id !== shapeId)),
            );
            editor.clearSelection();
          },
        },
      ];
    }
    if (target === "field" || !line) {
      return [
        { label: "Add path here", run: () => editor.addPathAt(at) },
        ...(line
          ? [
              {
                label: `Add control point to ${line.name || "the selected path"}`,
                run: () => editor.addControlPoint(at),
              },
            ]
          : []),
      ];
    }
    const onEndPoint = editor.selectedPointIndex === 0;
    return [
      {
        label: "Add control point here",
        hint: "A",
        run: () => editor.addControlPoint(at),
      },
      {
        label: "Insert a path before this point",
        run: () => editor.insertPathBeforeSelection(),
      },
      "separator",
      {
        label: onEndPoint ? "Delete path" : "Delete control point",
        hint: "Del",
        danger: true,
        disabled:
          onEndPoint && atomicSegments(doc.lines).length <= 1,
        run: () => editor.deleteSelectedPoint(),
      },
    ];
  });

  /** Drag edits are applied once per frame; the scene redraw is the heavy part. */
  function scheduleMove(move: () => void) {
    if (!pendingMove) requestAnimationFrame(flushMove);
    pendingMove = move;
  }

  function flushMove() {
    const move = pendingMove;
    pendingMove = null;
    move?.();
  }

  function onPointerDown(event: PointerEvent) {
    pressedTarget = "field";
    if (event.button !== 0) return;
    const point = fieldPoint(event);
    if (editor.tool === "select") {
      editor.clearSelection();
    } else if (editor.tool === "pen") {
      editor.penStroke = [snapped(point)];
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    } else if (editor.tool === "coordinate") {
      const { x: px, y: py } = snapped(point);
      const text = `${px.toFixed(2)}, ${py.toFixed(2)}`;
      void navigator.clipboard?.writeText(text);
      showToast(`Copied (${text})`, "success");
      editor.setTool("select");
    }
  }

  function onPointerMove(event: PointerEvent) {
    const point = fieldPoint(event);
    if (editor.tool === "coordinate") {
      editor.coordinateHover = snapped(point);
    } else if (editor.tool === "pen" && editor.penStroke.length > 0) {
      const next = snapped(point);
      const last = editor.penStroke[editor.penStroke.length - 1];
      if (distanceBetweenPoints(last, next) >= 0.2) {
        editor.penStroke = [...editor.penStroke, next];
      }
    } else if (drag) {
      const { target, offset } = drag;
      const next = snapped({ x: point.x + offset.x, y: point.y + offset.y });
      scheduleMove(() => {
        if (target.kind === "project") {
          project.preview(updatePoint(target.address, next));
        } else {
          overlays.movePoint(target.index, target.address, next);
        }
      });
    }
  }

  function onPointerUp() {
    if (editor.tool === "pen" && editor.penStroke.length > 0) {
      editor.commitPenStroke(Number(settings.penToolMaxPaths ?? 8));
    }
    if (drag) {
      flushMove();
      project.commit();
      drag = null;
    }
  }

  function onDoubleClick(event: MouseEvent) {
    if (editor.tool !== "select") return;
    if ((event.target as Element).closest("[role=button]")) return;
    editor.addPathAt(snapped(fieldPoint(event)));
  }
</script>

<main class={[surfaceClass, "flex min-h-0 flex-col gap-2 p-2"]}>
  <div
    class="relative flex min-h-0 flex-1 items-center justify-center rounded-xl bg-body/10"
    bind:clientWidth={stageWidth}
    bind:clientHeight={stageHeight}
  >
    <div class="absolute top-2 left-2 z-50"><ToolRail /></div>
    <div class="absolute top-2 right-2 z-50"><FieldViewToggles /></div>

    <div
      bind:this={element}
      class="relative overflow-clip rounded-lg bg-base select-none"
      role="application"
      style={`width: ${pixels}px; height: ${pixels}px; max-width: 100%; max-height: 100%; aspect-ratio: 1 / 1; -webkit-touch-callout: none;`}
      oncontextmenu={onContextMenu}
    >
      <FieldMapImage
        src={fieldMapSrc}
        fieldMapName={settings.fieldMap}
        onSettled={() => (loadedFieldMap = fieldMapSrc)}
      />

      <svg
        class="pointer-events-none absolute inset-0 z-15"
        viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`}
        width={pixels}
        height={pixels}
        aria-hidden="true"
      >
        <g transform={`matrix(1 0 0 -1 0 ${FIELD_SIZE})`}>
          {#each doc.fieldPoints as point, i (i)}
            <circle
              cx={point.x}
              cy={point.y}
              r={(Math.max(0.6, point.radius ?? 2.2) * FIELD_SIZE) / pixels}
              fill={point.color || FIELD_POINT_COLOR}
              opacity={Math.max(0, Math.min(1, point.opacity ?? 1))}
            />
          {/each}
        </g>
      </svg>

      {#if editor.tool === "coordinate" && editor.coordinateHover}
        <div
          class="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-full rounded bg-black/85 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white shadow"
          style={`left: ${x(editor.coordinateHover.x)}px; top: ${y(editor.coordinateHover.y)}px;`}
        >
          <span class="mr-1 text-primary">+</span>
          {editor.coordinateHover.x.toFixed(2)}, {editor.coordinateHover.y.toFixed(
            2,
          )}
        </div>
      {/if}

      <MathTools {x} {y} fieldElement={element} robotXY={sprite(playback.robotPose).xy} />

      {#if overlays.active}
        {#each playback.overlayPoses as pose, index (index)}
          {@const { xy, heading } = sprite(pose)}
          <RobotSprite
            {xy}
            {heading}
            widthPx={x(settings.rWidth)}
            heightPx={x(settings.rHeight)}
            {settings}
            alt="Robot {index + 1}"
            zIndex={20 - index}
            arrowZIndex={20 - index}
            opacity={1 - index * 0.15}
            arrowId="arrowhead-{index}"
            onImageSettled={() => (loadedRobotImage = robotImageSrc)}
          />
        {/each}
      {:else}
        {@const { xy, heading } = sprite(playback.robotPose)}
        <RobotSprite
          {xy}
          {heading}
          widthPx={x(settings.rWidth)}
          heightPx={x(settings.rHeight)}
          {settings}
          alt="Robot"
          zIndex={20}
          arrowZIndex={21}
          arrowId="arrowhead-main"
          showTValue={settings.showCurrentTValue}
          tValue={playback.robotPose.t}
          onImageSettled={() => (loadedRobotImage = robotImageSrc)}
        />
        {@const clearance = x(Math.max(settings.rWidth, settings.rHeight)) * 0.75}
        {@const below = xy.y + clearance + 20 < pixels}
        <div
          class={[
            "pointer-events-none absolute z-21 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-white tabular-nums",
            !below && "-translate-y-full",
          ]}
          style={`left: ${xy.x}px; top: ${below ? xy.y + clearance : xy.y - clearance}px;`}
          aria-label="Robot position"
        >
          {playback.robotPose.x.toFixed(1)}, {playback.robotPose.y.toFixed(1)} ·
          {playback.robotPose.heading.toFixed(0)}°
        </div>
      {/if}

      <svg
        class={[
          "absolute inset-0 z-30",
          editor.tool !== "select" && "cursor-crosshair",
          drag && "cursor-grabbing",
        ]}
        viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`}
        width={pixels}
        height={pixels}
        role="presentation"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onlostpointercapture={onPointerUp}
        onpointerleave={() => (editor.coordinateHover = null)}
        ondblclick={onDoubleClick}
      >
        <g transform={`matrix(1 0 0 -1 0 ${FIELD_SIZE})`}>
          {#if obstaclesOn}
            <Obstacles
              shapes={doc.shapes}
              selectedId={editor.selectedShape?.id}
              onShapeDown={onShapePress}
              onVertexDown={(address, event) => {
                if (editor.tool !== "select" || address.kind !== "vertex") {
                  return;
                }
                onShapePress(address.shapeId, event);
                if (event.button === 0) {
                  beginDrag({ kind: "project", address }, event);
                }
              }}
            />
          {/if}

          {#if ghost.length >= 3}
            <path
              d={polylinePath(ghost, true)}
              fill={GHOST_COLOR}
              stroke={GHOST_COLOR}
              stroke-width={0.5}
              opacity={0.15}
              pointer-events="none"
            />
          {/if}
          {#each overlayGhosts as outline, index (index)}
            {#if outline.length >= 3}
              <path
                d={polylinePath(outline, true)}
                fill={overlays.items[index]?.color ?? GHOST_COLOR}
                stroke={overlays.items[index]?.color ?? GHOST_COLOR}
                stroke-width={0.5}
                opacity={0.15}
                pointer-events="none"
              />
            {/if}
          {/each}
          {#each onionLayers as layer, index (index)}
            <path
              d={polylinePath(layer.corners, true)}
              fill="none"
              stroke={settings.onionColor || "#dc2626"}
              stroke-width={0.28}
              opacity={0.9}
              pointer-events="none"
            />
          {/each}

          {#if penPreview.length >= 2}
            <path
              d={polylinePath(penPreview)}
              fill="none"
              stroke={PEN_PREVIEW_COLOR}
              stroke-width={LINE_WIDTH * 0.9}
              stroke-dasharray="0.6 0.6"
              opacity={0.35}
              pointer-events="none"
            />
          {/if}

          {#if overlays.active}
            {#each overlays.items as overlay, index (overlay.filePath)}
              <PathStrokes
                startPoint={overlay.doc.startPoint}
                lines={overlay.doc.lines}
                idPrefix={`additional-path-${index}-line`}
                color={overlay.color}
                opacity={(settings.pathOpacity || 1) * (1 - index * 0.1)}
                honorLocked={false}
              />
            {/each}
            {#each overlays.items as overlay, index (overlay.filePath)}
              <PathMarkers
                startPoint={overlay.doc.startPoint}
                lines={overlay.doc.lines}
                idPrefix={`additional-path-${index}-point`}
                color={overlay.color}
                radiusScale={0.9}
                labelSize={1.4}
                opacity={0.8}
                onPointDown={(address, _locked, event) => {
                  if (editor.tool !== "select") return;
                  event.stopPropagation();
                  beginDrag({ kind: "overlay", index, address }, event);
                }}
              />
            {/each}
          {:else}
            <PathStrokes
              startPoint={doc.startPoint}
              lines={doc.lines}
              idPrefix="line"
              opacity={settings.pathOpacity || 1}
              {onSegmentDown}
            />
            {#each collisionMarks as mark, index (index)}
              <path
                d={polylinePath(mark.trace)}
                fill="none"
                stroke={COLLISION_COLOR}
                stroke-width={LINE_WIDTH * 2.2}
                stroke-linecap="round"
                opacity={0.55}
                pointer-events="none"
              />
              <path
                d={polylinePath(mark.footprint, true)}
                fill="none"
                stroke={COLLISION_COLOR}
                stroke-width={0.35}
                stroke-dasharray="1 0.6"
                pointer-events="none"
              />
            {/each}
            <PathMarkers
              startPoint={doc.startPoint}
              lines={doc.lines}
              idPrefix="point"
              selection={{
                lineId: editor.selectedLineId,
                index: editor.selectedPointIndex,
              }}
              onPointDown={onProjectPointDown}
            />
          {/if}
        </g>
      </svg>

      {#if !assetsReady}
        <FieldLoadingOverlay />
      {/if}
    </div>
  </div>

  <PlaybackBar />
</main>

{#if menu}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    entries={menuEntries}
    onClose={() => (menu = null)}
  />
{/if}
