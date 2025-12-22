import type { DirectorySettings } from "../types";

// Browser-friendly directory settings using localStorage
const STORAGE_KEY = "ppv.directorySettings";

const DEFAULT_DIRECTORY_SETTINGS: DirectorySettings = {
  autoPathsDirectory: "",
};

export async function saveDirectorySettings(
  settings: DirectorySettings,
): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Error saving directory settings:", error);
  }
}

export async function loadDirectorySettings(): Promise<DirectorySettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DIRECTORY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DirectorySettings>;
    return { ...DEFAULT_DIRECTORY_SETTINGS, ...parsed };
  } catch (error) {
    console.error("Error loading directory settings:", error);
    return DEFAULT_DIRECTORY_SETTINGS;
  }
}

export async function getSavedAutoPathsDirectory(): Promise<string> {
  const settings = await loadDirectorySettings();
  return settings.autoPathsDirectory;
}

export async function saveAutoPathsDirectory(directory: string): Promise<void> {
  const settings = await loadDirectorySettings();
  settings.autoPathsDirectory = directory;
  await saveDirectorySettings(settings);
}
