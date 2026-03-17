import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/encode', () => ({
  encodePng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  encodeJpegAtQuality: vi.fn(async () => new Blob(['jpeg-quality'], { type: 'image/jpeg' })),
  encodeJpegTargetSize: vi.fn(async () => new Blob(['jpeg-target'], { type: 'image/jpeg' })),
}));

vi.mock('../../src/shared/pdf', () => ({
  buildPdf: vi.fn(async (pages: Blob[]) => new Uint8Array([37, 80, 68, 70, pages.length])),
}));

vi.mock('../../src/offscreen/ml-redaction', () => ({
  runMlRedaction: vi.fn(async () => ({
    annotations: [
      {
        id: 'ml-1',
        type: 'face',
        rect: { x: 10, y: 20, w: 30, h: 40 },
        confidence: 0.9,
        source: 'ml',
        userReviewed: false,
      },
    ],
  })),
}));

import { encodeJpegAtQuality, encodeJpegTargetSize, encodePng } from '../../src/shared/encode';
import { buildPdf } from '../../src/shared/pdf';
import { runMlRedaction } from '../../src/offscreen/ml-redaction';
import { processHeavyWorkerMessage } from '../../src/offscreen/processor';

class OffscreenCanvasMock {
  width: number;
  height: number;
  context: {
    drawImage: ReturnType<typeof vi.fn>;
  };

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.context = {
      drawImage: vi.fn(),
    };
  }

  getContext() {
    return this.context;
  }
}

