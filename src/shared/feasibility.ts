import { isHiDpi } from './dpi';
import { resolveExportDimensions } from './export-spec';
import type { CaptureMetadata, ExportSpec, FeasibilityResult } from './types';

const MAX_UPSCALE_RATIO = 3;
const MAX_ESTIMATED_BYTES = 50 * 1024 * 1024;
const A4_HEIGHT_AT_96_DPI = Math.round(11.69 * 96);
const CPU_WARNING_THRESHOLD_SECONDS = 5;

function toOutputDimensions(
  spec: ExportSpec,
  metadata: CaptureMetadata,
): { width: number; height: number } {
  const cssDimensions = resolveExportDimensions(spec, {
    width: metadata.cssWidth,
    height: metadata.cssHeight,
  });

  if (spec.dpiPolicy === 'device') {
    return {
      width: Math.round(cssDimensions.width * metadata.devicePixelRatio),
      height: Math.round(cssDimensions.height * metadata.devicePixelRatio),
    };
  }

  return cssDimensions;
}

function buildEstimatedBytesRange(estimatedBytes: number): [number, number] {
  return [
    Math.max(1, Math.floor(estimatedBytes * 0.85)),
    Math.max(1, Math.ceil(estimatedBytes * 1.15)),
  ];
}

export function checkFeasibility(
  spec: ExportSpec,
  metadata: CaptureMetadata,
): FeasibilityResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const cssDimensions = resolveExportDimensions(spec, {
    width: metadata.cssWidth,
    height: metadata.cssHeight,
  });
  const dprAdjustedDimensions = toOutputDimensions(spec, metadata);
  const estimatedBytes =
    dprAdjustedDimensions.width * dprAdjustedDimensions.height * 4;
  const estimatedCpuSeconds =
    (dprAdjustedDimensions.width * dprAdjustedDimensions.height) / 4_000_000;
  const hiDpiWarning = isHiDpi(metadata.devicePixelRatio) && spec.dpiPolicy === 'device';
  const suggestLightMode =
    estimatedCpuSeconds > CPU_WARNING_THRESHOLD_SECONDS && !metadata.lightMode;

  if (cssDimensions.width > metadata.cssWidth * MAX_UPSCALE_RATIO) {
    blockingReasons.push('Upscale ratio too high');
  }

  if (estimatedBytes > MAX_ESTIMATED_BYTES) {
    blockingReasons.push('Estimated file too large');
  }

  if (spec.format === 'pdf' && dprAdjustedDimensions.height > A4_HEIGHT_AT_96_DPI) {
    warnings.push('PDF export may exceed a single A4 page height');
  }

  if (suggestLightMode) {
    warnings.push('Export may take more than 5 seconds on a mid-range CPU');
  }

  return {
    ok: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    estimatedBytesRange: buildEstimatedBytesRange(estimatedBytes),
    estimatedCpuSeconds,
    suggestLightMode,
    dprAdjustedDimensions,
    hiDpiWarning,
  };
}
