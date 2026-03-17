type DrawableSurface = ImageBitmap | OffscreenCanvas;

type Minimal2DContext = {
  drawImage: (image: DrawableSurface, dx: number, dy: number) => void;
  getImageData: (sx: number, sy: number, sw: number, sh: number) => ImageData;
};

function get2dContext(canvas: OffscreenCanvas): Minimal2DContext {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context is unavailable');
  }

  return context as Minimal2DContext;
}

function createOffscreenCanvas(width: number, height: number): OffscreenCanvas {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('OffscreenCanvas is unavailable');
  }

  return new OffscreenCanvas(width, height);
}

function toCanvas(source: DrawableSurface): OffscreenCanvas {
  if (typeof (source as OffscreenCanvas).getContext === 'function') {
    return source as OffscreenCanvas;
  }

  const canvas = createOffscreenCanvas(source.width, source.height);
  get2dContext(canvas).drawImage(source, 0, 0);
  return canvas;
}

function findOverlap(
  currentCanvas: OffscreenCanvas,
  nextSegment: DrawableSurface,
  overlapPx: number,
): number {
  const nextCanvas = toCanvas(nextSegment);
  const maxOverlap = Math.min(overlapPx, currentCanvas.height, nextSegment.height);
  for (let candidate = maxOverlap; candidate > 0; candidate -= 1) {
    let matched = true;
    for (let rowOffset = 0; rowOffset < candidate; rowOffset += 1) {
      const currentHash = computeRowHash(
        currentCanvas,
        currentCanvas.height - candidate + rowOffset,
      );
      const nextHash = computeRowHash(nextCanvas, rowOffset);
      if (currentHash !== nextHash) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return candidate;
    }
  }

  return 0;
}

export function stitchSegments(
  segments: ImageBitmap[],
  stepPx: number,
  overlapPx: number,
  lightMode: boolean,
): OffscreenCanvas {
  if (segments.length === 0) {
    throw new Error('At least one segment is required');
  }

  if (segments.length === 1) {
    const output = createOffscreenCanvas(segments[0].width, segments[0].height);
    get2dContext(output).drawImage(segments[0], 0, 0);
    return output;
  }

  let composite = createOffscreenCanvas(segments[0].width, segments[0].height);
  get2dContext(composite).drawImage(segments[0], 0, 0);

  for (let index = 1; index < segments.length; index += 1) {
    const nextSegment = segments[index];
    const overlap = lightMode ? 0 : findOverlap(composite, nextSegment, overlapPx);
    const drawY = lightMode ? stepPx * index : composite.height - overlap;
    const nextHeight = Math.max(composite.height, drawY + nextSegment.height);
    const nextCanvas = createOffscreenCanvas(composite.width, nextHeight);
    const nextContext = get2dContext(nextCanvas);

    nextContext.drawImage(composite, 0, 0);
    nextContext.drawImage(nextSegment, 0, drawY);

    composite = nextCanvas;
  }

  return composite;
}

export function computeRowHash(canvas: OffscreenCanvas, y: number): number {
  const context = get2dContext(canvas);
  const row = context.getImageData(0, y, canvas.width, 1);
  let hash = 0;

  for (const byte of row.data) {
    hash ^= byte;
  }

  return hash;
}