describe('processHeavyWorkerMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 200 })));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      blob: async () => {
        if (url.startsWith('data:image/png')) {
          return new Blob(['img'], { type: 'image/png' });
        }

        if (url.startsWith('data:image/jpeg')) {
          return new Blob(['img'], { type: 'image/jpeg' });
        }

        return new Blob(['raw'], { type: 'application/octet-stream' });
      },
    })));
    vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'));
  });

  it('encodes png exports through encodePng', async () => {
    const result = await processHeavyWorkerMessage(
      {
        id: '1',
        type: 'OFFSCREEN_ENCODE',
        dataUrl: 'data:image/png;base64,AAAA',
        spec: {
          format: 'png',
          dimensions: { mode: 'preset', presetId: 'original' },
          dpiPolicy: 'device',
          filenameTemplate: 'snapvault-{format}',
        },
        metadata: {
          cssWidth: 400,
          cssHeight: 200,
          devicePixelRatio: 1,
          screenLeft: 0,
          screenTop: 0,
          lightMode: false,
          capturedAt: 0,
        },
        licenseState: { status: 'free' },
      },
      { remember: () => undefined, clear: () => undefined },
    );

    expect(encodePng).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  it('routes jpeg quality exports through the quality encoder', async () => {
    await processHeavyWorkerMessage(
      {
        id: '2',
        type: 'OFFSCREEN_ENCODE',
        dataUrl: 'data:image/png;base64,AAAA',
        spec: {
          format: 'jpeg',
          dimensions: { mode: 'preset', presetId: 'original' },
          dpiPolicy: 'device',
          filenameTemplate: 'snapvault-{format}',
          jpeg: {
            mode: 'quality',
            quality: 85,
          },
        },
        metadata: {
          cssWidth: 400,
          cssHeight: 200,
          devicePixelRatio: 1,
          screenLeft: 0,
          screenTop: 0,
          lightMode: false,
          capturedAt: 0,
        },
        licenseState: { status: 'pro' },
      },
      { remember: () => undefined, clear: () => undefined },
    );

    expect(encodeJpegAtQuality).toHaveBeenCalledTimes(1);
    expect(encodeJpegTargetSize).not.toHaveBeenCalled();
  });

  it('returns a structured error when css1x normalization is blocked for the free tier', async () => {
    const result = await processHeavyWorkerMessage(
      {
        id: '3',
        type: 'OFFSCREEN_ENCODE',
        dataUrl: 'data:image/png;base64,AAAA',
        spec: {
          format: 'png',
          dimensions: { mode: 'preset', presetId: 'original' },
          dpiPolicy: 'css1x',
          filenameTemplate: 'snapvault-{format}',
        },
        metadata: {
          cssWidth: 400,
          cssHeight: 200,
          devicePixelRatio: 2,
          screenLeft: 0,
          screenTop: 0,
          lightMode: false,
          capturedAt: 0,
        },
        licenseState: { status: 'free' },
      },
      { remember: () => undefined, clear: () => undefined },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'HiDPI normalization requires Pro',
      }),
    );
    expect(encodePng).not.toHaveBeenCalled();
  });

  it('allows css1x normalization for pro tier captures', async () => {
    const result = await processHeavyWorkerMessage(
      {
        id: '4',
        type: 'OFFSCREEN_ENCODE',
        dataUrl: 'data:image/png;base64,AAAA',
        spec: {
          format: 'png',
          dimensions: { mode: 'preset', presetId: 'original' },
          dpiPolicy: 'css1x',
          filenameTemplate: 'snapvault-{format}',
        },
        metadata: {
          cssWidth: 400,
          cssHeight: 200,
          devicePixelRatio: 2,
          screenLeft: 0,
          screenTop: 0,
          lightMode: false,
          capturedAt: 0,
        },
        licenseState: { status: 'pro' },
      },
      { remember: () => undefined, clear: () => undefined },
    );

    expect(result.ok).toBe(true);
    expect(encodePng).toHaveBeenCalledTimes(1);
  });

  it('routes jpeg target-size exports through the target-size encoder', async () => {
    await processHeavyWorkerMessage(
      {
        id: '5',
        type: 'OFFSCREEN_ENCODE',
        dataUrl: 'data:image/png;base64,AAAA',
        spec: {
          format: 'jpeg',
          dimensions: { mode: 'preset', presetId: 'original' },
          dpiPolicy: 'device',
          filenameTemplate: 'snapvault-{format}',
          jpeg: {
            mode: 'targetSize',
            targetBytes: 1200,
            toleranceBytes: 100,
          },
        },
        metadata: {
          cssWidth: 400,
          cssHeight: 200,
          devicePixelRatio: 1,
          screenLeft: 0,
          screenTop: 0,
          lightMode: false,
          capturedAt: 0,
        },
        licenseState: { status: 'pro' },
      },
      { remember: () => undefined, clear: () => undefined },
    );

    expect(encodeJpegTargetSize).toHaveBeenCalledTimes(1);
    expect(encodeJpegAtQuality).not.toHaveBeenCalled();
  });

  it('scales crop rectangles from css pixels to bitmap pixels on HiDPI captures', async () => {
    const canvases: OffscreenCanvasMock[] = [];
    const bitmap = { width: 800, height: 400 };
    vi.stubGlobal('OffscreenCanvas', class extends OffscreenCanvasMock {
      constructor(width: number, height: number) {
        super(width, height);
        canvases.push(this);
      }
    });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));

    const result = await processHeavyWorkerMessage(
      {
        id: '5b',
        type: 'OFFSCREEN_ENCODE',
        dataUrl: 'data:image/png;base64,AAAA',
        rect: {
          x: 10,
          y: 20,
          width: 200,
          height: 100,
        },
        metadata: {
          cssWidth: 400,
          cssHeight: 200,
          devicePixelRatio: 2,
          screenLeft: 0,
          screenTop: 0,
          lightMode: false,
          capturedAt: 0,
        },
      },
      { remember: () => undefined, clear: () => undefined },
    );

    expect(result.ok).toBe(true);
    expect(canvases.at(-1)?.width).toBe(400);
    expect(canvases.at(-1)?.height).toBe(200);
    expect(canvases.at(-1)?.context.drawImage).toHaveBeenCalledWith(
      bitmap,
      20,
      40,
      400,
      200,
      0,
      0,
      400,
      200,
    );
  });

  it('builds pdf artifacts from multiple pages', async () => {
    const result = await processHeavyWorkerMessage(
      {
        id: '6',
        type: 'OFFSCREEN_BUILD_PDF',
        pages: ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'],
        spec: {
          format: 'pdf',
          dimensions: { mode: 'preset', presetId: 'a4' },
          dpiPolicy: 'device',
          filenameTemplate: 'snapvault-{format}',
        },
      },
      { remember: () => undefined, clear: () => undefined },
    );

    expect(buildPdf).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          mimeType: 'application/pdf',
        }),
      }),
    );
  });

  it('routes ml redaction requests through the ml helper', async () => {
    const result = await processHeavyWorkerMessage(
      {
        id: '7',
        type: 'OFFSCREEN_RUN_ML_REDACTION',
        dataUrl: 'data:image/png;base64,AAAA',
      },
      { remember: () => undefined, clear: () => undefined },
    );

    expect(runMlRedaction).toHaveBeenCalledWith('data:image/png;base64,AAAA');
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          annotations: expect.any(Array),
        }),
      }),
    );
  });
});
