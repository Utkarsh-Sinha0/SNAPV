export async function encodePng(canvas: OffscreenCanvas): Promise<Blob> {
  return canvas.convertToBlob({ type: 'image/png' });
}

export async function encodeJpegAtQuality(
  canvas: OffscreenCanvas,
  quality: number,
): Promise<Blob> {
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}

export async function encodeJpegTargetSize(
  canvas: OffscreenCanvas,
  targetBytes: number,
  toleranceBytes: number,
): Promise<Blob> {
  let quality = 0.95;
  let bestBlob = await encodeJpegAtQuality(canvas, quality);

  while (bestBlob.size > targetBytes + toleranceBytes && quality >= 0.1) {
    quality = Number((quality - 0.05).toFixed(2));
    const nextBlob = await encodeJpegAtQuality(canvas, quality);
    if (nextBlob.size <= bestBlob.size) {
      bestBlob = nextBlob;
    }
  }

  return bestBlob;
}
