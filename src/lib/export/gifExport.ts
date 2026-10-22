import type {
  BasePoint,
  Path,
  SequenceItem,
  Settings,
  StartPose,
} from "../../types";
import {
  FIELD_IMAGE_OVERHANG,
  FIELD_SIZE,
  LINE_WIDTH,
} from "../../config/defaults";
import { robotPoseAt } from "../../sim/pose";
import { exportAsGif } from "../../utils/gifExporter";
import { pathStem } from "../../utils/filename";
import { flattenToAtomicSegments } from "../../utils/pathTraversal";
import { calculateVisualizationPathTime } from "../../utils/timeCalculator";
import { POLYLINE_SAMPLES } from "../scene/stroke";

export const GIF_EXPORT_SCALE = 0.65;
export const GIF_EXPORT_FPS = 20;
export const GIF_EXPORT_QUALITY = 15;

/** One robot and the path it drives. */
export interface GifPath {
  startPoint: StartPose;
  lines: Path[];
  sequence: SequenceItem[];
  settings: Settings;
  /** Draws every segment in this colour instead of its own. */
  color?: string;
  opacity?: number;
  /** Draw locked segments dashed and dimmer. */
  honorLocked?: boolean;
}

export interface GifRequest {
  paths: GifPath[];
  fieldImageSrc: string;
  robotImageSrc: string;
  /** The on-screen field size in pixels; the GIF is a fixed fraction of it. */
  fieldPixels: number;
  onProgress?: (progress: number) => void;
  shouldCancel?: () => boolean;
}

/**
 * Render the paths and their robots as an animated GIF. Each frame is painted
 * from the simulated poses, so it never depends on what the screen shows.
 */
export async function renderPathGif(request: GifRequest): Promise<Blob> {
  const size = Math.max(1, Math.floor(request.fieldPixels * GIF_EXPORT_SCALE));
  const pixelsPerInch = size / FIELD_SIZE;
  const toX = (inches: number) => inches * pixelsPerInch;
  const toY = (inches: number) => size - inches * pixelsPerInch;

  const loadImage = createImageLoader();
  const [fieldImage, robotImage] = await Promise.all([
    loadImage(request.fieldImageSrc).catch(() =>
      loadImage("/fields/decode.webp"),
    ),
    loadImage(request.robotImageSrc).catch(() => loadImage("/robot.png")),
  ]);

  const background = document.createElement("canvas");
  background.width = size;
  background.height = size;
  const backgroundContext = background.getContext("2d");
  if (!backgroundContext) throw new Error("Failed to get canvas context");
  const overhang = toX(FIELD_IMAGE_OVERHANG);
  backgroundContext.drawImage(
    fieldImage,
    -overhang,
    -overhang,
    size + 2 * overhang,
    size + 2 * overhang,
  );
  for (const path of request.paths) {
    drawPathLayer(backgroundContext, path, toX, toY, toX(LINE_WIDTH));
  }

  const timelines = request.paths.map((path) =>
    calculateVisualizationPathTime(
      path.startPoint,
      path.lines,
      path.settings,
      path.sequence,
    ),
  );
  const duration = Math.max(0, ...timelines.map((t) => t.totalTime));
  if (duration <= 0) throw new Error("Path duration is too short to export.");

  return exportAsGif({
    width: size,
    height: size,
    duration: duration * 1000,
    fps: GIF_EXPORT_FPS,
    quality: GIF_EXPORT_QUALITY,
    shouldCancel: request.shouldCancel,
    onProgress: request.onProgress,
    onDrawFrame: (context, _width, _height, _frame, _frames, percent) => {
      context.drawImage(background, 0, 0, size, size);
      const seconds = (percent / 100) * duration;
      request.paths.forEach((path, index) => {
        const timeline = timelines[index];
        const pose = robotPoseAt(
          Math.min(seconds, timeline.totalTime),
          timeline.timeline,
          path.startPoint,
          path.lines,
          path.settings,
        );
        drawRobot(
          context,
          robotImage,
          { x: toX(pose.x), y: toY(pose.y) },
          -pose.heading,
          path.settings.rWidth * pixelsPerInch,
          path.settings.rHeight * pixelsPerInch,
          path.opacity ?? 1,
        );
      });
    },
  });
}

function drawPathLayer(
  context: CanvasRenderingContext2D,
  path: GifPath,
  toX: (inches: number) => number,
  toY: (inches: number) => number,
  lineWidth: number,
) {
  const honorLocked = path.honorLocked ?? true;
  for (const segment of flattenToAtomicSegments(path.startPoint, path.lines)) {
    const locked = honorLocked && Boolean(segment.line.locked);
    context.save();
    context.globalAlpha =
      (path.opacity ?? path.settings.pathOpacity ?? 1) * (locked ? 0.7 : 1);
    context.strokeStyle = path.color || segment.line.color;
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.setLineDash(locked ? [lineWidth * 1.5, lineWidth * 1.5] : []);
    context.beginPath();
    segment.curve.sample(POLYLINE_SAMPLES).forEach((point, i) => {
      if (i === 0) context.moveTo(toX(point.x), toY(point.y));
      else context.lineTo(toX(point.x), toY(point.y));
    });
    context.stroke();
    context.restore();
  }
}

/** `screenHeading` is clockwise degrees, as the canvas rotates. */
function drawRobot(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  center: BasePoint,
  screenHeading: number,
  width: number,
  height: number,
  opacity: number,
) {
  context.save();
  context.globalAlpha = opacity;
  context.translate(center.x, center.y);
  context.rotate((screenHeading * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

function createImageLoader() {
  const cache = new Map<string, Promise<HTMLImageElement>>();
  return (src: string): Promise<HTMLImageElement> => {
    let pending = cache.get(src);
    if (!pending) {
      pending = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;
      });
      cache.set(src, pending);
    }
    return pending;
  };
}

export function resolveGifFileName(
  currentFilePath: string | null,
  hasActivePaths: boolean,
): string {
  if (currentFilePath) return pathStem(currentFilePath);
  if (hasActivePaths) return "multiple_paths";
  return "path_animation";
}

/** Frame capture occupies the first half of the progress bar, encoding the second. */
export function formatGifProgressStatus(progress: number): string {
  return progress < 0.5
    ? `Capturing frames... ${Math.round(progress * 200)}%`
    : `Encoding GIF... ${Math.round((progress - 0.5) * 200)}%`;
}
