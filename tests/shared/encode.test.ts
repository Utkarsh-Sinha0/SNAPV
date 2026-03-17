import { describe, expect, it, vi } from 'vitest';

import {
  encodeJpegAtQuality,
  encodeJpegTargetSize,
  encodePng,
} from '../../src/shared/encode';

describe('encode helpers', () => {
  it('encodes png using convertToBlob', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const convertToBlob = vi.fn().mockResolvedValue(blob);
    const canvas = { convertToBlob } as unknown as OffscreenCanvas;

    const result = await encodePng(canvas);

    expect(result).toBe(blob);
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/png' });
  });

  it('encodes jpeg at a specific quality', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const convertToBlob = vi.fn().mockResolvedValue(blob);
    const canvas = { convertToBlob } as unknown as OffscreenCanvas;

    await encodeJpegAtQuality(canvas, 0.8);

    expect(convertToBlob).toHaveBeenCalledWith({
      type: 'image/jpeg',
      quality: 0.8,
    });
  });

  it('steps down quality until the target size is met', async () => {
    const outputs = [
      new Blob([new Uint8Array(500_000)], { type: 'image/jpeg' }),
      new Blob([new Uint8Array(400_000)], { type: 'image/jpeg' }),
      new Blob([new Uint8Array(200_000)], { type: 'image/jpeg' }),
    ];
    const convertToBlob = vi
      .fn()
      .mockResolvedValueOnce(outputs[0])
      .mockResolvedValueOnce(outputs[1])
      .mockResolvedValue(outputs[2]);
    const canvas = { convertToBlob } as unknown as OffscreenCanvas;

    const result = await encodeJpegTargetSize(canvas, 250_000, 0);

    expect(result).toBe(outputs[2]);
    expect(convertToBlob).toHaveBeenNthCalledWith(1, {
      type: 'image/jpeg',
      quality: 0.95,
    });
    expect(convertToBlob).toHaveBeenNthCalledWith(3, {
      type: 'image/jpeg',
      quality: 0.85,
    });
  });

  it('returns the smallest blob even when the target is not met', async () => {
    const outputs = [
      new Blob([new Uint8Array(500_000)], { type: 'image/jpeg' }),
      new Blob([new Uint8Array(450_000)], { type: 'image/jpeg' }),
      new Blob([new Uint8Array(425_000)], { type: 'image/jpeg' }),
    ];
    const convertToBlob = vi
      .fn()
      .mockResolvedValueOnce(outputs[0])
      .mockResolvedValueOnce(outputs[1])
      .mockResolvedValue(outputs[2]);
    const canvas = { convertToBlob } as unknown as OffscreenCanvas;

    const result = await encodeJpegTargetSize(canvas, 200_000, 0);

    expect(result).toBe(outputs[2]);
  });
});
