export type ExportFormat = 'png' | 'jpeg' | 'pdf';
export type DimensionsMode = 'preset' | 'manual';
export type DpiPolicy = 'css1x' | 'device';
export type JpegMode = 'quality' | 'targetSize';

export interface ExportSpec {
  format: ExportFormat;
  dimensions: {
    mode: DimensionsMode;
    presetId?: string;
    width?: number;
    height?: number;
  };
  dpiPolicy: DpiPolicy;
  jpeg?: {
    mode: JpegMode;
    quality?: number;
    targetBytes?: number;
    toleranceBytes?: number;
  };
  filenameTemplate: string;
  lightMode?: boolean;
  gpuAccelerate?: boolean;
}

export interface CaptureMetadata {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  screenLeft: number;
  screenTop: number;
  lightMode: boolean;
  capturedAt: number;
}

export interface FeasibilityResult {
  ok: boolean;
  blockingReasons: string[];
  warnings: string[];
  estimatedBytesRange?: [min: number, max: number];
  estimatedCpuSeconds?: number;
  suggestLightMode?: boolean;
  dprAdjustedDimensions?: {
    width: number;
    height: number;
  };
  hiDpiWarning?: boolean;
}

export type RedactAnnotationType =
  | 'face'
  | 'logo'
  | 'email'
  | 'phone'
  | 'credit-card'
  | 'api-key'
  | 'ssn'
  | 'text-block'
  | 'custom';

export interface RedactAnnotation {
  id: string;
  type: RedactAnnotationType;
  rect: { x: number; y: number; w: number; h: number };
  confidence: number;
  source: 'dom' | 'ml';
  userReviewed: boolean;
}

export interface ExportSpecPreset {
  snapvault_preset: '1.0';
  name: string;
  description?: string;
  spec: ExportSpec;
  createdAt?: string;
}

export interface LicenseState {
  status: 'free' | 'pro' | 'expired';
  plan?: string;
  expiresAt?: string;
  installationId?: string;
}

export interface CaptureRecord {
  dataUrl: string;
  metadata: CaptureMetadata;
  sourceTabId?: number;
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HeavyWorkerRequest {
  type: string;
  id?: string;
  _target?: 'offscreen' | 'background-heavy';
  [key: string]: unknown;
}

export interface HeavyWorkerResult<T = unknown> {
  type: 'OFFSCREEN_RESULT';
  id: string;
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ExportArtifact {
  dataUrl: string;
  mimeType: string;
}
