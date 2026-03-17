import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRESETS,
  getDefaultExportSpec,
  validateExportSpec,
  validateExportSpecPreset,
} from '../../src/shared/export-spec';

describe('export spec validation', () => {
  it('returns a typed export spec for valid data', () => {
    const spec = validateExportSpec({
      format: 'png',
      dimensions: { mode: 'manual', width: 1200, height: 900 },
      dpiPolicy: 'css1x',
      filenameTemplate: 'snapvault-{timestamp}',
    });

    expect(spec.format).toBe('png');
    expect(spec.dimensions.mode).toBe('manual');
  });

  it('throws for invalid formats', () => {
    expect(() =>
      validateExportSpec({
        format: 'bmp',
        dimensions: { mode: 'preset' },
        dpiPolicy: 'css1x',
        filenameTemplate: 'snapvault',
      }),
    ).toThrow('Invalid format: bmp');
  });

  it('throws when format is missing', () => {
    expect(() =>
      validateExportSpec({
        dimensions: { mode: 'preset' },
        dpiPolicy: 'css1x',
        filenameTemplate: 'snapvault',
      }),
    ).toThrow();
  });

  it('validates preset wrappers', () => {
    const preset = validateExportSpecPreset({
      snapvault_preset: '1.0',
      name: 'Demo',
      spec: getDefaultExportSpec(),
    });

    expect(preset.name).toBe('Demo');
  });

  it('rejects unsupported preset schema versions', () => {
    expect(() =>
      validateExportSpecPreset({
        snapvault_preset: '2.0',
        name: 'Broken',
        spec: getDefaultExportSpec(),
      }),
    ).toThrow('Unsupported preset schema version');
  });

  it('returns a default export spec that validates cleanly', () => {
    expect(validateExportSpec(getDefaultExportSpec())).toEqual(getDefaultExportSpec());
  });

  it('provides validated default presets with unique names', () => {
    const names = DEFAULT_PRESETS.map((preset) => preset.name);
    expect(new Set(names).size).toBe(names.length);

    for (const preset of DEFAULT_PRESETS) {
      expect(validateExportSpecPreset(preset)).toEqual(preset);
    }
  });
});
