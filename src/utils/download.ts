export function downloadBlob(blob: Blob, filename: string): void {
  const legacyNavigator = navigator as Navigator & {
    msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean;
  };
  if (legacyNavigator.msSaveOrOpenBlob) {
    legacyNavigator.msSaveOrOpenBlob(blob, filename);
    return;
  }

  if (!URL.createObjectURL) {
    const reader = new FileReader();
    reader.onload = () => {
      const link = document.createElement("a");
      link.href = String(reader.result);
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
    reader.readAsDataURL(blob);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some Firefox-based browsers resolve the blob URL after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(content: string, filename: string): void {
  downloadBlob(new Blob([content], { type: "application/json" }), filename);
}
