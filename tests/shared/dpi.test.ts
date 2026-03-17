import { describe, expect, it } from 'vitest';

import {
  applyDpiPolicy,
  isHiDpi,
  toCssPixels,
  toDevicePixels,
} from '../../src/shared/dpi';

describe('dpi utilities', () => {
  it('converts css pixels to device pixels', () => {
    expect(toDevicePixels(100, 2)).toBe(200);
    expect(toDevicePixels(100, 1)).toBe(100);
  });

  it('converts physical pixels to css pixels', () => {
    expect(toCssPixels(200, 2)).toBe(100);
    expect(toCssPixels(150, 1.5)).toBe(100);
  });

  it('applies the dpi policy', () => {
    expect(applyDpiPolicy(200, 200, 2, 'css1x')).toEqual({
      width: 100,
      height: 100,
    });
    expect(applyDpiPolicy(200, 200, 2, 'device')).toEqual({
      width: 200,
      height: 200,
    });
  });

  it('detects hi-dpi displays', () => {
    expect(isHiDpi(2)).toBe(true);
    expect(isHiDpi(1)).toBe(false);
    expect(isHiDpi(1.5)).toBe(true);
  });
});
