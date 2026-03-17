import type { RedactAnnotation } from './types';

type MutableImageData = ImageData & { data: Uint8ClampedArray };

function getContext(canvas: OffscreenCanvas) {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context is unavailable');
  }

  return context;
}

function blurRegion(
  source: MutableImageData,
  rect: { x: number; y: number; w: number; h: number },
): MutableImageData {
  const output = {
    data: new Uint8ClampedArray(source.data),
    width: source.width,
    height: source.height,
  } as MutableImageData;

  const minX = Math.max(0, Math.floor(rect.x));
  const minY = Math.max(0, Math.floor(rect.y));
  const maxX = Math.min(source.width, Math.ceil(rect.x + rect.w));
  const maxY = Math.min(source.height, Math.ceil(rect.y + rect.h));

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let samples = 0;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = Math.min(source.width - 1, Math.max(0, x + offsetX));
          const sampleY = Math.min(source.height - 1, Math.max(0, y + offsetY));
          const sourceIndex = (sampleY * source.width + sampleX) * 4;
          red += source.data[sourceIndex];
          green += source.data[sourceIndex + 1];
          blue += source.data[sourceIndex + 2];
          alpha += source.data[sourceIndex + 3];
          samples += 1;
        }
      }

      const outputIndex = (y * source.width + x) * 4;
      output.data[outputIndex] = Math.round(red / samples);
      output.data[outputIndex + 1] = Math.round(green / samples);
      output.data[outputIndex + 2] = Math.round(blue / samples);
      output.data[outputIndex + 3] = Math.round(alpha / samples);
    }
  }

  return output;
}

export function applyRedactAnnotations(
  canvas: OffscreenCanvas,
  annotations: RedactAnnotation[],
): OffscreenCanvas {
  const context = getContext(canvas);
  let workingImage = context.getImageData(0, 0, canvas.width, canvas.height) as MutableImageData;

  for (const annotation of annotations) {
    if (!annotation.userReviewed) {
      continue;
    }

    workingImage = blurRegion(workingImage, annotation.rect);
  }

  context.putImageData(workingImage, 0, 0);
  return canvas;
}
