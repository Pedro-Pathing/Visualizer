import { OPENABLE_EXTENSIONS } from "../../utils/filename";

interface WritableFileHandle {
  name: string;
  createWritable(): Promise<{
    write(content: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

interface FilePickerWindow {
  showSaveFilePicker?(options: object): Promise<WritableFileHandle>;
  showOpenFilePicker?(options: object): Promise<WritableFileHandle[]>;
}

const PATH_FILE_TYPES = [
  {
    description: "Path files",
    accept: { "application/json": OPENABLE_EXTENSIONS },
  },
];

const pickers = window as unknown as FilePickerWindow;

export const canPickSaveFile = () => Boolean(pickers.showSaveFilePicker);
export const canPickExistingFile = () => Boolean(pickers.showOpenFilePicker);

/** Writes to a file chosen in the native save dialog and returns its name. */
export async function saveToPickedFile(
  content: string,
  suggestedName: string,
): Promise<string> {
  const handle = await pickers.showSaveFilePicker!({
    suggestedName,
    types: PATH_FILE_TYPES,
  });
  await write(handle, content);
  return handle.name;
}

/** Overwrites an existing file chosen in the native open dialog and returns its name. */
export async function overwritePickedFile(content: string): Promise<string> {
  const [handle] = await pickers.showOpenFilePicker!({
    types: PATH_FILE_TYPES,
    multiple: false,
  });
  await write(handle, content);
  return handle.name;
}

/** True when the user dismissed a file picker. */
export function isPickerCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function write(handle: WritableFileHandle, content: string) {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}
