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

type SecondSlot = Pick<
  ProjectDoc,
  "startPoint" | "lines" | "sequence" | "shapes"
>;

export interface SessionSnapshot {
  project: ProjectDoc;
  settings: Settings;
  currentFilePath: string | null;
  secondFilePath: string | null;
  second: SecondSlot | null;
}

/** Stored with the project's fields at the top level, like a project file. */
export function saveSessionSnapshot(snapshot: SessionSnapshot): void {
  try {
    const { project, second, ...rest } = snapshot;
    localStorage.setItem(
      SESSION_RECOVERY_KEY,
      JSON.stringify({
        version: PROJECT_VERSION,
        ...project,
        ...rest,
        secondStartPoint: second?.startPoint ?? null,
        secondLines: second?.lines ?? [],
        secondSequence: second?.sequence ?? [],
        secondShapes: second?.shapes ?? [],
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
    const robot = robotConfigOf(settings);

    const primary = projectFromJson(parsed, robot);
    if (!primary.ok) return null;

    const second = parsed.secondStartPoint
      ? projectFromJson(
          {
            startPoint: parsed.secondStartPoint,
            lines: parsed.secondLines ?? [],
            sequence: parsed.secondSequence,
            shapes: parsed.secondShapes,
          },
          robot,
        )
      : null;

    return {
      project: primary.doc,
      settings,
      currentFilePath: parsed.currentFilePath || null,
      secondFilePath: parsed.secondFilePath || null,
      second: second?.ok ? second.doc : null,
    };
  } catch (error) {
    console.error("Session restore failed:", error);
    return null;
  }
}
