// Simple IndexedDB-backed file store for browser uploads.
// Provides basic CRUD for named text files (path files) with metadata.

const DB_NAME = "ppv-files-db";
const STORE_NAME = "files";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function promisifyRequest<T = any>(req: IDBRequest<T> | IDBTransaction) {
  return new Promise<T>((resolve, reject) => {
    if ((req as IDBRequest).onsuccess !== undefined) {
      (req as IDBRequest).onsuccess = (ev: any) => resolve(ev.target.result);
      (req as IDBRequest).onerror = (ev: any) => reject((ev.target as any).error);
    } else {
      const tx = req as IDBTransaction;
      tx.oncomplete = () => resolve(undefined as any);
      tx.onerror = (ev: any) => reject((ev.target as any).error);
      tx.onabort = (ev: any) => reject((ev.target as any).error);
    }
  });
}

export interface StoredFile {
  id: string; // generated id
  name: string; // filename with extension
  content: string; // text content
  size: number;
  modified: string; // ISO date
}

async function list(): Promise<StoredFile[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.getAll();
  const result = await promisifyRequest<StoredFile[]>(req);
  tx.commit?.();
  return result || [];
}

async function read(id: string): Promise<string> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(id);
  const res = await promisifyRequest<StoredFile | undefined>(req);
  if (!res) throw new Error("File not found");
  return res.content;
}

function genId(name: string) {
  return `local:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}:${name}`;
}

async function create(name: string, content: string): Promise<StoredFile> {
  const id = genId(name);
  const file: StoredFile = {
    id,
    name,
    content,
    size: new Blob([content]).size,
    modified: new Date().toISOString(),
  };
  // Enforce max of 3 files: if adding would exceed, remove the oldest file
  const existing = await list();
  if (existing.length >= 3) {
    // find oldest by modified
    const sorted = existing.slice().sort((a, b) => new Date(a.modified).getTime() - new Date(b.modified).getTime());
    const oldest = sorted[0];
    if (oldest) {
      await del(oldest.id);
    }
  }
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).add(file);
  await promisifyRequest(tx);
  return file;
}

async function update(id: string, content: string): Promise<StoredFile> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const existing = await promisifyRequest<StoredFile | undefined>(store.get(id));
  if (!existing) throw new Error("File not found");
  existing.content = content;
  existing.size = new Blob([content]).size;
  existing.modified = new Date().toISOString();
  store.put(existing);
  await promisifyRequest(tx);
  return existing;
}

async function del(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  await promisifyRequest(tx);
}

async function exists(name: string): Promise<boolean> {
  const all = await list();
  return all.some((f) => f.name === name);
}

async function rename(id: string, newName: string): Promise<StoredFile> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const rec = await promisifyRequest<StoredFile | undefined>(store.get(id));
  if (!rec) throw new Error("File not found");
  rec.name = newName;
  rec.modified = new Date().toISOString();
  store.put(rec);
  await promisifyRequest(tx);
  return rec;
}

async function stats(): Promise<{ totalFiles: number; totalSize: number; lastModified: Date }> {
  const all = await list();
  const totalFiles = all.length;
  const totalSize = all.reduce((s, f) => s + (f.size || 0), 0);
  const lastModified = all.reduce((d, f) => {
    const m = new Date(f.modified);
    return m > d ? m : d;
  }, new Date(0));
  return { totalFiles, totalSize, lastModified };
}

export default {
  list,
  read,
  create,
  update,
  delete: del,
  exists,
  rename,
  stats,
};
