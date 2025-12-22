// Placeholder GIF export for web-only build.
// To enable real GIF export, install  and restore the original implementation.

export interface ExportGifOptions {
  filename?: string;
}

export async function exportPathToGif(options?: ExportGifOptions): Promise<Blob | void> {
  console.warn('GIF export is disabled in the web-only build. Install  to enable.');
  return Promise.reject(new Error('gif.js not installed: GIF export unavailable'));
}
