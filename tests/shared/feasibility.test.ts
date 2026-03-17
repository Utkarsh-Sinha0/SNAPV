import { describe, expect, it } from 'vitest';

import { checkFeasibility } from '../../src/shared/feasibility';
import type { CaptureMetadata, ExportSpec } from '../../src/shared/types';

const baseSpec: ExportSpec = {
  format: 'png',
  dimensions: { mode: 'manual', width: 800, height: 600 },
  dpiPolicy: 'css1x',
  filenameTemplate: 'snapvault-{timestamp}',
};

const baseMetadata: CaptureMetadata = {
  cssWidth: 1200,
  cssHeight: 900,
  devicePixelRatio: 1,
  screenLeft: 0,
  screenTop: 0,
  lightMode: false,
  capturedAt: Date.now(),
};

describe('checkFeasibility', () => {
  it('returns ok=true for trivially valid input', () => {
    const result = checkFeasibility(baseSpec, baseMetadata);

    expect(result.ok).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('blocks when upscale ratio is too high', () => {
    const result = checkFeasibility(
      {
        ...baseSpec,
        dimensions: { mode: 'manual', width: 2000, height: 600 },
      },
      { ...baseMetadata, cssWidth: 400 },
    );

    expect(result.ok).toBe(false);
    expect(result.blockingReasons).toContain('Upscale ratio too high');
  });

  it('does not block modest upscales', () => {
    const result = checkFeasibility(
      {
        ...baseSpec,
        dimensions: { mode: 'manual', width: 800, height: 600 },
      },
      { ...baseMetadata, cssWidth: 400 },
    );

    expect(result.blockingReasons).not.toContain('Upscale ratio too high');
  });

  it('blocks when estimated bytes exceed 50 MB', () => {
    const result = checkFeasibility(
      {
        ...baseSpec,
        dimensions: { mode: 'manual', width: 4000, height: 4000 },
      },
      baseMetadata,
    );

    expect(result.ok).toBe(false);
    expect(result.blockingReasons).toContain('Estimated file too large');
    expect(result.estimatedBytesRange).toBeDefined();
  });

  it('warns about oversized PDF pages', () => {
    const result = checkFeasibility(
      {
        ...baseSpec,
        format: 'pdf',
        dimensions: { mode: 'manual', width: 1000, height: 20000 },
      },
      baseMetadata,
    );

    expect(result.warnings).toHaveLength(1);
  });

  it('suggests light mode for expensive exports', () => {
    const result = checkFeasibility(
      {
        ...baseSpec,
        dimensions: { mode: 'manual', width: 8000, height: 6000 },
      },
      baseMetadata,
    );

    expect(result.suggestLightMode).toBe(true);
    expect(result.warnings).toContain('Export may take more than 5 seconds on a mid-range CPU');
  });

  it('suppresses the cpu warning when light mode is already active', () => {
    const result = checkFeasibility(
      {
        ...baseSpec,
        dimensions: { mode: 'manual', width: 8000, height: 6000 },
      },
      { ...baseMetadata, lightMode: true },
    );

    expect(result.suggestLightMode).toBe(false);
    expect(result.warnings).not.toContain(
      'Export may take more than 5 seconds on a mid-range CPU',
    );
  });

  it('sets the hi-dpi warning for device pixel exports on hi-dpi screens', () => {
    const result = checkFeasibility(
      { ...baseSpec, dpiPolicy: 'device' },
      { ...baseMetadata, devicePixelRatio: 2 },
    );

    expect(result.hiDpiWarning).toBe(true);
  });

  it('does not set the hi-dpi warning for css1x exports', () => {
    const result = checkFeasibility(
      { ...baseSpec, dpiPolicy: 'css1x' },
      { ...baseMetadata, devicePixelRatio: 2 },
    );

    expect(result.hiDpiWarning).toBe(false);
  });

  it('always populates estimatedBytesRange', () => {
    const result = checkFeasibility(baseSpec, baseMetadata);

    expect(result.estimatedBytesRange).toBeDefined();
    expect(result.estimatedBytesRange).toHaveLength(2);
  });
});
