import { vi } from 'vitest';

type Pixel = [number, number, number, number];

export type TestImage = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

function createBlankPixels(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

export function createSolidTestImage(
  width: number,
  height: number,
  color: Pixel,
): TestImage {
  const pixels = createBlankPixels(width, height);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }

  return {
    width,
    height,
    pixels,
  };
}

export function setImagePixel(
  image: TestImage,
  x: number,
  y: number,
  color: Pixel,
): void {
  const offset = (y * image.width + x) * 4;
  image.pixels[offset] = color[0];
  image.pixels[offset + 1] = color[1];
  image.pixels[offset + 2] = color[2];
  image.pixels[offset + 3] = color[3];
}

class MockCanvasContext2D {
  fillStyle = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  font = '10px sans-serif';
  pixels = createBlankPixels(1, 1);
  readonly drawImage = vi.fn((image: TestImage, dx: number, dy: number) => {
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const sourceIndex = (y * image.width + x) * 4;
        const targetIndex = ((dy + y) * this.canvas.width + (dx + x)) * 4;
        this.pixels[targetIndex] = image.pixels[sourceIndex];
        this.pixels[targetIndex + 1] = image.pixels[sourceIndex + 1];
        this.pixels[targetIndex + 2] = image.pixels[sourceIndex + 2];
        this.pixels[targetIndex + 3] = image.pixels[sourceIndex + 3];
      }
    }
  });

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.resize();
  }

  resize(): void {
    const nextPixels = createBlankPixels(Math.max(this.canvas.width, 1), Math.max(this.canvas.height, 1));
    nextPixels.set(this.pixels.subarray(0, Math.min(this.pixels.length, nextPixels.length)));
    this.pixels = nextPixels;
  }

  clearRect(): void {
    this.pixels.fill(0);
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    const color = this.parseFillStyle();

    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.canvas.height, Math.ceil(y + height)); py += 1) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.canvas.width, Math.ceil(x + width)); px += 1) {
        const offset = (py * this.canvas.width + px) * 4;
        this.pixels[offset] = color[0];
        this.pixels[offset + 1] = color[1];
        this.pixels[offset + 2] = color[2];
        this.pixels[offset + 3] = color[3];
      }
    }
  }

  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData {
    const data = new Uint8ClampedArray(sw * sh * 4);

    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const sourceIndex = ((sy + y) * this.canvas.width + (sx + x)) * 4;
        const targetIndex = (y * sw + x) * 4;
        data[targetIndex] = this.pixels[sourceIndex];
        data[targetIndex + 1] = this.pixels[sourceIndex + 1];
        data[targetIndex + 2] = this.pixels[sourceIndex + 2];
        data[targetIndex + 3] = this.pixels[sourceIndex + 3];
      }
    }

    return new ImageData(data, sw, sh);
  }

  putImageData(imageData: ImageData, dx: number, dy: number): void {
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const sourceIndex = (y * imageData.width + x) * 4;
        const targetIndex = ((dy + y) * this.canvas.width + (dx + x)) * 4;
        this.pixels[targetIndex] = imageData.data[sourceIndex];
        this.pixels[targetIndex + 1] = imageData.data[sourceIndex + 1];
        this.pixels[targetIndex + 2] = imageData.data[sourceIndex + 2];
        this.pixels[targetIndex + 3] = imageData.data[sourceIndex + 3];
      }
    }
  }

  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
  fillText(): void {}
  save(): void {}
  restore(): void {}

  getPixel(x: number, y: number): Pixel {
    const offset = (y * this.canvas.width + x) * 4;
    return [
      this.pixels[offset],
      this.pixels[offset + 1],
      this.pixels[offset + 2],
      this.pixels[offset + 3],
    ];
  }

  private parseFillStyle(): Pixel {
    if (typeof this.fillStyle === 'string' && this.fillStyle.startsWith('rgba(')) {
      const [red, green, blue, alpha] = this.fillStyle
        .slice(5, -1)
        .split(',')
        .map((value) => value.trim());
      return [
        Number(red),
        Number(green),
        Number(blue),
        Math.round(Number(alpha) * 255),
      ];
    }

    return [0, 0, 0, 255];
  }
}

const contexts = new WeakMap<HTMLCanvasElement, MockCanvasContext2D>();

function getContextForCanvas(canvas: HTMLCanvasElement): MockCanvasContext2D {
  const existing = contexts.get(canvas);
  if (existing) {
    return existing;
  }

  const context = new MockCanvasContext2D(canvas);
  contexts.set(canvas, context);
  return context;
}

export function installCanvasMocks() {
  const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
  const previousImageData = globalThis.ImageData;

  class MockImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }

  vi.stubGlobal('ImageData', MockImageData);

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return getContextForCanvas(this) as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLCanvasElement) {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height,
      toJSON: () => '',
    } as DOMRect;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    return `data:image/png;base64,canvas-${this.width}x${this.height}`;
  });

  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true,
    get(this: HTMLCanvasElement) {
      return Number(this.getAttribute('width') ?? '300');
    },
    set(this: HTMLCanvasElement, value: number) {
      this.setAttribute('width', String(value));
      getContextForCanvas(this).resize();
    },
  });

  Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
    configurable: true,
    get(this: HTMLCanvasElement) {
      return Number(this.getAttribute('height') ?? '150');
    },
    set(this: HTMLCanvasElement, value: number) {
      this.setAttribute('height', String(value));
      getContextForCanvas(this).resize();
    },
  });

  return () => {
    vi.restoreAllMocks();

    if (widthDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'width', widthDescriptor);
    }

    if (heightDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'height', heightDescriptor);
    }

    if (previousImageData) {
      Object.assign(globalThis, { ImageData: previousImageData });
      return;
    }

    Reflect.deleteProperty(globalThis, 'ImageData');
  };
}

export function getCanvasContext(canvas: HTMLCanvasElement) {
  return getContextForCanvas(canvas);
}
