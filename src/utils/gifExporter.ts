import GIF from "gif.js";

export interface GifExportOptions {
  /** Output size in pixels. */
  width: number;
  height: number;
  /** Total duration in milliseconds. */
  duration: number;
  /** Frames per second (default: 20). */
  fps?: number;
  /** GIF quality 1-30 (lower is better, default: 10). */
  quality?: number;
  /** Number of encoder workers (defaults to a value based on CPU count). */
  workers?: number;
  onProgress?: (progress: number) => void;
  onFrameAdvance?: (frameIndex: number, totalFrames: number) => Promise<void>;
  /**
   * Draw an entire frame. Drive animation to the given frame first via
   * `onFrameAdvance`; this callback just paints the canvas. Because the whole
   * frame (background + paths + foreground) is painted here in a single,
   * synchronous pass, frames are stable and cannot flash from a stale or
   * partially-rendered SVG snapshot.
   */
  onDrawFrame?: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    frameIndex: number,
    totalFrames: number,
    framePercent: number,
  ) => void | Promise<void>;
  /** Function to check if export should be cancelled. */
  shouldCancel?: () => boolean;
}

export async function exportAsGif(options: GifExportOptions): Promise<Blob> {
  const {
    width,
    height,
    duration,
    fps = 20,
    quality = 10,
    workers,
    onProgress,
    onFrameAdvance,
    onDrawFrame,
    shouldCancel,
  } = options;

  // Calculate frame count and delay (delay in ms, matching gif.js semantics).
  const frameCount = Math.max(1, Math.ceil((duration / 1000) * fps));
  const frameDelay = Math.floor(1000 / fps);

  // More workers = faster encoding. Bounded so we never spin up a horse.
  const encoderWorkers =
    workers ??
    Math.max(
      1,
      Math.min(
        4,
        (typeof navigator !== "undefined" && navigator.hardwareConcurrency) ||
          2,
      ) - 1,
    );

  // Create GIF encoder
  const gif = new GIF({
    workers: encoderWorkers,
    quality,
    width,
    height,
    workerScript: "/gif.worker.js",
  });

  // Report initial progress
  onProgress?.(0);

  // A single scratch canvas that every frame is painted into.
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const ctx = tempCanvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // Capture frames. No artificial sleep and no per-frame SVG serialization:
  // `onDrawFrame` paints the whole frame synchronously, which is both faster
  // and immune to the async/timing races that produced flashing frames.
  for (let i = 0; i < frameCount; i++) {
    if (shouldCancel?.()) {
      throw new Error("Export cancelled by user");
    }

    if (onFrameAdvance) {
      await onFrameAdvance(i, frameCount);
    }

    const framePercent = frameCount > 1 ? (i / (frameCount - 1)) * 100 : 100;

    ctx.clearRect(0, 0, width, height);
    if (onDrawFrame) {
      await onDrawFrame(ctx, width, height, i, frameCount, framePercent);
    }

    gif.addFrame(ctx, { delay: frameDelay, copy: true });

    // First half of progress: capturing frames.
    const captureProgress = ((i + 1) / frameCount) * 0.5;
    onProgress?.(captureProgress);
  }

  // Return promise that resolves with the GIF blob
  return new Promise<Blob>((resolve, reject) => {
    gif.on("finished", (blob: Blob) => {
      onProgress?.(1);
      resolve(blob);
    });

    gif.on("progress", (progress: number) => {
      if (shouldCancel?.()) {
        reject(new Error("Export cancelled by user"));
        return;
      }
      // Second half of progress (encoding).
      onProgress?.(0.5 + progress * 0.5);
    });

    gif.on("error", (error: Error) => {
      reject(error);
    });

    gif.render();
  });
}
