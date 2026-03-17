export type BackgroundMode = 'transparent' | 'remove-shadow' | 'solid';

function getContext(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context is unavailable');
  }

  return context;
}

function parseColor(fillColor: string): [number, number, number] {
  const normalized = fillColor.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((value) => `${value}${value}`)
          .join('')
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Unsupported fill color: ${fillColor}`);
  }

  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

export function applyBackgroundMode(
  canvas: OffscreenCanvas,
  mode: BackgroundMode,
  fillColor = '#ffffff',
): OffscreenCanvas {
  const context = getContext(canvas);

  if (mode === 'transparent') {
    return canvas;
  }

  const snapshot = context.getImageData(0, 0, canvas.width, canvas.height);

  if (mode === 'solid') {
    const [fillRed, fillGreen, fillBlue] = parseColor(fillColor);
    const output = new Uint8ClampedArray(snapshot.data);

    for (let index = 0; index < output.length; index += 4) {
      const alpha = output[index + 3] / 255;
      output[index] = Math.round(output[index] * alpha + fillRed * (1 - alpha));
      output[index + 1] = Math.round(
        output[index + 1] * alpha + fillGreen * (1 - alpha),
      );
      output[index + 2] = Math.round(output[index + 2] * alpha + fillBlue * (1 - alpha));
      output[index + 3] = 255;
    }

    context.putImageData(new ImageData(output, snapshot.width, snapshot.height), 0, 0);
    return canvas;
  }

  if ('filter' in context) {
    context.filter = 'drop-shadow(0 0 0 transparent)';
  }
  context.putImageData(snapshot, 0, 0);
  return canvas;
}
