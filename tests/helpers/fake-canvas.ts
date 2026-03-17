type Pixel = [number, number, number, number];

function createBlankPixels(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

function clonePixels(source: Uint8ClampedArray): Uint8ClampedArray {
  return new Uint8ClampedArray(source);
}

type FakeImageData = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export class FakeImageBitmap {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;

  constructor(width: number, height: number, pixels?: Uint8ClampedArray) {
    this.width = width;
    this.height = height;
    this.pixels = pixels ? clonePixels(pixels) : createBlankPixels(width, height);
  }
}

class FakeContext2D {
  constructor(private readonly canvas: FakeOffscreenCanvas) {}

  drawImage(image: FakeImageBitmap | FakeOffscreenCanvas, dx: number, dy: number): void {
    const sourcePixels = image instanceof FakeOffscreenCanvas ? image.pixels : image.pixels;
    const sourceWidth = image.width;
    const sourceHeight = image.height;

    for (let y = 0; y < sourceHeight; y += 1) {
      for (let x = 0; x < sourceWidth; x += 1) {
        const targetX = dx + x;
        const targetY = dy + y;
        if (
          targetX < 0 ||
          targetY < 0 ||
          targetX >= this.canvas.width ||
          targetY >= this.canvas.height
        ) {
          continue;
        }

        const sourceIndex = (y * sourceWidth + x) * 4;
        const targetIndex = (targetY * this.canvas.width + targetX) * 4;
        this.canvas.pixels[targetIndex] = sourcePixels[sourceIndex];
        this.canvas.pixels[targetIndex + 1] = sourcePixels[sourceIndex + 1];
        this.canvas.pixels[targetIndex + 2] = sourcePixels[sourceIndex + 2];
        this.canvas.pixels[targetIndex + 3] = sourcePixels[sourceIndex + 3];
      }
    }
  }

  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData {
    const data = new Uint8ClampedArray(sw * sh * 4);

    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const sourceX = sx + x;
        const sourceY = sy + y;
        const targetIndex = (y * sw + x) * 4;
        const sourceIndex = (sourceY * this.canvas.width + sourceX) * 4;
        data[targetIndex] = this.canvas.pixels[sourceIndex];
        data[targetIndex + 1] = this.canvas.pixels[sourceIndex + 1];
        data[targetIndex + 2] = this.canvas.pixels[sourceIndex + 2];
        data[targetIndex + 3] = this.canvas.pixels[sourceIndex + 3];
      }
    }

    return {
      data,
      width: sw,
      height: sh,
    } as FakeImageData as ImageData;
  }

  putImageData(imageData: ImageData, dx: number, dy: number): void {
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const sourceIndex = (y * imageData.width + x) * 4;
        const targetIndex = ((dy + y) * this.canvas.width + (dx + x)) * 4;
        this.canvas.pixels[targetIndex] = imageData.data[sourceIndex];
        this.canvas.pixels[targetIndex + 1] = imageData.data[sourceIndex + 1];
        this.canvas.pixels[targetIndex + 2] = imageData.data[sourceIndex + 2];
        this.canvas.pixels[targetIndex + 3] = imageData.data[sourceIndex + 3];
      }
    }
  }
}

export class FakeOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  private readonly context: FakeContext2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = createBlankPixels(width, height);
    this.context = new FakeContext2D(this);
  }

  getContext(_type: string): FakeContext2D {
    return this.context;
  }
}

export function installFakeOffscreenCanvas(): void {
  Object.assign(globalThis, {
    OffscreenCanvas: FakeOffscreenCanvas,
    ImageData: class {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    },
  });
}

export function createSolidBitmap(
  width: number,
  height: number,
  color: Pixel,
): FakeImageBitmap {
  const pixels = createBlankPixels(width, height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }

  return new FakeImageBitmap(width, height, pixels);
}

export function setPixel(
  target: FakeImageBitmap | FakeOffscreenCanvas,
  x: number,
  y: number,
  color: Pixel,
): void {
  const offset = (y * target.width + x) * 4;
  target.pixels[offset] = color[0];
  target.pixels[offset + 1] = color[1];
  target.pixels[offset + 2] = color[2];
  target.pixels[offset + 3] = color[3];
}

export function getPixel(
  target: FakeImageBitmap | FakeOffscreenCanvas,
  x: number,
  y: number,
): Pixel {
  const offset = (y * target.width + x) * 4;
  return [
    target.pixels[offset],
    target.pixels[offset + 1],
    target.pixels[offset + 2],
    target.pixels[offset + 3],
  ];
}
