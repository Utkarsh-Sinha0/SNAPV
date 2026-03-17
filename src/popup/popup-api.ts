import { getDefaultExportSpec, validateExportSpec } from '../shared/export-spec';
import { getWebExtensionNamespace } from '../shared/webextension-namespace';
import type {
  CaptureMetadata,
  ExportSpec,
  FeasibilityResult,
  LicenseState,
} from '../shared/types';

export type PopupCaptureCommand =
  | 'CAPTURE_VISIBLE'
  | 'CAPTURE_REGION'
  | 'CAPTURE_FULLPAGE';

export type PopupActionCommand =
  | 'EXPORT_CLIPBOARD'
  | 'EXPORT_DOWNLOAD'
  | 'OPEN_EDITOR'
  | 'RECAPTURE';

type RuntimeLike = {
  sendMessage: (message: unknown) => Promise<unknown>;
  getURL: (path: string) => string;
};

type StorageAreaLike = {
  get: (keys?: string | string[] | null | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

type TabsLike = {
  create: (createProperties: { url: string }) => Promise<unknown>;
  query: (queryInfo: { active: boolean; currentWindow: boolean }) => Promise<
    Array<{ id?: number }>
  >;
};

type ScriptingLike = {
  executeScript: (injection: {
    target: { tabId: number };
    func: () => unknown;
  }) => Promise<Array<{ result: unknown }>>;
};

export type PopupApis = {
  runtime: RuntimeLike;
  storage: StorageAreaLike;
  tabs: TabsLike;
  scripting: ScriptingLike;
};

const POPUP_EXPORT_SPEC_KEY = 'popup.exportSpec';
const FALLBACK_FILENAME_TEMPLATE = 'snapvault-{date}-{time}.{format}';
const LICENSE_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

function unwrapRuntimeResponse<T>(response: unknown): T {
  if (typeof response === 'object' && response !== null && '__error__' in response) {
    const error = (response as { __error__?: unknown }).__error__;
    throw new Error(typeof error === 'string' ? error : 'Extension request failed');
  }

  return response as T;
}

function getChromeApis(): PopupApis {
  const extensionApi = getWebExtensionNamespace<{
    runtime: RuntimeLike;
    storage: { local: StorageAreaLike };
    tabs: TabsLike;
    scripting: ScriptingLike;
  }>();

  return {
    runtime: extensionApi.runtime,
    storage: extensionApi.storage.local,
    tabs: extensionApi.tabs,
    scripting: extensionApi.scripting,
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

function buildDefaultSpec(): ExportSpec {
  const defaults = getDefaultExportSpec();
  return {
    ...defaults,
    filenameTemplate: normalizeFilenameTemplate(defaults.filenameTemplate),
  };
}

export async function loadStoredExportSpec(
  apis: PopupApis = getChromeApis(),
): Promise<ExportSpec> {
  const stored = await apis.storage.get(POPUP_EXPORT_SPEC_KEY);
  const rawSpec = stored[POPUP_EXPORT_SPEC_KEY];

  if (rawSpec === undefined) {
    return buildDefaultSpec();
  }

  try {
    const spec = validateExportSpec(rawSpec);
    return {
      ...spec,
      filenameTemplate: normalizeFilenameTemplate(spec.filenameTemplate),
    };
  } catch {
    return buildDefaultSpec();
  }
}

export async function saveStoredExportSpec(
  spec: ExportSpec,
  apis: PopupApis = getChromeApis(),
): Promise<void> {
  await apis.storage.set({
    [POPUP_EXPORT_SPEC_KEY]: {
      ...spec,
      filenameTemplate: normalizeFilenameTemplate(spec.filenameTemplate),
    },
  });
}

export async function loadLicenseState(
  apis: PopupApis = getChromeApis(),
): Promise<LicenseState> {
  const stored = await apis.storage.get('licenseState');
  return (stored.licenseState as LicenseState | undefined) ?? { status: 'free' };
}

export async function syncLicenseIfStale(
  apis: PopupApis = getChromeApis(),
  now = Date.now(),
): Promise<LicenseState | null> {
  const stored = await apis.storage.get('lastSyncedAt');
  const lastSyncedAt = stored.lastSyncedAt;

  if (typeof lastSyncedAt === 'number' && now - lastSyncedAt < LICENSE_SYNC_INTERVAL_MS) {
    return null;
  }

  const response = await apis.runtime.sendMessage({
    type: 'SYNC_LICENSE',
  });

  return unwrapRuntimeResponse<LicenseState>(response);
}

export async function getActiveTabId(
  apis: PopupApis = getChromeApis(),
): Promise<number> {
  const [activeTab] = await apis.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (typeof activeTab?.id !== 'number') {
    throw new Error('No active tab is available');
  }

  return activeTab.id;
}

export async function getCurrentTabMetadata(
  tabId: number,
  apis: PopupApis = getChromeApis(),
): Promise<CaptureMetadata> {
  const [result] = await apis.scripting.executeScript({
    target: { tabId },
    func: () => ({
      cssWidth: window.innerWidth,
      cssHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      screenLeft: window.screenLeft ?? 0,
      screenTop: window.screenTop ?? 0,
    }),
  });

  const metadata = result?.result as Omit<CaptureMetadata, 'lightMode' | 'capturedAt'>;

  return {
    cssWidth: metadata.cssWidth,
    cssHeight: metadata.cssHeight,
    devicePixelRatio: metadata.devicePixelRatio,
    screenLeft: metadata.screenLeft,
    screenTop: metadata.screenTop,
    lightMode: false,
    capturedAt: Date.now(),
  };
}

export async function requestFeasibility(
  spec: ExportSpec,
  metadata: CaptureMetadata,
  apis: PopupApis = getChromeApis(),
): Promise<FeasibilityResult> {
  const response = await apis.runtime.sendMessage({
    type: 'CHECK_FEASIBILITY',
    spec,
    metadata,
  });

  return unwrapRuntimeResponse<FeasibilityResult>(response);
}

function buildViewportRect(metadata: CaptureMetadata) {
  return {
    x: 0,
    y: 0,
    width: metadata.cssWidth,
    height: metadata.cssHeight,
  };
}

export async function runCapture(
  command: PopupCaptureCommand,
  tabId: number,
  spec: ExportSpec,
  metadata: CaptureMetadata,
  apis: PopupApis = getChromeApis(),
): Promise<{ captureId?: string; pending?: boolean }> {
  if (command === 'CAPTURE_VISIBLE') {
    const response = await apis.runtime.sendMessage({
      type: 'CAPTURE_VISIBLE',
      tabId,
      spec,
    });

    return unwrapRuntimeResponse<{ captureId: string }>(response);
  }

  if (command === 'CAPTURE_FULLPAGE') {
    const response = await apis.runtime.sendMessage({
      type: 'CAPTURE_FULLPAGE',
      tabId,
      spec,
      lightMode: spec.lightMode,
    });

    return unwrapRuntimeResponse<{ captureId: string }>(response);
  }

  const response = await apis.runtime.sendMessage({
    type: 'CAPTURE_REGION',
    tabId,
    spec,
    viewportRect: buildViewportRect(metadata),
  });

  return unwrapRuntimeResponse<{ captureId?: string; pending?: boolean }>(response);
}

export async function exportToClipboard(
  captureId: string,
  spec: ExportSpec,
  apis: PopupApis = getChromeApis(),
): Promise<void> {
  const response = await apis.runtime.sendMessage({
    type: 'EXPORT_CLIPBOARD',
    captureId,
    spec,
  });

  unwrapRuntimeResponse(response);
}

export async function exportToDownloads(
  captureId: string,
  spec: ExportSpec,
  apis: PopupApis = getChromeApis(),
): Promise<{ filename: string }> {
  const response = await apis.runtime.sendMessage({
    type: 'EXPORT_DOWNLOAD',
    captureId,
    spec,
  });

  return unwrapRuntimeResponse<{ filename: string }>(response);
}

export async function openEditor(
  captureId: string,
  apis: PopupApis = getChromeApis(),
): Promise<void> {
  await apis.tabs.create({
    url: apis.runtime.getURL(`editor.html?captureId=${encodeURIComponent(captureId)}`),
  });
}

export function getPopupApis(): PopupApis {
  return getChromeApis();
}
