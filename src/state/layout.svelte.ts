import type { Settings } from "../types";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Prefs } from "./prefs.svelte";
import {
  clampPanelWidth,
  getLeftPanelMinWidth,
  getMinCenterWidthForSquare,
  getRightPanelMinWidth,
  getTotalAvailableWidth,
} from "../lib/panels/panelLayout";
import { clamp } from "../utils/math";

type Side = "left" | "right";

/** The two side panels around the field: their widths, visibility and resizing. */
export class PanelLayout {
  leftWidth = $state(DEFAULT_SETTINGS.leftPanelWidth ?? 280);
  rightWidth = $state(DEFAULT_SETTINGS.rightPanelWidth ?? 360);
  leftHidden = $state(false);
  rightHidden = $state(false);

  #prefs: Prefs;
  #resize: { side: Side; startX: number; startWidth: number } | null = null;

  /** Widths are saved into `prefs`. */
  constructor(prefs: Prefs) {
    this.#prefs = prefs;
    // Only ever shrink a panel that no longer fits. Growing one back toward its
    // saved width would let it reclaim space the other panel was dragged into.
    $effect(() => {
      const settings = prefs.value;
      const available = getTotalAvailableWidth() - getMinCenterWidthForSquare();
      const rightMin = getRightPanelMinWidth(settings);
      const leftMin = getLeftPanelMinWidth(settings);
      if (!this.leftHidden) {
        const right = this.rightHidden
          ? 0
          : Math.max(this.rightWidth, rightMin);
        const next = clamp(
          this.leftWidth,
          leftMin,
          Math.max(leftMin, available - right),
        );
        if (next !== this.leftWidth) this.leftWidth = next;
      }
      if (!this.rightHidden) {
        const left = this.leftHidden ? 0 : this.leftWidth;
        const next = clamp(
          this.rightWidth,
          rightMin,
          Math.max(rightMin, available - left),
        );
        if (next !== this.rightWidth) this.rightWidth = next;
      }
    });
    const onResize = () => this.clampToWindow();
    $effect(() => {
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    });
  }

  /** Apply the widths saved in preferences, then fit them to the window. */
  restore(settings: Settings) {
    this.leftWidth = Number(settings.leftPanelWidth ?? this.leftWidth);
    this.rightWidth = Number(settings.rightPanelWidth ?? this.rightWidth);
    this.clampToWindow();
  }

  toggle(side: Side) {
    if (side === "left") this.leftHidden = !this.leftHidden;
    else this.rightHidden = !this.rightHidden;
  }

  show(side: Side) {
    if (side === "left") this.leftHidden = false;
    else this.rightHidden = false;
  }

  beginResize(side: Side, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.#resize = {
      side,
      startX: event.clientX,
      startWidth: side === "left" ? this.leftWidth : this.rightWidth,
    };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }

  moveResize(event: MouseEvent) {
    const resize = this.#resize;
    if (!resize) return;
    const delta = event.clientX - resize.startX;
    if (resize.side === "left") {
      this.leftHidden = false;
      this.leftWidth = this.#clamp("left", resize.startWidth + delta);
      this.#prefs.value.leftPanelWidth = this.leftWidth;
    } else {
      this.rightHidden = false;
      this.rightWidth = this.#clamp("right", resize.startWidth - delta);
      this.#prefs.value.rightPanelWidth = this.rightWidth;
    }
  }

  endResize() {
    this.#resize = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  clampToWindow() {
    this.leftWidth = this.#clamp("left", this.leftWidth);
    this.rightWidth = this.#clamp("right", this.rightWidth);
    this.#prefs.value.leftPanelWidth = this.leftWidth;
    this.#prefs.value.rightPanelWidth = this.rightWidth;
  }

  #clamp(side: Side, width: number): number {
    const settings = this.#prefs.value;
    const otherHidden = side === "left" ? this.rightHidden : this.leftHidden;
    const otherWidth = side === "left" ? this.rightWidth : this.leftWidth;
    const otherMin =
      side === "left"
        ? getRightPanelMinWidth(settings)
        : getLeftPanelMinWidth(settings);
    return clampPanelWidth(
      side,
      width,
      Math.max(0, window.innerWidth - 24),
      otherHidden ? 0 : Math.max(otherWidth, otherMin),
      settings,
    );
  }
}
