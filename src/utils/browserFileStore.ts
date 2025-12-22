// src/utils/browserFileStore.ts
// Browser file store for .pp files using localStorage (simple fallback for IndexedDB)

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: number;
}

const STORAGE_KEY = 'pp_files';

function getFiles(): Record<string, { content: string; modified: number }> {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

function saveFiles(files: Record<string, { content: string; modified: number }>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
}

export async function listFiles(): Promise<FileInfo[]> {
  const files = getFiles();
  return Object.entries(files).map(([name, { content, modified }]) => ({
    name,
    path: name,
    size: content.length,
    modified,
  }));
}

export async function readFile(path: string): Promise<string> {
  const files = getFiles();
  if (!(path in files)) throw new Error('File not found');
  return files[path].content;
}

export async function writeFile(path: string, content: string): Promise<boolean> {
  const files = getFiles();
  files[path] = { content, modified: Date.now() };
  saveFiles(files);
  return true;
}

export async function deleteFile(path: string): Promise<boolean> {
  const files = getFiles();
  if (!(path in files)) return false;
  delete files[path];
  saveFiles(files);
  return true;
}

export async function fileExists(path: string): Promise<boolean> {
  const files = getFiles();
  return path in files;
}

export async function renameFile(oldPath: string, newPath: string): Promise<{ success: boolean; newPath: string }> {
  const files = getFiles();
  if (!(oldPath in files)) return { success: false, newPath: oldPath };
  if (newPath in files) return { success: false, newPath };
  files[newPath] = { ...files[oldPath], modified: Date.now() };
  delete files[oldPath];
  saveFiles(files);
  return { success: true, newPath };
}

export async function getDirectoryStats(): Promise<{ totalFiles: number; totalSize: number; lastModified: number }> {
  const files = getFiles();
  const all = Object.values(files);
  return {
    totalFiles: all.length,
    totalSize: all.reduce((sum, f) => sum + f.content.length, 0),
    lastModified: all.reduce((max, f) => Math.max(max, f.modified), 0),
  };
}
