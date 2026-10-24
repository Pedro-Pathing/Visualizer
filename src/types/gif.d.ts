declare module "gif.js" {
  interface GIFOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
  }
  class GIF {
    constructor(options?: GIFOptions);
    addFrame(
      element: CanvasImageSource | CanvasRenderingContext2D | ImageData,
      opts?: { copy?: boolean; delay?: number },
    ): void;
    on(event: "progress", cb: (progress: number) => void): void;
    on(event: "finished", cb: (blob: Blob) => void): void;
    on(event: "error", cb: (error: Error) => void): void;
    render(): void;
  }
  export default GIF;
}
