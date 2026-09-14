import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Settings } from "../types";
import { isAxes, isOrigin } from "./frame";

// Versioning for settings schema
const SETTINGS_VERSION = "1.0.0";

interface StoredSettings {
  version: string;
  settings: Settings;
  lastUpdated: string;
}

const SETTINGS_STORAGE_KEY = "pedro_settings";

/**
 * Legacy support: older builds stored the custom field as "custom||<data-url>",
 * and some payloads omit fieldMap entirely.
 */
export function normalizeLegacyFieldMap(input: Settings): Settings {
  const next = { ...input };

  if (
    typeof next.fieldMap === "string" &&
    next.fieldMap.startsWith("custom||")
  ) {
    const [, embeddedImage = ""] = next.fieldMap.split("||");
    next.fieldMap = "custom";
    if (embeddedImage && !next.customFieldImage) {
      next.customFieldImage = embeddedImage;
    }
  }

  if (!next.fieldMap) {
    next.fieldMap = DEFAULT_SETTINGS.fieldMap;
  }

  return next;
}

function migrateSettings(stored: Partial<StoredSettings>): Settings {
  const defaults = { ...DEFAULT_SETTINGS };

  if (!stored.settings) {
    return defaults;
  }

  // Always merge with defaults to ensure new settings are included
  // and removed settings are not persisted
  const migrated: Settings = { ...defaults };

  // Copy only the properties that exist in both objects
  Object.keys(stored.settings).forEach((key) => {
    if (key in migrated) {
      // @ts-expect-error - We know the key exists in Settings
      migrated[key] = stored.settings[key];
    }
  });

  return normalizeCoordinateFrame(normalizeLegacyFieldMap(migrated));
}

/**
 * migrateSettings copies any key it finds in the defaults without inspecting
 * the value, so these two arrive unchecked.
 */
function normalizeCoordinateFrame(input: Settings): Settings {
  return {
    ...input,
    origin: isOrigin(input.origin) ? input.origin : DEFAULT_SETTINGS.origin,
    axes: isAxes(input.axes) ? input.axes : DEFAULT_SETTINGS.axes,
  };
}

// Load settings from localStorage
export async function loadSettings(): Promise<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const stored: StoredSettings = JSON.parse(raw);
    if (stored.version !== SETTINGS_VERSION) {
      // Optionally handle migration here
    }
    return migrateSettings(stored);
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

// Save settings to localStorage
export async function saveSettings(settings: Settings): Promise<boolean> {
  try {
    const stored: StoredSettings = {
      version: SETTINGS_VERSION,
      settings: { ...settings },
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch (error) {
    return false;
  }
}

// Reset settings to defaults
export async function resetSettings(): Promise<Settings> {
  const defaults = { ...DEFAULT_SETTINGS };
  await saveSettings(defaults);
  return defaults;
}
