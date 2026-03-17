import { handleGetCaptureDataUrl } from './capture-service';
import { sendToHeavyWorker } from '../shared/offscreen-adapter';
import { isFirefox } from '../shared/browser';
import { checkFeasibility } from '../shared/feasibility';
import { getWebExtensionNamespace } from '../shared/webextension-namespace';
import type {
  CaptureMetadata,
  ExportArtifact,
  ExportSpec,
  HeavyWorkerResult,
  LicenseState,
} from '../shared/types';

type StorageAreaLike = {
  get: (keys?: string | string[] | null | Record<string, unknown>) => Promise<Record<string, unknown>>;
};

type RuntimeLike = {
  onMessage: {
    addListener: (
      callback: (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void,
      ) => boolean | void,
    ) => void;
  };
};

type DownloadsLike = {
  download: (options: {
    url: string;
    filename: string;
  }) => Promise<number>;
};

type ExportApis = {
  runtime: RuntimeLike;
  storage: StorageAreaLike;
  downloads: DownloadsLike;
};

type ClipboardLike = {
  write: (items: unknown[]) => Promise<void>;
};

type DownloadTarget = {
  url: string;
  cleanup?: () => void;
};

type CachedExportArtifact = {
  sourceDataUrl: string;
  artifact: ExportArtifact;
};

const exportArtifactCache = new Map<string, CachedExportArtifact>();

function getApis(): ExportApis {
  const extensionApi = getWebExtensionNamespace<{
    runtime: RuntimeLike;
    storage: { local: StorageAreaLike };
    downloads: DownloadsLike;
  }>();

  return {
    runtime: extensionApi.runtime,
    storage: extensionApi.storage.local,
    downloads: extensionApi.downloads,
  };
}

function getClipboard(): ClipboardLike {
  return (globalThis as unknown as { navigator: { clipboard: ClipboardLike } }).navigator
    .clipboard;
}

function getClipboardItemCtor(): new (items: Record<string, Blob>) => unknown {
  return (globalThis as unknown as { ClipboardItem: new (items: Record<string, Blob>) => unknown })
    .ClipboardItem;
}

function getLicenseState(stored: Record<string, unknown>): LicenseState {
  const raw = stored.licenseState as LicenseState | undefined;
  return raw ?? { status: 'free' };
}

function formatExtension(format: ExportSpec['format']): string {
  if (format === 'jpeg') {
    return 'jpeg';
  }

  return format;
}

export function resolveFilenameTemplate(
  template: string,
  format: ExportSpec['format'],
  now = new Date(),
): string {
  const isoTimestamp = now.toISOString();
  const date = isoTimestamp.slice(0, 10);
  const time = isoTimestamp.slice(11, 19).replace(/:/g, '-');
  const extension = formatExtension(format);

  const resolved = template
    .replaceAll('{date}', date)
    .replaceAll('{time}', time)
    .replaceAll('{format}', extension);

  if (/\.(png|jpe?g|pdf)$/i.test(resolved)) {
    return resolved;
  }

  return `${resolved}.${extension}`;
}

async function requireCapture(
  captureId: string,
): Promise<{ dataUrl: string; metadata: CaptureMetadata }> {
  const capture = await handleGetCaptureDataUrl({ captureId });
  if (!capture.dataUrl || !capture.metadata) {
    throw new Error(`Capture not found: ${captureId}`);
  }

  return {
    dataUrl: capture.dataUrl,
    metadata: capture.metadata,
  };
}

function requireArtifact(result: HeavyWorkerResult): ExportArtifact {
  if (!result.ok) {
    throw new Error(result.error ?? 'Export failed');
  }

  const artifact = result.data as ExportArtifact | undefined;
  if (!artifact?.dataUrl || !artifact.mimeType) {
    throw new Error('Export artifact missing data');
  }

  return artifact;
}

function createArtifactCacheKey(captureId: string, spec: ExportSpec): string {
  return JSON.stringify([captureId, spec]);
}

function getCachedArtifact(
  captureId: string,
  spec: ExportSpec,
  sourceDataUrl: string,
): ExportArtifact | null {
  const cached = exportArtifactCache.get(createArtifactCacheKey(captureId, spec));
  if (!cached || cached.sourceDataUrl !== sourceDataUrl) {
    return null;
  }

  return cached.artifact;
}

