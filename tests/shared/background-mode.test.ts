import { beforeEach, describe, expect, it } from 'vitest';
import { applyBackgroundMode } from '../../src/shared/background-mode';
import {
  FakeOffscreenCanvas,
  getPixel,
  installFakeOffscreenCanvas,
  setPixel,
} from '../helpers/fake-canvas';

describe('applyBackgroundMode', () => {
  beforeEach(() => {
    installFakeOffscreenCanvas();
  });

  it('fills transparent pixels when solid mode is selected', () => {
    const canvas = new FakeOffscreenCanvas(2, 2);
    setPixel(canvas, 0, 0, [0, 0, 0, 0]);

    applyBackgroundMode(canvas as unknown as OffscreenCanvas, 'solid', '#ffffff');

    expect(getPixel(canvas, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('preserves transparent pixels in transparent mode', () => {
    const canvas = new FakeOffscreenCanvas(2, 2);
    setPixel(canvas, 0, 0, [0, 0, 0, 0]);

    applyBackgroundMode(canvas as unknown as OffscreenCanvas, 'transparent');

    expect(getPixel(canvas, 0, 0)[3]).toBe(0);
  });
});
