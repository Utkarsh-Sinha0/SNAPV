import { getDefaultExportSpec, validateExportSpec } from '../shared/export-spec';
import type {
  CaptureMetadata,
  ExportArtifact,
  ExportSpec,
  RedactAnnotation,
} from '../shared/types';

type RuntimeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

type RuntimeLike = {
  sendMessage: (message: unknown) => Promise<unknown>;
  onMessage?: {
    addListener: (callback: RuntimeMessageListener) => void;
    removeListener?: (callback: RuntimeMessageListener) => void;
  };
};

type StorageAreaLike = {
  get: (keys?: string | string[] | null | Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export type EditorApis = {
  runtime: RuntimeLike;
  storage: StorageAreaLike;
};

export type LoadedEditorImage = CanvasImageSource & {
  width: number;
  height: number;
};

const POPUP_EXPORT_SPEC_KEY = 'popup.exportSpec';
const FALLBACK_FILENAME_TEMPLATE = 'snapvault-{date}-{time}.{format}';

function getChromeApis(): EditorApis {
  const chromeLike = (globalThis as unknown as {
    chrome: {
      runtime: RuntimeLike;
      storage: { local: StorageAreaLike };
    };
  }).chrome;

  return {
    runtime: chromeLike.runtime,
    storage: chromeLike.storage.local,
  };
}

function normalizeFilenameTemplate(template: string | undefined): string {
  if (!template || template.trim().length === 0) {
    return FALLBACK_FILENAME_TEMPLATE;
  }

  return template
    .replaceAll('{timestamp}', '{date}-{time}')
    .replace(/\.(png|jpeg|pdf)$/i, '.{format}');
}

export function getEditorApis(): EditorApis {
  return getChromeApis();
}

export function getCaptureIdFromLocation(locationLike: Location = window.location): string | null {
  const params = new URLSearchParams(locationLike.search);
  const captureId = params.get('captureId');
  return captureId && captureId.trim().length > 0 ? captureId : null;
}

export function getBoardCaptureIdsFromLocation(
  locationLike: Location = window.location,
): string[] {
  const params = new URLSearchParams(locationLike.search);
  if (params.get('board') !== '1') {
    return [];
  }

  const captureIds = params.get('captureIds');
  if (!captureIds) {
    return [];
  }

  return captureIds
    .split(',')
    .map((captureId) => captureId.trim())
    .filter((captureId) => captureId.length > 0);
}

export function isEditorCaptureMessage(message: unknown): message is {
  type: 'LOAD_EDITOR_CAPTURE';
  captureId: string;
} {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const payload = message as { type?: string; captureId?: unknown };
  return payload.type === 'LOAD_EDITOR_CAPTURE' && typeof payload.captureId === 'string';
}

export async function loadStoredEditorSpec(
  apis: EditorApis = getChromeApis(),
): Promise<ExportSpec> {
  const stored = await apis.storage.get(POPUP_EXPORT_SPEC_KEY);
  const rawSpec = stored[POPUP_EXPORT_SPEC_KEY];

  if (rawSpec === undefined) {
    const fallback = getDefaultExportSpec();
    return {
      ...fallback,
      filenameTemplate: normalizeFilenameTemplate(fallback.filenameTemplate),
    };
  }

  try {
    const spec = validateExportSpec(rawSpec);
    return {
      ...spec,
      filenameTemplate: normalizeFilenameTemplate(spec.filenameTemplate),
    };
  } catch {
    const fallback = getDefaultExportSpec();
    return {
      ...fallback,
      filenameTemplate: normalizeFilenameTemplate(fallback.filenameTemplate),
    };
  }
}

export async function requestCaptureData(
  captureId: string,
  apis: EditorApis = getChromeApis(),
): Promise<{ dataUrl?: string; metadata?: CaptureMetadata; sourceTabId?: number }> {
  return apis.runtime.sendMessage({
    type: 'GET_CAPTURE_DATA_URL',
    captureId,
  }) as Promise<{ dataUrl?: string; metadata?: CaptureMetadata; sourceTabId?: number }>;
}

export async function storeCaptureData(
  captureId: string,
  dataUrl: string,
  metadata: CaptureMetadata,
  sourceTabId: number | undefined,
  apis: EditorApis = getChromeApis(),
): Promise<void> {
  await apis.runtime.sendMessage({
    type: 'STORE_CAPTURE_DATA_URL',
    captureId,
    dataUrl,
    metadata,
    ...(typeof sourceTabId === 'number' ? { sourceTabId } : {}),
  });
}

export async function applyExportSpec(
  captureId: string,
  spec: ExportSpec,
  apis: EditorApis = getChromeApis(),
): Promise<ExportArtifact> {
  return apis.runtime.sendMessage({
    type: 'APPLY_EXPORT_SPEC',
    captureId,
    spec,
  }) as Promise<ExportArtifact>;
}

export async function exportToDownloads(
  captureId: string,
  spec: ExportSpec,
  apis: EditorApis = getChromeApis(),
): Promise<{ filename: string }> {
  return apis.runtime.sendMessage({
    type: 'EXPORT_DOWNLOAD',
    captureId,
    spec,
  }) as Promise<{ filename: string }>;
}

export async function exportCaptureBoard(
  captureIds: string[],
  spec: ExportSpec,
  apis: EditorApis = getChromeApis(),
): Promise<{ filename: string }> {
  return apis.runtime.sendMessage({
    type: 'EXPORT_CAPTURE_BOARD',
    captureIds,
    spec,
  }) as Promise<{ filename: string }>;
}

export async function runDomRedaction(
  tabId: number,
  apis: EditorApis = getChromeApis(),
): Promise<{ annotations: RedactAnnotation[] }> {
  return apis.runtime.sendMessage({
    type: 'RUN_DOM_REDACTION',
    tabId,
  }) as Promise<{ annotations: RedactAnnotation[] }>;
}

export async function openCaptureBoard(
  captureIds: string[],
  apis: EditorApis = getChromeApis(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  return apis.runtime.sendMessage({
    type: 'OPEN_CAPTURE_BOARD',
    captureIds,
  }) as Promise<{ ok: true } | { ok: false; error: string }>;
}

export async function loadImageFromDataUrl(dataUrl: string): Promise<LoadedEditorImage> {
  const image = new Image();
  image.decoding = 'async';

  return new Promise<LoadedEditorImage>((resolve, reject) => {
    image.onload = () => resolve(image as LoadedEditorImage);
    image.onerror = () => reject(new Error('Failed to load capture image'));
    image.src = dataUrl;
  });
}
