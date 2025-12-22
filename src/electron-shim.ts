// Browser shim for Electron's `window.electronAPI` so the app can run
// in a standard web environment (e.g. Vercel). These implementations
// are best-effort fallbacks and do not provide full filesystem access.

function downloadFile(filename: string, data: Uint8Array | string, mime = "application/octet-stream") {
  const blob = data instanceof Uint8Array ? new Blob([data], { type: mime }) : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const shim = {
  getAppDataPath: async () => {
    return "";
  },
  getDirectory: async () => {
    // Not available in browser; return empty string
    return "";
  },
  setDirectory: async () => {
    // No-op in browser
    return null;
  },
  listFiles: async (_directory: string) => {
    return [];
  },
  readFile: async (_filePath: string) => {
    return "";
  },
  writeFile: async (filePath: string | null, content: string) => {
    // Trigger download as fallback
    const name = filePath ? filePath.split(/[\\/]/).pop() || "file" : "file";
    downloadFile(name, content, "text/plain;charset=utf-8");
    return true;
  },
  deleteFile: async (_filePath: string) => {
    return true;
  },
  fileExists: async (_filePath: string) => {
    return false;
  },
  getSavedDirectory: async () => {
    return localStorage.getItem("ppv.savedDirectory") || "";
  },
  createDirectory: async (_dirPath: string) => {
    return false;
  },
  getDirectoryStats: async (_dirPath: string) => {
    return { totalFiles: 0, totalSize: 0, lastModified: new Date() };
  },
  renameFile: async (_oldPath: string, _newPath: string) => {
    return { success: false, newPath: "" };
  },
  showSaveDialog: async (_options: any) => {
    // Browser cannot show native save dialog; return null
    return null;
  },
  writeFileBase64: async (_filePath: string | null, base64: string) => {
    try {
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      downloadFile(_filePath ? (_filePath.split(/[\\/]/).pop() || "file") : "file", bytes, "application/octet-stream");
      return true;
    } catch (e) {
      console.error("writeFileBase64 shim failed:", e);
      return false;
    }
  },
};

// Attach to window if not present
if (!(window as any).electronAPI) {
  (window as any).electronAPI = shim;
}

export default shim;
