import { derivePaletteFromRgba, type DerivedPalette } from "../shared/palette-core";

const SAMPLE_SIZE = 64;

function fittedSize(width: number, height: number): { width: number; height: number; x: number; y: number } {
  const scale = Math.min(SAMPLE_SIZE / width, SAMPLE_SIZE / height);
  const fittedWidth = Math.max(1, Math.round(width * scale));
  const fittedHeight = Math.max(1, Math.round(height * scale));
  return {
    width: fittedWidth,
    height: fittedHeight,
    x: Math.floor((SAMPLE_SIZE - fittedWidth) / 2),
    y: Math.floor((SAMPLE_SIZE - fittedHeight) / 2)
  };
}

export async function extractPalette(bytes: ArrayBuffer, mime: string): Promise<DerivedPalette> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  const fitted = fittedSize(bitmap.width, bitmap.height);
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas 2D is unavailable");
      context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      context.drawImage(bitmap, fitted.x, fitted.y, fitted.width, fitted.height);
      return derivePaletteFromRgba(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
    }

    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is unavailable");
    context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    context.drawImage(bitmap, fitted.x, fitted.y, fitted.width, fitted.height);
    return derivePaletteFromRgba(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
  } finally {
    bitmap.close();
  }
}
