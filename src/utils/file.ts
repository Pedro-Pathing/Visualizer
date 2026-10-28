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
