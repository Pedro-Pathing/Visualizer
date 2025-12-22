import type { Point, Line, Shape, SequenceItem } from "../types";

/**
 * File save/load utilities for the visualizer
 */

export interface SaveData {
  startPoint: Point;
  lines: Line[];
  shapes?: Shape[];
  settings?: any;
  sequence?: SequenceItem[];
}

/**
 * Download trajectory data as a .pp file
 */
export async function downloadTrajectory(
  startPoint: Point,
  lines: Line[],
  shapes: Shape[],
  sequence?: SequenceItem[],
): Promise<string | null> {
  // Save trajectory into browser IndexedDB store (no download)
  const jsonString = JSON.stringify({ startPoint, lines, shapes, sequence });
  try {
    const mod = await import("./browserFileStore");
    const store = (mod as any).default;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `path-${timestamp}.pp`;
    const created = await store.create(name, jsonString);
    console.log("Saved trajectory to browser store:", created);
    return created.id;
  } catch (err) {
    console.error("Failed to save trajectory to store:", err);
    // Fallback to download if store fails
    try {
      const blob = new Blob([jsonString], { type: "application/json" });
      const linkObj = document.createElement("a");
      const url = URL.createObjectURL(blob);
      linkObj.href = url;
      linkObj.download = "trajectory.pp";
      document.body.appendChild(linkObj);
      linkObj.click();
      document.body.removeChild(linkObj);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Fallback download failed:", e);
    }
    return null;
  }
}

/**
 * Load trajectory from a file input event
 */
export function loadTrajectoryFromFile(
  evt: Event,
  onSuccess: (data: SaveData) => void,
  onError?: (error: Error) => void,
): void {
  const elem = evt.target as HTMLInputElement;
  const file = elem.files?.[0];

  if (!file) return;

  // Check file extension
  if (!file.name.toLowerCase().endsWith(".pp")) {
    const error = new Error("Please select a .pp file");
    if (onError) onError(error);
    alert(error.message);
    return;
  }

  if (file) {
    const reader = new FileReader();

    reader.onload = function (e: ProgressEvent<FileReader>) {
      try {
        const result = e.target?.result as string;
        const jsonObj = JSON.parse(result) as SaveData;
        onSuccess(jsonObj);
      } catch (err) {
        console.error(err);
        if (onError) onError(err as Error);
      }
    };

    reader.readAsText(file);
  }
}

/**
 * Update the robot image displayed on the canvas
 */
export function updateRobotImageDisplay(): void {
  const robotImage = document.querySelector(
    'img[alt="Robot"]',
  ) as HTMLImageElement;
  const storedImage = localStorage.getItem("robot.png");
  if (robotImage && storedImage) {
    robotImage.src = storedImage;
  }
}

/**
 * Convert image file to base64 string
 */
export function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert image to base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Load robot image from a file input event
 */
export async function loadRobotImage(
  file: File,
  onSuccess?: (imageData: string) => void,
  onError?: (error: Error) => void,
): Promise<string | null> {
  try {
    // Check file type
    if (!file.type.match(/^image\/(png|jpeg|jpg|gif)$/)) {
      throw new Error("Please upload a PNG, JPEG, or GIF image.");
    }

    // Convert to base64
    const base64Data = await imageToBase64(file);

    // Compress if needed (optional)
    const compressedData = await compressImage(base64Data, 100, 100); // Max 100x100

    if (onSuccess) {
      onSuccess(compressedData);
    }

    return compressedData;
  } catch (error) {
    console.error("Error loading robot image:", error);
    if (onError) {
      onError(error as Error);
    }
    return null;
  }
}

/**
 * Compress image data
 */
async function compressImage(
  base64Data: string,
  maxWidth: number,
  maxHeight: number,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png", 0.8)); // 80% quality
      } else {
        resolve(base64Data);
      }
    };
    img.src = base64Data;
  });
}
