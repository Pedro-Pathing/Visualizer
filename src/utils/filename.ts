/** What new project files are saved as. The `.json` ending gets editors to treat them as JSON. */
export const PROJECT_EXTENSION = ".pp.json";

/** Earlier builds saved plain `.pp` files. They still open. */
export const LEGACY_PROJECT_EXTENSION = ".pp";

/**
 * The endings file pickers filter by. They match only the last dot segment, so
 * `.json` already covers `.pp.json`.
 */
export const OPENABLE_EXTENSIONS = [LEGACY_PROJECT_EXTENSION, ".json"];

export function basename(filePath: string | null | undefined): string {
  return filePath?.split(/[\\/]/).pop() ?? "";
}

/** Whether `name` is a project file, in either the current or the legacy form. */
export function isProjectFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(PROJECT_EXTENSION) ||
    lower.endsWith(LEGACY_PROJECT_EXTENSION)
  );
}

export function stripProjectExtension(name: string | null | undefined): string {
  const value = name ?? "";
  const lower = value.toLowerCase();
  for (const extension of [PROJECT_EXTENSION, LEGACY_PROJECT_EXTENSION]) {
    if (lower.endsWith(extension)) {
      return value.slice(0, value.length - extension.length);
    }
  }
  return value;
}

export function pathStem(filePath: string | null | undefined): string {
  return stripProjectExtension(basename(filePath));
}
