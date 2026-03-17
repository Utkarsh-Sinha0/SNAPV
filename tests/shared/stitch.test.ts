import { beforeEach, describe, expect, it } from 'vitest';

import { computeRowHash, stitchSegments } from '../../src/shared/stitch';
import {
  FakeImageBitmap,
  FakeOffscreenCanvas,
  createSolidBitmap,
  getPixel,
  installFakeOffscreenCanvas,
  setPixel,
} from '../helpers/fake-canvas';

function createOverlapSegments(): [FakeImageBitmap, FakeImageBitmap] {
  const first = createSolidBitmap(100, 200, [255, 0, 0, 255]);
  const second = createSolidBitmap(100, 200, [0, 255, 0, 255]);

  for (let row = 180; row < 200; row += 1) {
    const value = row - 180;
    for (let x = 0; x < 100; x += 1) {
      setPixel(first, x, row, [value, 0, 255, 255]);
    }
  }

  for (let row = 0; row < 20; row += 1) {
    for (let x = 0; x < 100; x += 1) {
      setPixel(second, x, row, [row, 0, 255, 255]);
    }
  }

  return [first, second];
}

describe('stitchSegments', () => {
  beforeEach(() => {
    installFakeOffscreenCanvas();
  });

  it('returns a canvas matching a single segment', () => {
    const segment = createSolidBitmap(100, 200, [20, 30, 40, 255]);
    const output = stitchSegments([segment as unknown as ImageBitmap], 180, 20, true);

    expect(output.width).toBe(100);
    expect(output.height).toBe(200);
    expect(getPixel(output as unknown as FakeOffscreenCanvas, 0, 0)).toEqual([
      20, 30, 40, 255,
    ]);
  });

  it('stitches two segments in light mode using the provided step', () => {
    const first = createSolidBitmap(100, 200, [255, 0, 0, 255]);
    const second = createSolidBitmap(100, 200, [0, 0, 255, 255]);
    const output = stitchSegments(
      [first as unknown as ImageBitmap, second as unknown as ImageBitmap],
      180,
      20,
      true,
    );

    expect(output.height).toBe(380);
    expect(getPixel(output as unknown as FakeOffscreenCanvas, 0, 0)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(getPixel(output as unknown as FakeOffscreenCanvas, 0, 180)).toEqual([
      0, 0, 255, 255,
    ]);
  });

  it('stitches with overlap correction in non-light mode', () => {
    const [first, second] = createOverlapSegments();
    const output = stitchSegments(
      [first as unknown as ImageBitmap, second as unknown as ImageBitmap],
      180,
      20,
      false,
    );

    expect(output.height).toBe(380);
    expect(getPixel(output as unknown as FakeOffscreenCanvas, 0, 179)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(getPixel(output as unknown as FakeOffscreenCanvas, 0, 180)).toEqual([
      0, 0, 255, 255,
    ]);
    expect(getPixel(output as unknown as FakeOffscreenCanvas, 0, 200)).toEqual([
      0, 255, 0, 255,
    ]);
  });

  it('stitches multiple segments cumulatively', () => {
    const segments = Array.from({ length: 5 }, (_, index) =>
      createSolidBitmap(100, 200, [index, 0, 0, 255]),
    );
    const output = stitchSegments(
      segments as unknown as ImageBitmap[],
      180,
      20,
      true,
    );

    expect(output.height).toBe(920);
  });

  it('computes stable row hashes', () => {
    const canvas = new FakeOffscreenCanvas(3, 2);
    for (let x = 0; x < 3; x += 1) {
      setPixel(canvas, x, 0, [10, 10, 10, 255]);
      setPixel(canvas, x, 1, [20, 20, 20, 255]);
    }

    const firstHash = computeRowHash(canvas as unknown as OffscreenCanvas, 0);
    const secondHash = computeRowHash(canvas as unknown as OffscreenCanvas, 0);
    const differentHash = computeRowHash(canvas as unknown as OffscreenCanvas, 1);

    expect(firstHash).toBe(secondHash);
    expect(firstHash).not.toBe(differentHash);
  });
});
