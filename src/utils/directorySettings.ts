import type { DirectorySettings } from "../types";

// Default directory settings
const DEFAULT_DIRECTORY_SETTINGS: DirectorySettings = {
  autoPathsDirectory: "",
};

// Get the path for the directory settings file
function getDirectorySettingsPath(): string {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI) {
    return electronAPI
      .getAppDataPath()
      .then((appDataPath: string) => `${appDataPath}/directory-settings.json`);
  }
  return "";
}

// Save directory settings
export async function saveDirectorySettings(
  settings: DirectorySettings,
): Promise<void> {
  try {
    const settingsPath = await getDirectorySettingsPath();
    const electronAPI = (window as any).electronAPI;

    if (electronAPI && settingsPath) {
      await electronAPI.writeFile(
        settingsPath,
        JSON.stringify(settings, null, 2),
      );
    }
  } catch (error) {
    console.error("Error saving directory settings:", error);
  }
}

// Load directory settings
export async function loadDirectorySettings(): Promise<DirectorySettings> {
  try {
    const settingsPath = await getDirectorySettingsPath();
    const electronAPI = (window as any).electronAPI;

    if (electronAPI && settingsPath) {
      const exists = await electronAPI.fileExists(settingsPath);
      if (exists) {
        const content = await electronAPI.readFile(settingsPath);
        const savedSettings = JSON.parse(content) as Partial<DirectorySettings>;
        return { ...DEFAULT_DIRECTORY_SETTINGS, ...savedSettings };
      }
    }
  } catch (error) {
    console.error("Error loading directory settings:", error);
  }

  return DEFAULT_DIRECTORY_SETTINGS;
}

// Get the saved AutoPaths directory
export async function getSavedAutoPathsDirectory(): Promise<string> {
  const settings = await loadDirectorySettings();
  return settings.autoPathsDirectory;
}

// Save the AutoPaths directory
export async function saveAutoPathsDirectory(directory: string): Promise<void> {
  const settings = await loadDirectorySettings();
  settings.autoPathsDirectory = directory;
  await saveDirectorySettings(settings);
}
