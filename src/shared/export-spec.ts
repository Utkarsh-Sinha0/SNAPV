import type { ExportSpec, ExportSpecPreset } from './types';

const DIMENSION_PRESET_MAP = {
  original: null,
  '1080p': { width: 1920, height: 1080 },
  a4: { width: 794, height: 1123 },
  social: { width: 1080, height: 1080 },
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

type DimensionsFallback = {
  width: number;
  height: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readPositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return value;
}

function ensureOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${fieldName}`);
  }

  return value;
}

export function resolveExportDimensions(spec: ExportSpec, fallback: DimensionsFallback): DimensionsFallback {
  if (spec.dimensions.mode === 'manual') {
    return {
      width: spec.dimensions.width ?? fallback.width,
      height: spec.dimensions.height ?? fallback.height,
    };
  }

  const presetId = spec.dimensions.presetId ?? 'original';
  const preset = DIMENSION_PRESET_MAP[presetId as keyof typeof DIMENSION_PRESET_MAP];
  return preset ?? fallback;
}

export function validateExportSpec(spec: unknown): ExportSpec {
  if (!isRecord(spec)) {
    throw new Error('Export spec must be an object');
  }

  const format = spec.format;
  if (format !== 'png' && format !== 'jpeg' && format !== 'pdf') {
    throw new Error(`Invalid format: ${String(format)}`);
  }

  if (!isRecord(spec.dimensions)) {
    throw new Error('Invalid dimensions');
  }

  const dimensionsMode = spec.dimensions.mode;
  if (dimensionsMode !== 'preset' && dimensionsMode !== 'manual') {
    throw new Error(`Invalid dimensions.mode: ${String(dimensionsMode)}`);
  }

  const validatedDimensions: ExportSpec['dimensions'] =
    dimensionsMode === 'manual'
      ? {
          mode: 'manual',
          width: readPositiveNumber(spec.dimensions.width, 'dimensions.width'),
          height: readPositiveNumber(spec.dimensions.height, 'dimensions.height'),
        }
      : {
          mode: 'preset',
          ...(spec.dimensions.presetId === undefined
            ? {}
            : { presetId: String(spec.dimensions.presetId) }),
        };

  const dpiPolicy = spec.dpiPolicy;
  if (dpiPolicy !== 'css1x' && dpiPolicy !== 'device') {
    throw new Error(`Invalid dpiPolicy: ${String(dpiPolicy)}`);
  }

  const filenameTemplate = spec.filenameTemplate;
  if (typeof filenameTemplate !== 'string' || filenameTemplate.trim().length === 0) {
    throw new Error('Invalid filenameTemplate');
  }

  let jpeg: ExportSpec['jpeg'];
  if (spec.jpeg !== undefined) {
    if (!isRecord(spec.jpeg)) {
      throw new Error('Invalid jpeg');
    }

    const jpegMode = spec.jpeg.mode;
    if (jpegMode !== 'quality' && jpegMode !== 'targetSize') {
      throw new Error(`Invalid jpeg.mode: ${String(jpegMode)}`);
    }

    jpeg =
      jpegMode === 'quality'
        ? {
            mode: 'quality',
            quality: readPositiveNumber(spec.jpeg.quality, 'jpeg.quality'),
          }
        : {
            mode: 'targetSize',
            targetBytes: readPositiveNumber(spec.jpeg.targetBytes, 'jpeg.targetBytes'),
            toleranceBytes: readPositiveNumber(spec.jpeg.toleranceBytes, 'jpeg.toleranceBytes'),
          };
  }

  const lightMode = ensureOptionalBoolean(spec.lightMode, 'lightMode');
  const gpuAccelerate = ensureOptionalBoolean(spec.gpuAccelerate, 'gpuAccelerate');

  return {
    format,
    dimensions: validatedDimensions,
    dpiPolicy,
    ...(jpeg === undefined ? {} : { jpeg }),
    filenameTemplate,
    ...(lightMode === undefined ? {} : { lightMode }),
    ...(gpuAccelerate === undefined ? {} : { gpuAccelerate }),
  };
}

export function validateExportSpecPreset(raw: unknown): ExportSpecPreset {
  if (!isRecord(raw)) {
    throw new Error('Preset must be an object');
  }

  if (raw.snapvault_preset !== '1.0') {
    throw new Error('Unsupported preset schema version');
  }

  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
    throw new Error('Invalid preset name');
  }

  if (raw.description !== undefined && typeof raw.description !== 'string') {
    throw new Error('Invalid preset description');
  }

  if (raw.createdAt !== undefined && typeof raw.createdAt !== 'string') {
    throw new Error('Invalid preset createdAt');
  }

  return {
    snapvault_preset: '1.0',
    name: raw.name,
    ...(raw.description === undefined ? {} : { description: raw.description }),
    spec: validateExportSpec(raw.spec),
    ...(raw.createdAt === undefined ? {} : { createdAt: raw.createdAt }),
  };
}

export function getDefaultExportSpec(): ExportSpec {
  return {
    format: 'png',
    dimensions: {
      mode: 'preset',
      presetId: 'original',
    },
    dpiPolicy: 'css1x',
    filenameTemplate: 'snapvault-{timestamp}',
  };
}

function makePreset(
  name: string,
  description: string,
  spec: ExportSpec,
): ExportSpecPreset {
  return {
    snapvault_preset: '1.0',
    name,
    description,
    spec,
  };
}

export const DEFAULT_PRESETS: ExportSpecPreset[] = [
  makePreset('1080p PNG', 'Full HD PNG export.', {
    format: 'png',
    dimensions: { mode: 'preset', presetId: '1080p' },
    dpiPolicy: 'css1x',
    filenameTemplate: 'snapvault-1080p-{timestamp}',
  }),
  makePreset('A4 PDF', 'Single-page A4 PDF export.', {
    format: 'pdf',
    dimensions: { mode: 'preset', presetId: 'a4' },
    dpiPolicy: 'css1x',
    filenameTemplate: 'snapvault-a4-{timestamp}',
  }),
  makePreset('Social Square', 'Social-ready square image export.', {
    format: 'png',
    dimensions: { mode: 'preset', presetId: 'social' },
    dpiPolicy: 'css1x',
    filenameTemplate: 'snapvault-social-{timestamp}',
  }),
  makePreset('Desktop Breakpoint', 'Desktop design review preset.', {
    format: 'png',
    dimensions: { mode: 'preset', presetId: 'desktop' },
    dpiPolicy: 'css1x',
    filenameTemplate: 'snapvault-desktop-{timestamp}',
  }),
  makePreset('Mobile Breakpoint', 'Phone viewport export preset.', {
    format: 'png',
    dimensions: { mode: 'preset', presetId: 'mobile' },
    dpiPolicy: 'css1x',
    filenameTemplate: 'snapvault-mobile-{timestamp}',
  }),
].map(validateExportSpecPreset);
