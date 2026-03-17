import { applyDpiPolicy } from './dpi';
import { encodeJpegAtQuality, encodeJpegTargetSize, encodePng } from './encode';
import { stitchSegments } from './stitch';
import { resolveExportDimensions } from './export-spec';
import type {
  CaptureMetadata,
  ExportArtifact,
  ExportSpec,
  HeavyWorkerRequest,
  HeavyWorkerResult,
  LicenseState,
  RectLike,
} from './types';

export type RefTracker = {
  remember: (value: unknown) => void;
  clear: () => void;
};

export type BuildPdf = typeof import('./pdf')['buildPdf'];
export type RunMlRedaction = typeof import('../offscreen/ml-redaction')['runMlRedaction'];
export type HeavyWorkerDeps = {
  buildPdf: BuildPdf;
  runMlRedaction: RunMlRedaction;
};

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  // pixel-audit: allow-local-fetch Data URLs are decoded locally inside the heavy worker.
  const response = await fetch(dataUrl);
  return response.blob();
}

async function dataUrlToImageBitmap(dataUrl: string): Promise<ImageBitmap> {
  const blob = await dataUrlToBlob(dataUrl);
  return createImageBitmap(blob);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function bytesToDataUrl(bytes: Uint8Array, mimeType: string): Promise<string> {
  return blobToDataUrl(new Blob([Uint8Array.from(bytes)], { type: mimeType }));
}

function getContext(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context is unavailable');
  }

  return context;
}

function bitmapToCanvas(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  getContext(canvas).drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, width, height);
  return canvas;
}

async function encodeCanvasForSpec(
  canvas: OffscreenCanvas,
  spec: ExportSpec,
  deps: HeavyWorkerDeps,
): Promise<ExportArtifact> {
  if (spec.format === 'png') {
    const blob = await encodePng(canvas);
    return { dataUrl: await blobToDataUrl(blob), mimeType: 'image/png' };
  }

  if (spec.format === 'jpeg') {
    const blob =
      spec.jpeg?.mode === 'targetSize'
        ? await encodeJpegTargetSize(
            canvas,
            spec.jpeg.targetBytes ?? 250_000,
            spec.jpeg.toleranceBytes ?? 0,
          )
        : await encodeJpegAtQuality(canvas, (spec.jpeg?.quality ?? 92) / 100);

    return { dataUrl: await blobToDataUrl(blob), mimeType: 'image/jpeg' };
  }

  const pngBlob = await encodePng(canvas);
  const pdfBytes = await deps.buildPdf([pngBlob], spec);
  return {
    dataUrl: await bytesToDataUrl(pdfBytes, 'application/pdf'),
    mimeType: 'application/pdf',
  };
}

async function cropDataUrl(dataUrl: string, rect: RectLike): Promise<string> {
  const bitmap = await dataUrlToImageBitmap(dataUrl);
  const canvas = new OffscreenCanvas(rect.width, rect.height);
  getContext(canvas).drawImage(
    bitmap,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  );

  const blob = await encodePng(canvas);
  return blobToDataUrl(blob);
}

function scaleRectToBitmap(
  rect: RectLike,
  bitmap: ImageBitmap,
  metadata?: CaptureMetadata,
): RectLike {
  const scaleX =
    metadata?.cssWidth && metadata.cssWidth > 0
      ? bitmap.width / metadata.cssWidth
      : 1;
  const scaleY =
    metadata?.cssHeight && metadata.cssHeight > 0
      ? bitmap.height / metadata.cssHeight
      : 1;

  const x = Math.max(0, Math.round(rect.x * scaleX));
  const y = Math.max(0, Math.round(rect.y * scaleY));
  const width = Math.max(1, Math.round(rect.width * scaleX));
  const height = Math.max(1, Math.round(rect.height * scaleY));

  return {
    x,
    y,
    width: Math.min(width, Math.max(1, bitmap.width - x)),
    height: Math.min(height, Math.max(1, bitmap.height - y)),
  };
}

async function cropDataUrlForMetadata(
  dataUrl: string,
  rect: RectLike,
  metadata?: CaptureMetadata,
): Promise<string> {
  const bitmap = await dataUrlToImageBitmap(dataUrl);
  const scaledRect = scaleRectToBitmap(rect, bitmap, metadata);
  const canvas = new OffscreenCanvas(scaledRect.width, scaledRect.height);
  getContext(canvas).drawImage(
    bitmap,
    scaledRect.x,
    scaledRect.y,
    scaledRect.width,
    scaledRect.height,
    0,
    0,
    scaledRect.width,
    scaledRect.height,
  );

  const blob = await encodePng(canvas);
  return blobToDataUrl(blob);
}

async function stitchDataUrls(
  segments: string[],
  metadata: CaptureMetadata,
  stepPx?: number,
  overlapPx?: number,
): Promise<string> {
  const bitmaps = await Promise.all(segments.map((segment) => dataUrlToImageBitmap(segment)));
  const stitched = stitchSegments(
    bitmaps,
    stepPx ?? metadata.cssHeight,
    overlapPx ?? 0,
    metadata.lightMode,
  );
  const blob = await encodePng(stitched);
  return blobToDataUrl(blob);
}

