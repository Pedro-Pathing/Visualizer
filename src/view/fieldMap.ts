import type { Settings } from "../types";

const FALLBACK_FIELD_MAP = "/fields/decode.webp";

export function fieldMapSource(settings: Settings): string {
  if (settings.fieldMap === "custom") {
    return settings.customFieldImage || FALLBACK_FIELD_MAP;
  }
  return settings.fieldMap
    ? `/fields/${settings.fieldMap}`
    : FALLBACK_FIELD_MAP;
}
