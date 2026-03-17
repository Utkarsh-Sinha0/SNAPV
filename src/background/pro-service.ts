import {
  generateInstallationId,
  ensureTabContentScript,
  handleCaptureRegion,
  handleGetCaptureDataUrl,
} from './capture-service';
import { createDownloadTarget, resolveFilenameTemplate } from './export-service';
import { sendToHeavyWorker } from '../shared/offscreen-adapter';
import { buildCleanCaptureCSS } from '../shared/clean-capture';
import { assertNoPixelPayload } from '../shared/assert-no-pixel-payload';
import { assertProLicense, ProRequiredError } from '../shared/pro';
import { getWebExtensionNamespace } from '../shared/webextension-namespace';
import type {
  CaptureMetadata,
  ExportArtifact,
  ExportSpec,
  HeavyWorkerResult,
  LicenseState,
  RectLike,
  RedactAnnotation,
} from '../shared/types';

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
  getURL?: (path: string) => string;
};

type StorageAreaLike = {
  get: (keys?: string | string[] | null | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

type TabsLike = {
  captureVisibleTab: (
    windowId?: number,
    options?: { format?: 'png' | 'jpeg' },
  ) => Promise<string>;
  sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
  create?: (createProperties: { url: string }) => Promise<unknown>;
};

type DownloadsLike = {
  download: (options: { url: string; filename: string }) => Promise<number>;
};

type ScriptingLike = {
  executeScript: (injection: {
    target: { tabId: number };
    func: (...args: unknown[]) => unknown;
    args?: unknown[];
  }) => Promise<Array<{ result: unknown }>>;
};

type ProApis = {
  runtime: RuntimeLike;
  storage: StorageAreaLike;
  tabs: TabsLike;
  downloads: DownloadsLike;
  scripting: ScriptingLike;
};

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

type LicensingDeps = {
  fetch: FetchLike;
  now: () => number;
  baseUrl: string;
};

type CaptureBoardPayload = {
  captureIds: string[];
  spec: ExportSpec;
};

const DEFAULT_LICENSING_BASE_URL = 'http://127.0.0.1:8787';
const LICENSE_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

function getApis(): ProApis {
  const extensionApi = getWebExtensionNamespace<{
    runtime: RuntimeLike;
    storage: { local: StorageAreaLike };
    tabs: TabsLike;
    downloads: DownloadsLike;
    scripting: ScriptingLike;
  }>();

  return {
    runtime: extensionApi.runtime,
    storage: extensionApi.storage.local,
    tabs: extensionApi.tabs,
    downloads: extensionApi.downloads,
    scripting: extensionApi.scripting,
  };
}

function getLicensingDeps(): LicensingDeps {
  const globalConfig = globalThis as typeof globalThis & {
    SNAPVAULT_LICENSING_BASE_URL?: string;
    fetch?: FetchLike;
  };

  return {
    fetch: globalConfig.fetch ?? fetch,
    now: () => Date.now(),
    baseUrl: globalConfig.SNAPVAULT_LICENSING_BASE_URL ?? DEFAULT_LICENSING_BASE_URL,
  };
}

function buildLicensingUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

async function parseJsonResponse<T>(response: Awaited<ReturnType<FetchLike>>): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  const rawMessage = await response.text();
  throw new Error(rawMessage || `Licensing request failed with status ${response.status}`);
}

function normalizeLicenseState(
  raw: unknown,
  installationId: string,
): LicenseState {
  const payload = raw as Partial<LicenseState> | undefined;
  const status =
    payload?.status === 'pro' ||
    payload?.status === 'expired' ||
    payload?.status === 'free'
      ? payload.status
      : 'free';

  return {
    status,
    ...(typeof payload?.plan === 'string' ? { plan: payload.plan } : {}),
    ...(typeof payload?.expiresAt === 'string' ? { expiresAt: payload.expiresAt } : {}),
    installationId,
  };
}

async function getLicenseState(storage: StorageAreaLike): Promise<LicenseState> {
  const stored = await storage.get(['licenseState', 'installationId']);
  const installationId =
    typeof stored.installationId === 'string' ? stored.installationId : undefined;
  const licenseState = stored.licenseState as LicenseState | undefined;
  if (!licenseState) {
    return {
      status: 'free',
      ...(installationId ? { installationId } : {}),
    };
  }

  return {
    ...licenseState,
    ...(licenseState.installationId
      ? { installationId: licenseState.installationId }
      : installationId
        ? { installationId }
        : {}),
  };
}

async function requireProLicense(storage: StorageAreaLike): Promise<LicenseState> {
  const licenseState = await getLicenseState(storage);
  assertProLicense(licenseState);
  return licenseState;
}

async function validateSelectorsForTab(
  tabId: number,
  selectors: string[],
  apis: ProApis,
): Promise<string[]> {
  if (selectors.length === 0) {
    return [];
  }

  const [result] = await apis.scripting.executeScript({
    target: { tabId },
    func: (rawSelectors) => {
      return (rawSelectors as string[]).filter((selector) => {
        if (selector.trim().length === 0) {
          return false;
        }

        try {
          document.querySelector(selector);
          return true;
        } catch {
          return false;
        }
      });
    },
    args: [selectors],
  });

  return (result?.result as string[] | undefined) ?? [];
}

async function postLicensingJson<TResponse>(
  path: string,
  body: Record<string, unknown>,
  deps: LicensingDeps,
): Promise<TResponse> {
  assertNoPixelPayload(body);
  const response = await deps.fetch(buildLicensingUrl(deps.baseUrl, path), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return parseJsonResponse<TResponse>(response);
}

function requireRect(rect: RectLike | undefined): RectLike {
  if (!rect) {
    throw new Error('A capture rectangle is required');
  }

  return rect;
}

function requireSpec(spec: ExportSpec | undefined): ExportSpec {
  if (!spec) {
    throw new Error('An export spec is required');
  }

  return spec;
}

function requireArtifact(result: HeavyWorkerResult): ExportArtifact {
  if (!result.ok) {
    throw new Error(result.error ?? 'Heavy worker request failed');
  }

  const artifact = result.data as ExportArtifact | undefined;
  if (!artifact?.dataUrl || !artifact.mimeType) {
    throw new Error('Heavy worker result missing artifact data');
  }

  return artifact;
}

function requireDataUrl(result: HeavyWorkerResult): string {
  if (!result.ok) {
    throw new Error(result.error ?? 'Heavy worker request failed');
  }

  const data = result.data as { dataUrl?: string } | undefined;
  if (!data?.dataUrl) {
    throw new Error('Heavy worker result missing dataUrl');
  }

  return data.dataUrl;
}

export async function handleToggleCleanCapture(
  payload: {
    tabId: number;
    selectors?: string[];
    enabled?: boolean;
  },
  apis: ProApis = getApis(),
): Promise<{ ok: true; selectors: string[] }> {
  await requireProLicense(apis.storage);

  const validatedSelectors = await validateSelectorsForTab(
    payload.tabId,
    payload.selectors ?? [],
    apis,
  );

  await apis.storage.set({
    'cleanCapture.enabled': payload.enabled !== false,
    'cleanCapture.selectors': validatedSelectors,
  });

  await ensureTabContentScript(payload.tabId, apis);
  await apis.tabs.sendMessage(payload.tabId, {
    type: 'APPLY_CLEAN_CAPTURE',
    css:
      payload.enabled === false
        ? ''
        : buildCleanCaptureCSS(validatedSelectors),
  });

  return {
    ok: true,
    selectors: validatedSelectors,
  };
}

export async function handlePickDomElement(
  payload: { tabId: number; spec?: ExportSpec },
  apis: ProApis = getApis(),
): Promise<{ ok: true }> {
  await requireProLicense(apis.storage);
  await ensureTabContentScript(payload.tabId, apis);
  await apis.tabs.sendMessage(payload.tabId, {
    type: 'PICK_DOM_ELEMENT',
    tabId: payload.tabId,
    ...(payload.spec ? { spec: payload.spec } : {}),
  });
  return { ok: true };
}

export async function handlePickDomElementResult(
  payload: { tabId: number; rect?: RectLike; spec?: ExportSpec },
  apis: ProApis = getApis(),
): Promise<{ captureId: string }> {
  await requireProLicense(apis.storage);
  const result = await handleCaptureRegion(
    {
      tabId: payload.tabId,
      rect: requireRect(payload.rect),
      spec: requireSpec(payload.spec),
    },
    apis,
  );

  if (!result.captureId) {
    throw new Error('Region capture did not return a capture id');
  }

  return { captureId: result.captureId };
}

export async function handleRunDomRedaction(
  payload: { tabId: number },
  apis: ProApis = getApis(),
): Promise<{ annotations: RedactAnnotation[] }> {
  await requireProLicense(apis.storage);
  await ensureTabContentScript(payload.tabId, apis);
  return apis.tabs.sendMessage(payload.tabId, {
    type: 'RUN_DOM_REDACTION',
  }) as Promise<{ annotations: RedactAnnotation[] }>;
}

export async function handleRunMlRedaction(
  payload: { captureId: string },
  apis: ProApis = getApis(),
): Promise<{ ok: boolean; annotations?: RedactAnnotation[]; error?: string }> {
  const licenseState = await requireProLicense(apis.storage);
  const capture = await handleGetCaptureDataUrl({ captureId: payload.captureId }, apis);
  if (!capture.dataUrl) {
    throw new Error(`Capture not found: ${payload.captureId}`);
  }

  try {
    const result = await sendToHeavyWorker<HeavyWorkerResult>({
      type: 'OFFSCREEN_RUN_ML_REDACTION',
      dataUrl: capture.dataUrl,
      licenseState,
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? 'ML redaction failed',
      };
    }

    return {
      ok: true,
      annotations: (result.data as { annotations?: RedactAnnotation[] } | undefined)
        ?.annotations ?? [],
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleStartLicenseCheckout(
  payload: { plan: string; country?: string },
  apis: ProApis = getApis(),
  deps: LicensingDeps = getLicensingDeps(),
): Promise<{ url: string; installationId: string }> {
  const installationId = await generateInstallationId(apis);
  const body = {
    installationId,
    plan: payload.plan,
    ...(payload.country ? { country: payload.country } : {}),
  };
  const response = await postLicensingJson<{ url?: string }>(
    '/v1/licensing/checkout',
    body,
    deps,
  );

  if (!response.url) {
    throw new Error('Licensing checkout response missing url');
  }

  await apis.tabs.create?.({ url: response.url });
  return {
    url: response.url,
    installationId,
  };
}

export async function handleSyncLicense(
  _payload: Record<string, never> = {},
  apis: ProApis = getApis(),
  deps: LicensingDeps = getLicensingDeps(),
): Promise<LicenseState> {
  const installationId = await generateInstallationId(apis);
  const rawState = await postLicensingJson<unknown>(
    '/v1/licensing/sync',
    { installationId },
    deps,
  );
  const licenseState = normalizeLicenseState(rawState, installationId);

  await apis.storage.set({
    installationId,
    licenseState,
    licenseStatus: licenseState.status,
    licensePlan: licenseState.plan ?? null,
    licenseExpiresAt: licenseState.expiresAt ?? null,
    lastSyncedAt: deps.now(),
  });

  return licenseState;
}

export async function handleGetLicenseState(
  apis: ProApis = getApis(),
): Promise<LicenseState> {
  return getLicenseState(apis.storage);
}

export async function shouldSyncLicense(
  storage: StorageAreaLike,
  now: number,
): Promise<boolean> {
  const stored = await storage.get('lastSyncedAt');
  if (typeof stored.lastSyncedAt !== 'number') {
    return true;
  }

  return now - stored.lastSyncedAt >= LICENSE_SYNC_INTERVAL_MS;
}

export async function handleOpenCaptureBoard(
  payload: { captureIds: string[] },
  apis: ProApis = getApis(),
): Promise<{ ok: true }> {
  await requireProLicense(apis.storage);

  const url = apis.runtime.getURL?.(
    `editor.html?board=1&captureIds=${encodeURIComponent(payload.captureIds.join(','))}`,
  );
  if (!url || !apis.tabs.create) {
    return { ok: true };
  }

  await apis.tabs.create({ url });
  return { ok: true };
}

export async function handleExportCaptureBoard(
  payload: CaptureBoardPayload,
  apis: ProApis = getApis(),
  now = new Date(),
): Promise<{ filename: string }> {
  const licenseState = await requireProLicense(apis.storage);
  if (payload.captureIds.length === 0) {
    throw new Error('At least one capture is required');
  }

  const captures = await Promise.all(
    payload.captureIds.map((captureId) => handleGetCaptureDataUrl({ captureId }, apis)),
  );
  const firstCapture = captures[0];
  if (!firstCapture.dataUrl || !firstCapture.metadata) {
    throw new Error(`Capture not found: ${payload.captureIds[0]}`);
  }

  const segments = captures.map((capture, index) => {
    if (!capture.dataUrl) {
      throw new Error(`Capture not found: ${payload.captureIds[index]}`);
    }
    return capture.dataUrl;
  });

  const metadata = firstCapture.metadata as CaptureMetadata;
  const stitched = await sendToHeavyWorker<HeavyWorkerResult>({
    type: 'OFFSCREEN_STITCH',
    segments,
    metadata,
    stepPx: metadata.cssHeight,
    overlapPx: 0,
  });
  const encoded = await sendToHeavyWorker<HeavyWorkerResult>({
    type: 'OFFSCREEN_ENCODE',
    dataUrl: requireDataUrl(stitched),
    spec: payload.spec,
    metadata,
    licenseState,
  });
  const artifact = requireArtifact(encoded);
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

function asErrorResponse(error: unknown): { ok: false; error: string } {
  if (error instanceof ProRequiredError) {
    return { ok: false, error: error.message };
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function registerProMessageHandlers(apis: ProApis = getApis()): void {
  apis.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const payload = message as { type?: string; _target?: string };
    if (!payload.type || payload.type.startsWith('OFFSCREEN_') || payload._target) {
      return;
    }

    const handlers: Record<string, () => Promise<unknown>> = {
      TOGGLE_CLEAN_CAPTURE: () => handleToggleCleanCapture(payload as never, apis),
      PICK_DOM_ELEMENT: () => handlePickDomElement(payload as never, apis),
      PICK_DOM_ELEMENT_RESULT: () => handlePickDomElementResult(payload as never, apis),
      RUN_DOM_REDACTION: () => handleRunDomRedaction(payload as never, apis),
      RUN_ML_REDACTION: () => handleRunMlRedaction(payload as never, apis),
      START_LICENSE_CHECKOUT: () => handleStartLicenseCheckout(payload as never, apis),
      SYNC_LICENSE: () => handleSyncLicense(payload as never, apis),
      GET_LICENSE_STATE: () => handleGetLicenseState(apis),
      OPEN_CAPTURE_BOARD: () => handleOpenCaptureBoard(payload as never, apis),
      EXPORT_CAPTURE_BOARD: () => handleExportCaptureBoard(payload as never, apis),
    };

    const handler = handlers[payload.type];
    if (!handler) {
      return;
    }

    void handler()
      .then(sendResponse)
      .catch((error) => sendResponse(asErrorResponse(error)));
    return true;
  });
}
