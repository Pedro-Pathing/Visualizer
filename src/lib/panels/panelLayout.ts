import type { Settings } from "../../types";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import { clamp } from "../../utils/math";

export const CENTER_MIN_WIDTH = 300;
export const PANEL_DIVIDER_WIDTH = 18;

/** Window height not available to the field: top bar, padding and playback bar. */
const FIELD_VERTICAL_CHROME = 136;
/** The field panel's padding, plus room beside the field for the two tool rails. */
const FIELD_HORIZONTAL_CHROME = 16 + 2 * 56;

/** Minimum center width that keeps the field as tall as the window allows. */
export function getMinCenterWidthForSquare(): number {
  return Math.max(
    CENTER_MIN_WIDTH,
    window.innerHeight - FIELD_VERTICAL_CHROME + FIELD_HORIZONTAL_CHROME,
  );
}

export function getRightPanelMinWidth(settings: Settings | undefined): number {
  return Math.max(
    0,
    Number(
      settings?.rightPanelMinWidth ?? DEFAULT_SETTINGS.rightPanelMinWidth ?? 0,
    ) || 0,
  );
}

export function getLeftPanelMinWidth(settings: Settings | undefined): number {
  return Math.max(
    0,
    Number(
      settings?.leftPanelMinWidth ?? DEFAULT_SETTINGS.leftPanelMinWidth ?? 0,
    ) || 0,
  );
}

/** Minimum width configured for either sidebar. */
export function getPanelMinWidth(
  side: "left" | "right",
  settings: Settings | undefined,
): number {
  return side === "right"
    ? getRightPanelMinWidth(settings)
    : getLeftPanelMinWidth(settings);
}

export function getTotalAvailableWidth(): number {
  return window.innerWidth - 24 - PANEL_DIVIDER_WIDTH * 2;
}

export function clampPanelWidth(
  side: "left" | "right",
  desiredWidth: number,
  availableWidth: number,
  otherPanelWidth: number,
  settings: Settings | undefined,
): number {
  const minWidth = getPanelMinWidth(side, settings);
  const minCenterWidthForSquare = getMinCenterWidthForSquare();
  // Panel cannot push the center below minCenterWidthForSquare, but must be at
  // least minWidth; if those conflict the panel shrinks and the center grows.
  const maxPanelWidth =
    availableWidth -
    otherPanelWidth -
    minCenterWidthForSquare -
    PANEL_DIVIDER_WIDTH * 2;
  // No fixed upper bound: a panel may grow until it would squeeze the centre
  // stage below the width that keeps the field square.
  const effectiveMax = Math.max(minWidth, maxPanelWidth);
  return clamp(desiredWidth, minWidth, effectiveMax);
}