function cacheArtifact(
  captureId: string,
  spec: ExportSpec,
  sourceDataUrl: string,
  artifact: ExportArtifact,
): ExportArtifact {
  exportArtifactCache.set(createArtifactCacheKey(captureId, spec), {
    sourceDataUrl,
    artifact,
  });
  return artifact;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const match = /^data:([^;,]+)?((?:;[^;,=]+=[^;,]+)*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error('Invalid data URL');
  }

  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[3]);
  const payload = match[4] ?? '';
  const decoded = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

export async function createDownloadTarget(dataUrl: string): Promise<DownloadTarget> {
  if (!isFirefox()) {
    return { url: dataUrl };
  }

  const blob = await dataUrlToBlob(dataUrl);
  const objectUrl = URL.createObjectURL(blob);
  return {
    url: objectUrl,
    cleanup: () => {
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 30_000);
    },
  };
}

export async function handleApplyExportSpec(
  payload: { captureId: string; spec: ExportSpec },
  apis: ExportApis = getApis(),
): Promise<ExportArtifact> {
  const capture = await requireCapture(payload.captureId);
  const stored = await apis.storage.get('licenseState');
  const result = await sendToHeavyWorker<HeavyWorkerResult>({
    type: 'OFFSCREEN_ENCODE',
    dataUrl: capture.dataUrl,
    spec: payload.spec,
    metadata: capture.metadata,
    licenseState: getLicenseState(stored),
  });

  return cacheArtifact(
    payload.captureId,
    payload.spec,
    capture.dataUrl,
    requireArtifact(result),
  );
}

export async function handleExportDownload(
  payload: { captureId: string; spec: ExportSpec },
  apis: ExportApis = getApis(),
  now = new Date(),
): Promise<{ filename: string }> {
  const capture = await requireCapture(payload.captureId);
  const artifact =
    getCachedArtifact(payload.captureId, payload.spec, capture.dataUrl) ??
    (await handleApplyExportSpec(payload, apis));
  const filename = resolveFilenameTemplate(payload.spec.filenameTemplate, payload.spec.format, now);
  const downloadTarget = await createDownloadTarget(artifact.dataUrl);

  try {
    await apis.downloads.download({
      url: downloadTarget.url,
      filename,
    });
  } finally {
    downloadTarget.cleanup?.();
  }

  return { filename };
}

export async function handleExportClipboard(
  payload: { captureId: string; spec: ExportSpec },
  apis: ExportApis = getApis(),
): Promise<{ ok: true }> {
  const artifact = await handleApplyExportSpec(
    {
      captureId: payload.captureId,
      spec: { ...payload.spec, format: 'png' },
    },
    apis,
  );
  const blob = await dataUrlToBlob(artifact.dataUrl);
  const ClipboardItemCtor = getClipboardItemCtor();

  await getClipboard().write([
    new ClipboardItemCtor({
      'image/png': blob,
    }),
  ]);

  return { ok: true };
}

export async function handleCheckFeasibility(
  payload: { spec: ExportSpec; metadata: CaptureMetadata },
): Promise<ReturnType<typeof checkFeasibility>> {
  return checkFeasibility(payload.spec, payload.metadata);
}

export function registerExportMessageHandlers(
  apis: ExportApis = getApis(),
): void {
  apis.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const payload = message as { type?: string; _target?: string };
    if (!payload.type || payload.type.startsWith('OFFSCREEN_') || payload._target) {
      return;
    }

    const handlers: Record<string, () => Promise<unknown>> = {
      APPLY_EXPORT_SPEC: () => handleApplyExportSpec(payload as never, apis),
      EXPORT_DOWNLOAD: () => handleExportDownload(payload as never, apis),
      EXPORT_CLIPBOARD: () => handleExportClipboard(payload as never, apis),
      CHECK_FEASIBILITY: () => handleCheckFeasibility(payload as never),
    };

    const handler = handlers[payload.type];
    if (!handler) {
      return;
    }

    void handler()
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          __error__: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  });
}

export function __resetExportArtifactCacheForTests(): void {
  exportArtifactCache.clear();
}
