import type { Settings } from "../../types";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import {
  PROJECT_VERSION,
  projectFromJson,
  robotConfigOf,
  type ProjectDoc,
} from "../../io";
import { normalizeLegacyFieldMap } from "../../utils/settingsPersistence";

export const SESSION_RECOVERY_KEY = "pedro_session_recovery_v1";

export interface SessionSnapshot {
  project: ProjectDoc;
  settings: Settings;
  currentFilePath: string | null;
}

/** Stored with the project's fields at the top level, like a project file. */
export function saveSessionSnapshot(snapshot: SessionSnapshot): void {
  try {
    const { project, ...rest } = snapshot;
    localStorage.setItem(
      SESSION_RECOVERY_KEY,
      JSON.stringify({
        version: PROJECT_VERSION,
        ...project,
        ...rest,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error("Session snapshot save failed:", error);
  }
}

/** The recovery snapshot, or null when absent or unusable. */
export function loadSessionSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_RECOVERY_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const settings = normalizeLegacyFieldMap({
      ...DEFAULT_SETTINGS,
      ...(parsed?.settings || {}),
    });

    const primary = projectFromJson(parsed, robotConfigOf(settings));
    if (!primary.ok) return null;

    return {
      project: primary.doc,
      settings,
      currentFilePath: parsed.currentFilePath || null,
    };
  } catch (error) {
    console.error("Session restore failed:", error);
    return null;
  }
}
