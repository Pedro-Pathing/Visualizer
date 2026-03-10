import GIF from "gif.js";

export interface GifExportOptions {
  source: HTMLCanvasElement | SVGSVGElement; // Two.js renderer element
  duration: number; // Total duration in milliseconds
  fps?: number; // Frames per second (default: 20)
  quality?: number; // GIF quality 1-30 (lower is better, default: 10)
  scale?: number; // Scale factor for output (default: 0.5 for lower res)
  onProgress?: (progress: number) => void;
  onFrameAdvance?: (frameIndex: number, totalFrames: number) => Promise<void>;
  onDrawBackground?: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    frameIndex: number,
    totalFrames: number,
  ) => Promise<void> | void;
  onDrawForeground?: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    frameIndex: number,
    totalFrames: number,
  ) => Promise<void> | void;
  shouldCancel?: () => boolean; // Function to check if export should be cancelled
}

export async function exportAsGif(options: GifExportOptions): Promise<Blob> {
  const {
    source,
    duration,
    fps = 20,
    quality = 10,
    scale = 0.5,
    onProgress,
    onFrameAdvance,
    onDrawBackground,
    onDrawForeground,
    shouldCancel,
  } = options;

  // Calculate source dimensions for both renderer types
  const sourceWidth =
    source instanceof HTMLCanvasElement
      ? source.width
      : source.clientWidth || source.viewBox?.baseVal?.width;
  const sourceHeight =
    source instanceof HTMLCanvasElement
      ? source.height
      : source.clientHeight || source.viewBox?.baseVal?.height;

  const width = Math.max(1, Math.floor(sourceWidth * scale));
  const height = Math.max(1, Math.floor(sourceHeight * scale));

  // Calculate frame count and delay
  const frameCount = Math.ceil((duration / 1000) * fps);
  const frameDelay = Math.floor(1000 / fps); // Delay between frames in ms

  // Create GIF encoder
  const gif = new GIF({
    workers: 2,
    quality,
    width,
    height,
    workerScript: "/gif.worker.js",
  });

  // Report initial progress
  onProgress?.(0);

  // Create a temporary canvas for scaling
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');
  
  if (!tempCtx) {
    throw new Error('Failed to get canvas context');
  }
  const ctx = tempCtx;

  async function drawCurrentFrame() {
    if (source instanceof HTMLCanvasElement) {
      ctx.drawImage(source, 0, 0, width, height);
      return;
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(source);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to render SVG frame"));
        image.src = svgUrl;
      });

      ctx.drawImage(img, 0, 0, width, height);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  // Capture frames
  for (let i = 0; i < frameCount; i++) {
    // Check for cancellation
    if (shouldCancel?.()) {
      throw new Error('Export cancelled by user');
    }

    // Advance animation to this frame if callback provided
    if (onFrameAdvance) {
      await onFrameAdvance(i, frameCount);
    }

    // Small delay to allow rendering to complete
    await new Promise((resolve) => setTimeout(resolve, 16)); // ~1 frame at 60fps

    ctx.clearRect(0, 0, width, height);
    if (onDrawBackground) {
      await onDrawBackground(ctx, width, height, i, frameCount);
    }

    // Draw renderer output (canvas or SVG) to temp canvas with scaling
    await drawCurrentFrame();

    if (onDrawForeground) {
      await onDrawForeground(ctx, width, height, i, frameCount);
    }

    // Add frame to GIF directly from temp canvas
    gif.addFrame(ctx, { delay: frameDelay, copy: true });

    // Report progress for frame capture
    const captureProgress = ((i + 1) / frameCount) * 0.5; // First half of progress
    onProgress?.(captureProgress);
  }

  // Return promise that resolves with the GIF blob
  return new Promise<Blob>((resolve, reject) => {
    gif.on("finished", (blob: Blob) => {
      onProgress?.(1);
      resolve(blob);
    });

    gif.on("progress", (progress: number) => {
      // Check for cancellation during encoding
      if (shouldCancel?.()) {
        reject(new Error('Export cancelled by user'));
        return;
      }
      
      // Second half of progress (encoding)
      const encodingProgress = 0.5 + progress * 0.5;
      onProgress?.(encodingProgress);
    });

    gif.on("error", (error: Error) => {
      reject(error);
    });

    gif.render();
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