async function exportDataUrl(
  dataUrl: string,
  spec: ExportSpec,
  metadata: CaptureMetadata | undefined,
  licenseState: LicenseState | undefined,
  deps: HeavyWorkerDeps,
): Promise<ExportArtifact> {
  const bitmap = await dataUrlToImageBitmap(dataUrl);
  const fallbackWidth = metadata?.cssWidth ?? bitmap.width;
  const fallbackHeight = metadata?.cssHeight ?? bitmap.height;
  const cssDimensions = resolveExportDimensions(spec, {
    width: fallbackWidth,
    height: fallbackHeight,
  });
  const dpr = metadata?.devicePixelRatio ?? 1;

  if (spec.dpiPolicy === 'css1x' && dpr > 1 && licenseState?.status !== 'pro') {
    throw new Error('HiDPI normalization requires Pro');
  }

  const normalizedDimensions =
    spec.dpiPolicy === 'device'
      ? {
          width: Math.round(cssDimensions.width * dpr),
          height: Math.round(cssDimensions.height * dpr),
        }
      : cssDimensions;
  const outputDimensions = applyDpiPolicy(
    normalizedDimensions.width,
    normalizedDimensions.height,
    1,
    'device',
  );
  const canvas = bitmapToCanvas(bitmap, outputDimensions.width, outputDimensions.height);
  return encodeCanvasForSpec(canvas, spec, deps);
}

async function buildPdfArtifact(
  pages: string[],
  spec: ExportSpec,
  deps: HeavyWorkerDeps,
): Promise<ExportArtifact> {
  const blobs = await Promise.all(pages.map((page) => dataUrlToBlob(page)));
  const pdfBytes = await deps.buildPdf(blobs, spec);
  return {
    dataUrl: await bytesToDataUrl(pdfBytes, 'application/pdf'),
    mimeType: 'application/pdf',
  };
}

export async function processHeavyWorkerMessageWithDeps(
  message: HeavyWorkerRequest,
  refs: RefTracker,
  deps: HeavyWorkerDeps,
): Promise<HeavyWorkerResult> {
  if (typeof message.id !== 'string') {
    throw new Error('Heavy worker messages require an id');
  }

  try {
    if (message.type === 'OFFSCREEN_CLEAR_MEMORY') {
      refs.clear();
      return {
        type: 'OFFSCREEN_RESULT',
        id: message.id,
        ok: true,
      };
    }

    if (message.type === 'OFFSCREEN_ENCODE') {
      if (message.rect) {
        const dataUrl = await cropDataUrlForMetadata(
          String(message.dataUrl),
          message.rect as RectLike,
          message.metadata as CaptureMetadata | undefined,
        );
        refs.clear();
        return {
          type: 'OFFSCREEN_RESULT',
          id: message.id,
          ok: true,
          data: { dataUrl, mimeType: 'image/png' },
        };
      }

      const artifact = await exportDataUrl(
        String(message.dataUrl),
        message.spec as ExportSpec,
        message.metadata as CaptureMetadata | undefined,
        message.licenseState as LicenseState | undefined,
        deps,
      );
      refs.clear();
      return {
        type: 'OFFSCREEN_RESULT',
        id: message.id,
        ok: true,
        data: artifact,
      };
    }

    if (message.type === 'OFFSCREEN_BUILD_PDF') {
      const artifact = await buildPdfArtifact(
        message.pages as string[],
        message.spec as ExportSpec,
        deps,
      );
      refs.clear();
      return {
        type: 'OFFSCREEN_RESULT',
        id: message.id,
        ok: true,
        data: artifact,
      };
    }

    if (message.type === 'OFFSCREEN_ENCODE_LEGACY_CROP') {
      const dataUrl = await cropDataUrl(
        String(message.dataUrl),
        message.rect as RectLike,
      );
      refs.clear();
      return {
        type: 'OFFSCREEN_RESULT',
        id: message.id,
        ok: true,
        data: { dataUrl },
      };
    }

    if (message.type === 'OFFSCREEN_STITCH') {
      const segments = message.segments as string[];
      const metadata = message.metadata as CaptureMetadata;
      const dataUrl = await stitchDataUrls(
        segments,
        metadata,
        message.stepPx as number | undefined,
        message.overlapPx as number | undefined,
      );
      refs.clear();
      return {
        type: 'OFFSCREEN_RESULT',
        id: message.id,
        ok: true,
        data: { dataUrl, mimeType: 'image/png' },
      };
    }

    if (message.type === 'OFFSCREEN_RUN_ML_REDACTION') {
      const result = await deps.runMlRedaction(String(message.dataUrl));
      refs.clear();
      return {
        type: 'OFFSCREEN_RESULT',
        id: message.id,
        ok: true,
        data: result,
      };
    }

    return {
      type: 'OFFSCREEN_RESULT',
      id: message.id,
      ok: false,
      error: `Unhandled heavy worker message: ${message.type}`,
    };
  } catch (error) {
    refs.clear();
    return {
      type: 'OFFSCREEN_RESULT',
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
