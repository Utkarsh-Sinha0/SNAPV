export function toDevicePixels(cssValue: number, dpr: number): number {
  return cssValue * dpr;
}

export function toCssPixels(physicalValue: number, dpr: number): number {
  return physicalValue / dpr;
}

export function applyDpiPolicy(
  width: number,
  height: number,
  dpr: number,
  policy: 'css1x' | 'device',
): { width: number; height: number } {
  if (policy === 'css1x') {
    return {
      width: toCssPixels(width, dpr),
      height: toCssPixels(height, dpr),
    };
  }

  return { width, height };
}

export function isHiDpi(dpr: number): boolean {
  return dpr > 1;
}
