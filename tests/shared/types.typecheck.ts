import type {
  CaptureMetadata,
  ExportSpec,
  ExportSpecPreset,
  FeasibilityResult,
  LicenseState,
  RedactAnnotation,
  RedactAnnotationType,
} from '../../src/shared/types';

const validSpec: ExportSpec = {
  format: 'png',
  dimensions: {
    mode: 'preset',
    presetId: 'original',
  },
  dpiPolicy: 'css1x',
  filenameTemplate: 'snapvault-{timestamp}',
};

const metadata: CaptureMetadata = {
  cssWidth: 1200,
  cssHeight: 800,
  devicePixelRatio: 2,
  screenLeft: 0,
  screenTop: 0,
  lightMode: false,
  capturedAt: Date.now(),
};

const feasibility: FeasibilityResult = {
  ok: true,
  blockingReasons: [],
  warnings: [],
  hiDpiWarning: false,
};

const annotationTypes: RedactAnnotationType[] = [
  'face',
  'logo',
  'email',
  'phone',
  'credit-card',
  'api-key',
  'ssn',
  'text-block',
  'custom',
];

const annotation: RedactAnnotation = {
  id: 'ann-1',
  type: annotationTypes[0],
  rect: { x: 0, y: 0, w: 10, h: 10 },
  confidence: 0.95,
  source: 'dom',
  userReviewed: true,
};

const preset: ExportSpecPreset = {
  snapvault_preset: '1.0',
  name: 'Default',
  spec: validSpec,
};

const license: LicenseState = {
  status: 'pro',
  plan: 'monthly',
  expiresAt: '2026-12-31T00:00:00.000Z',
  installationId: 'install-1',
};

void metadata;
void feasibility;
void annotation;
void preset;
void license;

// @ts-expect-error Missing required format field.
const invalidSpec: ExportSpec = {
  dimensions: { mode: 'preset' },
  dpiPolicy: 'css1x',
  filenameTemplate: 'snapvault',
};

const invalidMetadata: CaptureMetadata = {
  // @ts-expect-error Wrong capture metadata field type.
  cssWidth: '1200',
  cssHeight: 800,
  devicePixelRatio: 1,
  screenLeft: 0,
  screenTop: 0,
  lightMode: false,
  capturedAt: 0,
};

const invalidPreset: ExportSpecPreset = {
  // @ts-expect-error Unsupported preset sentinel.
  snapvault_preset: '2.0',
  name: 'Broken',
  spec: validSpec,
};

void invalidSpec;
void invalidMetadata;
void invalidPreset;
