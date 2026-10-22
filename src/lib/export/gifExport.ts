import type {
  BasePoint,
  Path,
  SequenceItem,
  Settings,
  StartPose,
} from "../../types";
import { calculatePathTime } from "../../utils/timeCalculator";
import { pathStem } from "../../utils/filename";
import { flattenToAtomicSegments } from "../../utils/pathTraversal";
import { LINE_WIDTH } from "../../config/defaults";
import { POLYLINE_SAMPLES } from "../scene/stroke";

export const GIF_EXPORT_SCALE = 0.65;
export const GIF_EXPORT_FPS = 20;
export const GIF_EXPORT_QUALITY = 15;

/**
 * Paints one set of path lines onto a canvas, mirroring the way Two.js draws
 * them on the field. This is what makes the trails clearly visible in the
 * exported GIF: instead of serializing the live Two.js SVG (which is async and
 * can capture a partially-rendered/blank scene), we draw the geometry directly
 * into the frame canvas, so it is always present and never flashes.
 */
export interface CanvasPathLayer {
  /** Where the first segment starts. */
  startPoint: StartPose;
  /** The paths (atomic or compound) to draw. */
  paths: Path[];
  /** Converts a field inch X into output canvas pixels. */
  toX: (inch: number) => number;
  /** Converts a field inch Y into output canvas pixels. */
  toY: (inch: number) => number;
  /** Stroke width in output canvas pixels. */
  lineWidth?: number;
  /** Optional override for the path colour (e.g. second/additional paths). */
  color?: string;
  /** Base opacity applied to the whole layer. */
  opacity?: number;
  /** Whether locked paths should render dashed/dimmer. */
  honorLocked?: boolean;
}

export function drawPathLayer(
  ctx: CanvasRenderingContext2D,
  layer: CanvasPathLayer,
): void {
  const {
    startPoint,
    paths,
    toX,
    toY,
    lineWidth = 1,
    color,
    opacity = 1,
    honorLocked = true,
  } = layer;

  const segments = flattenToAtomicSegments(startPoint, paths);

  for (const segment of segments) {
    const line = segment.line;
    const points = segment.curve.sample(POLYLINE_SAMPLES);

    const stroke = color || line.color;
    const locked = Boolean(line.locked);

    ctx.save();
    ctx.globalAlpha = opacity * (locked && honorLocked ? 0.7 : 1);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(
      locked && honorLocked ? [lineWidth * 1.5, lineWidth * 1.5] : [],
    );

    ctx.beginPath();
    points.forEach((point, i) => {
      if (i === 0) ctx.moveTo(toX(point.x), toY(point.y));
      else ctx.lineTo(toX(point.x), toY(point.y));
    });
    ctx.stroke();
    ctx.restore();
  }
}

/** Convenience default stroke width in output pixels for a given field scale. */
export function pathLayerLineWidth(toX: (inch: number) => number): number {
  return toX(LINE_WIDTH);
}

export function createImageLoader() {
  const imageCache = new Map<string, HTMLImageElement>();

  return function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const cached = imageCache.get(src);
      if (cached) {
        resolve(cached);
        return;
      }
      const image = new Image();
      image.onload = () => {
        imageCache.set(src, image);
        resolve(image);
      };
      image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      image.src = src;
    });
  };
}

export interface GifDurationInputs {
  hasActivePaths: boolean;
  additionalPaths: {
    startPoint: StartPose | null;
    lines: Path[];
    settings: Settings;
    sequence: SequenceItem[];
  }[];
  startPoint: StartPose;
  lines: Path[];
  sequence: SequenceItem[];
  settings: Settings;
}

/** Total animation seconds to capture, taking the longest path in multi modes. */
export function computeGifDuration(input: GifDurationInputs): number {
  if (input.hasActivePaths) {
    return input.additionalPaths.reduce((longest, pathData) => {
      if (!pathData.startPoint) return longest;
      const pathTime = calculatePathTime(
        pathData.startPoint,
        pathData.lines,
        pathData.settings,
        pathData.sequence,
      );
      return Math.max(longest, pathTime?.totalTime || 0);
    }, 0);
  }

  const pathTime = calculatePathTime(
    input.startPoint,
    input.lines,
    input.settings,
    input.sequence,
  );
  return pathTime?.totalTime || 0;
}

export function createRobotDrawer(
  robotImage: HTMLImageElement,
  robotPixelWidth: number,
  robotPixelHeight: number,
  scale = GIF_EXPORT_SCALE,
) {
  return function drawRobot(
    ctx: CanvasRenderingContext2D,
    xy: BasePoint,
    headingDeg: number,
    opacity = 1,
  ) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(xy.x * scale, xy.y * scale);
    ctx.rotate((headingDeg * Math.PI) / 180);
    ctx.drawImage(
      robotImage,
      (-robotPixelWidth * scale) / 2,
      (-robotPixelHeight * scale) / 2,
      robotPixelWidth * scale,
      robotPixelHeight * scale,
    );
    ctx.restore();
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
