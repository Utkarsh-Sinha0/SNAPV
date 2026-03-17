import { beforeEach, describe, expect, it } from 'vitest';

import { applyRedactAnnotations } from '../../src/shared/redact';
import type { RedactAnnotation } from '../../src/shared/types';
import {
  FakeOffscreenCanvas,
  getPixel,
  installFakeOffscreenCanvas,
  setPixel,
} from '../helpers/fake-canvas';

describe('applyRedactAnnotations', () => {
  beforeEach(() => {
    installFakeOffscreenCanvas();
  });

  it('mutates reviewed annotation regions', () => {
    const canvas = new FakeOffscreenCanvas(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        setPixel(canvas, x, y, x === 1 && y === 1 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
      }
    }

    const annotations: RedactAnnotation[] = [
      {
        id: '1',
        type: 'custom',
        rect: { x: 0, y: 0, w: 3, h: 3 },
        confidence: 1,
        source: 'dom',
        userReviewed: true,
      },
    ];

    applyRedactAnnotations(canvas as unknown as OffscreenCanvas, annotations);

    expect(getPixel(canvas, 1, 1)).not.toEqual([255, 0, 0, 255]);
  });

  it('leaves unreviewed annotation regions untouched', () => {
    const canvas = new FakeOffscreenCanvas(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        setPixel(canvas, x, y, x === 1 && y === 1 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
      }
    }

    const annotations: RedactAnnotation[] = [
      {
        id: '1',
        type: 'custom',
        rect: { x: 0, y: 0, w: 3, h: 3 },
        confidence: 1,
        source: 'dom',
        userReviewed: false,
      },
    ];

    applyRedactAnnotations(canvas as unknown as OffscreenCanvas, annotations);

    expect(getPixel(canvas, 1, 1)).toEqual([255, 0, 0, 255]);
  });
});
