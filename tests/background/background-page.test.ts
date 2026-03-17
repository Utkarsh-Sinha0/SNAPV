import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/encode', () => ({
  encodePng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  encodeJpegAtQuality: vi.fn(async () => new Blob(['jpeg-quality'], { type: 'image/jpeg' })),
  encodeJpegTargetSize: vi.fn(async () => new Blob(['jpeg-target'], { type: 'image/jpeg' })),
}));

import { encodePng } from '../../src/shared/encode';
import {
  __resetBackgroundPageListenerForTests,
  registerBackgroundPageMessageListener,
} from '../../src/background/background-page';

class OffscreenCanvasMock {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      drawImage: () => undefined,
    };
  }
}

describe('background-page listener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetBackgroundPageListenerForTests();
    vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 200 })));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: async () => new Blob(['img'], { type: 'image/png' }),
    })));
    vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'));
  });

  it('handles OFFSCREEN_ENCODE requests through the firefox background-page path', async () => {
    const listeners: Array<
      (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void,
      ) => boolean | void
    > = [];
    const runtime = {
      onMessage: {
        addListener: (
          callback: (
            message: unknown,
            sender: unknown,
            sendResponse: (response?: unknown) => void,
          ) => boolean | void,
        ) => {
          listeners.push(callback);
        },
      },
    };

    registerBackgroundPageMessageListener(runtime);

    const response = await new Promise<unknown>((resolve) => {
      listeners[0](
        {
          id: 'encode-firefox-1',
          type: 'OFFSCREEN_ENCODE',
          _target: 'background-heavy',
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
        {},
        resolve,
      );
    });

    expect(encodePng).toHaveBeenCalledTimes(1);
    expect(response).toEqual(
      expect.objectContaining({
        type: 'OFFSCREEN_RESULT',
        id: 'encode-firefox-1',
        ok: true,
        data: expect.objectContaining({
          mimeType: 'image/png',
        }),
      }),
    );
  });
});
