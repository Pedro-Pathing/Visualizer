import type { Settings } from "../types";
import { FIELD_SCHEME_IMAGES, type ColorScheme } from "../config/defaults";

const FALLBACK_FIELD_MAP = "/fields/decode.webp";

/** The field image to draw, using the variant for `scheme` when the field has one. */
export function fieldMapSource(
  settings: Settings,
  scheme: ColorScheme,
): string {
  if (settings.fieldMap === "custom") {
    return settings.customFieldImage || FALLBACK_FIELD_MAP;
  }
  if (!settings.fieldMap) return FALLBACK_FIELD_MAP;
  const file =
    FIELD_SCHEME_IMAGES[settings.fieldMap]?.[scheme] ?? settings.fieldMap;
  return `/fields/${file}`;
}
