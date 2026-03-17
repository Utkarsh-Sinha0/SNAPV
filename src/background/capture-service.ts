import { nukeOffscreenMemory } from './offscreen-manager';
import { sendToHeavyWorker } from '../shared/offscreen-adapter';
import type {
  CaptureMetadata,
  CaptureRecord,
  ExportSpec,
  HeavyWorkerResult,
  RectLike,
} from '../shared/types';

type StorageAreaLike = {
  get: (keys?: string | string[] | null | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
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
  getURL?: (path: string) => string;
};

type TabsLike = {
  captureVisibleTab: (
    windowId?: number,
    options?: { format?: 'png' | 'jpeg' },
  ) => Promise<string>;
  sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
  create?: (createProperties: { url: string }) => Promise<unknown>;
};

type ScriptingLike = {
  executeScript: (injection: {
    target: { tabId: number };
    func: (...args: unknown[]) => unknown;
    args?: unknown[];
  }) => Promise<Array<{ result: unknown }>>;
};

type CaptureApis = {
  runtime: RuntimeLike;
  storage: StorageAreaLike;
  tabs: TabsLike;
  scripting: ScriptingLike;
};

const inMemoryCaptureCache = new Map<string, CaptureRecord>();
const CAPTURE_VISIBLE_TAB_DELAY_MS = 550;

function getApis(): CaptureApis {
  const chromeLike = (globalThis as unknown as {
    chrome: {
      runtime: RuntimeLike;
      storage: { local: StorageAreaLike };
      tabs: TabsLike;
      scripting: ScriptingLike;
    };
  }).chrome;

  return {
    runtime: chromeLike.runtime,
    storage: chromeLike.storage.local,
    tabs: chromeLike.tabs,
    scripting: chromeLike.scripting,
  };
}

function createCaptureKey(captureId: string): string {
  return `capture:${captureId}`;
}

function createCaptureId(): string {
  return crypto.randomUUID();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function sendTabMessageSafe(
  tabId: number,
  message: unknown,
  apis: CaptureApis,
): Promise<void> {
  try {
    await apis.tabs.sendMessage(tabId, message);
  } catch {
    // Ignore missing content script or transient tab messaging failures.
  }
}

function getPrivacyStoreCaptures(settings: Record<string, unknown>): boolean {
  if (typeof settings['privacySettings.storeCaptures'] === 'boolean') {
    return settings['privacySettings.storeCaptures'] as boolean;
  }

  const nested = settings.privacySettings as { storeCaptures?: boolean } | undefined;
  return nested?.storeCaptures ?? false;
}

function getCaptureExpiryDays(settings: Record<string, unknown>): number {
  if (typeof settings['privacySettings.captureExpiryDays'] === 'number') {
    return settings['privacySettings.captureExpiryDays'] as number;
  }

  const nested = settings.privacySettings as { captureExpiryDays?: number } | undefined;
  return nested?.captureExpiryDays ?? 7;
}

async function getCaptureMetadata(
  tabId: number,
  lightMode: boolean,
  apis: CaptureApis,
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
  const dimensions = result?.result as Omit<CaptureMetadata, 'lightMode' | 'capturedAt'>;

  return {
    cssWidth: dimensions.cssWidth,
    cssHeight: dimensions.cssHeight,
    devicePixelRatio: dimensions.devicePixelRatio,
    screenLeft: dimensions.screenLeft,
    screenTop: dimensions.screenTop,
    lightMode,
    capturedAt: Date.now(),
  };
}

function buildScrollPositions(totalHeight: number, viewportHeight: number): number[] {
  if (totalHeight <= viewportHeight) {
    return [0];
  }

  const positions: number[] = [];
  for (let top = 0; top < totalHeight; top += viewportHeight) {
    positions.push(top);
  }

  const lastPosition = Math.max(0, totalHeight - viewportHeight);
  if (positions[positions.length - 1] !== lastPosition) {
    positions.push(lastPosition);
  }

  return positions;
}

async function storeCaptureRecord(
  captureId: string,
  record: CaptureRecord,
  apis: CaptureApis,
): Promise<void> {
  inMemoryCaptureCache.set(captureId, record);
  const settings = await apis.storage.get(['privacySettings.storeCaptures', 'privacySettings']);
  if (!getPrivacyStoreCaptures(settings)) {
    return;
  }

  await apis.storage.set({
    [createCaptureKey(captureId)]: record,
  });
}

export async function generateInstallationId(apis: CaptureApis = getApis()): Promise<string> {
  const existing = await apis.storage.get('installationId');
  if (typeof existing.installationId === 'string' && existing.installationId.length > 0) {
    return existing.installationId;
  }

  const installationId = crypto.randomUUID();
  await apis.storage.set({ installationId });
  return installationId;
}

export async function handleStoreCaptureDataUrl(
  payload: {
    captureId: string;
    dataUrl: string;
    metadata: CaptureMetadata;
    sourceTabId?: number;
  },
  apis: CaptureApis = getApis(),
): Promise<{ ok: true }> {
  await storeCaptureRecord(
    payload.captureId,
    {
      dataUrl: payload.dataUrl,
      metadata: payload.metadata,
      ...(typeof payload.sourceTabId === 'number'
        ? { sourceTabId: payload.sourceTabId }
        : {}),
    },
    apis,
  );

  return { ok: true };
}

export async function handleGetCaptureDataUrl(
  payload: { captureId: string },
  apis: CaptureApis = getApis(),
): Promise<{ dataUrl?: string; metadata?: CaptureMetadata; sourceTabId?: number }> {
  const cached = inMemoryCaptureCache.get(payload.captureId);
  if (cached) {
    return cached;
  }

  const stored = await apis.storage.get(createCaptureKey(payload.captureId));
  const record = stored[createCaptureKey(payload.captureId)] as CaptureRecord | undefined;
  if (!record) {
    return {};
  }

  inMemoryCaptureCache.set(payload.captureId, record);
  return record;
}

export async function handleDeleteCapture(
  payload: { captureId: string },
  apis: CaptureApis = getApis(),
): Promise<{ ok: true }> {
  inMemoryCaptureCache.delete(payload.captureId);
  await apis.storage.remove(createCaptureKey(payload.captureId));
  return { ok: true };
}

export async function handlePurgeExpiredCaptures(
  apis: CaptureApis = getApis(),
  now = Date.now(),
): Promise<{ removedKeys: string[] }> {
  const stored = await apis.storage.get(null);
  const expiryDays = getCaptureExpiryDays(stored);
  const maxAgeMs = expiryDays * 24 * 60 * 60 * 1000;
  const removedKeys: string[] = [];

  for (const [key, value] of Object.entries(stored)) {
    if (!key.startsWith('capture:')) {
      continue;
    }

    const record = value as CaptureRecord;
    if (now - record.metadata.capturedAt <= maxAgeMs) {
      continue;
    }

    removedKeys.push(key);
    inMemoryCaptureCache.delete(key.slice('capture:'.length));
  }

  if (removedKeys.length > 0) {
    await apis.storage.remove(removedKeys);
  }

  return { removedKeys };
}

async function captureVisible(
  tabId: number,
  lightMode: boolean,
  apis: CaptureApis,
): Promise<{
  captureId: string;
  dataUrl: string;
  metadata: CaptureMetadata;
  sourceTabId: number;
}> {
  const captureId = createCaptureId();
  const [dataUrl, metadata] = await Promise.all([
    apis.tabs.captureVisibleTab(undefined, { format: 'png' }),
    getCaptureMetadata(tabId, lightMode, apis),
  ]);

  await handleStoreCaptureDataUrl({ captureId, dataUrl, metadata, sourceTabId: tabId }, apis);
  return { captureId, dataUrl, metadata, sourceTabId: tabId };
}

async function getWorkerDataUrl(result: HeavyWorkerResult): Promise<string> {
  if (!result.ok) {
    throw new Error(result.error ?? 'Heavy worker request failed');
  }

  const data = result.data as { dataUrl?: string } | undefined;
  if (!data?.dataUrl) {
    throw new Error('Heavy worker result missing dataUrl');
  }

  return data.dataUrl;
}

export async function handleCaptureVisible(
  payload: { tabId: number; spec: ExportSpec },
  apis: CaptureApis = getApis(),
): Promise<{ captureId: string }> {
  const result = await captureVisible(payload.tabId, false, apis);
  await sendTabMessageSafe(
    payload.tabId,
    {
      type: 'SHOW_CAPTURE_ACTION_BAR',
      captureId: result.captureId,
      tabId: payload.tabId,
      captureMode: 'visible',
      spec: payload.spec,
    },
    apis,
  );
  return { captureId: result.captureId };
}

export async function handleCaptureRegion(
  payload: { tabId: number; rect: RectLike; spec: ExportSpec },
  apis: CaptureApis = getApis(),
): Promise<{ captureId: string }> {
  await sendTabMessageSafe(payload.tabId, {
    type: 'CONFIRM_CAPTURE_REGION',
    rect: payload.rect,
  }, apis);

  const visible = await captureVisible(payload.tabId, false, apis);
  const cropped = await sendToHeavyWorker<HeavyWorkerResult>({
    type: 'OFFSCREEN_ENCODE',
    dataUrl: visible.dataUrl,
    rect: payload.rect,
    spec: payload.spec,
    metadata: visible.metadata,
  });
  const dataUrl = await getWorkerDataUrl(cropped);
  const regionMetadata: CaptureMetadata = {
    ...visible.metadata,
    cssWidth: payload.rect.width,
    cssHeight: payload.rect.height,
  };

  await handleStoreCaptureDataUrl(
    {
      captureId: visible.captureId,
      dataUrl,
      metadata: regionMetadata,
      sourceTabId: visible.sourceTabId,
    },
    apis,
  );

  await sendTabMessageSafe(
    payload.tabId,
    {
      type: 'SHOW_CAPTURE_ACTION_BAR',
      captureId: visible.captureId,
      tabId: payload.tabId,
      captureMode: 'region',
      spec: payload.spec,
    },
    apis,
  );

  return { captureId: visible.captureId };
}

export async function handleOpenEditor(
  payload: { captureId: string },
  apis: CaptureApis = getApis(),
): Promise<{ ok: true }> {
  const url = apis.runtime.getURL?.(`editor.html?captureId=${encodeURIComponent(payload.captureId)}`);
  if (!url || !apis.tabs.create) {
    return { ok: true };
  }

  await apis.tabs.create({ url });
  return { ok: true };
}

export async function handleRecapture(
  payload: {
    tabId: number;
    captureMode?: 'visible' | 'region';
    spec?: ExportSpec;
  },
  apis: CaptureApis = getApis(),
): Promise<{ ok: true }> {
  if (payload.captureMode === 'visible' && payload.spec) {
    await handleCaptureVisible(
      {
        tabId: payload.tabId,
        spec: payload.spec,
      },
      apis,
    );

    return { ok: true };
  }

  if (payload.captureMode === 'region' && payload.spec) {
    await sendTabMessageSafe(
      payload.tabId,
      {
        type: 'CAPTURE_REGION',
        tabId: payload.tabId,
        spec: payload.spec,
      },
      apis,
    );
  }

  return { ok: true };
}

export async function handleCaptureFullPage(
  payload: { tabId: number; spec: ExportSpec; lightMode?: boolean },
  apis: CaptureApis = getApis(),
): Promise<{ captureId: string }> {
  const [measurement] = await apis.scripting.executeScript({
    target: { tabId: payload.tabId },
    func: () => ({
      scrollHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }),
  });
  const { scrollHeight, viewportHeight, scrollX, scrollY } = measurement.result as {
    scrollHeight: number;
    viewportHeight: number;
    scrollX: number;
    scrollY: number;
  };
  const positions = buildScrollPositions(scrollHeight, viewportHeight);
  const segments: string[] = [];

  try {
    for (const top of positions) {
      await apis.scripting.executeScript({
        target: { tabId: payload.tabId },
        func: (position) => {
          window.scrollTo(0, position as number);
          return position;
        },
        args: [top],
      });
      segments.push(await apis.tabs.captureVisibleTab(undefined, { format: 'png' }));
      if (top !== positions[positions.length - 1]) {
        await delay(CAPTURE_VISIBLE_TAB_DELAY_MS);
      }
    }
  } finally {
    await apis.scripting.executeScript({
      target: { tabId: payload.tabId },
      func: (x, y) => {
        window.scrollTo((x as number) ?? 0, (y as number) ?? 0);
      },
      args: [scrollX, scrollY],
    });
  }

  const captureId = createCaptureId();
  const metadata = await getCaptureMetadata(payload.tabId, payload.lightMode ?? false, apis);
  const fullPageMetadata: CaptureMetadata = {
    ...metadata,
    cssHeight: Math.max(metadata.cssHeight, scrollHeight),
  };
  const stitched = await sendToHeavyWorker<HeavyWorkerResult>({
    type: 'OFFSCREEN_STITCH',
    segments,
    metadata: fullPageMetadata,
    spec: payload.spec,
    stepPx: Math.round(viewportHeight * metadata.devicePixelRatio),
    overlapPx: 0,
  });

  await handleStoreCaptureDataUrl(
    {
      captureId,
      dataUrl: await getWorkerDataUrl(stitched),
      metadata: fullPageMetadata,
      sourceTabId: payload.tabId,
    },
    apis,
  );

  return { captureId };
}

export async function handleCaptureScrollContainer(
  payload: { tabId: number; selector: string; spec: ExportSpec },
  apis: CaptureApis = getApis(),
): Promise<{ captureId: string }> {
  const [measurement] = await apis.scripting.executeScript({
    target: { tabId: payload.tabId },
    func: (selector) => {
      const element = document.querySelector(selector as string) as HTMLElement | null;
      if (!element) {
        throw new Error('Scrollable container not found');
      }
      const rect = element.getBoundingClientRect();

      return {
        scrollHeight: element.scrollHeight,
        viewportHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        originalScrollTop: element.scrollTop,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      };
    },
    args: [payload.selector],
  });

  const { scrollHeight, viewportHeight, clientWidth, originalScrollTop, rect } = measurement.result as {
    scrollHeight: number;
    viewportHeight: number;
    clientWidth?: number;
    originalScrollTop: number;
    rect: RectLike;
  };
  const positions = buildScrollPositions(scrollHeight, viewportHeight);
  const segments: string[] = [];
  const viewportMetadata = await getCaptureMetadata(payload.tabId, false, apis);

  try {
    for (const top of positions) {
      await apis.scripting.executeScript({
        target: { tabId: payload.tabId },
        func: (selector, position) => {
          const element = document.querySelector(selector as string) as HTMLElement | null;
          if (!element) {
            throw new Error('Scrollable container not found');
          }

          element.scrollTop = position as number;
          return { selector, top: element.scrollTop };
        },
        args: [payload.selector, top],
      });
      const segment = await apis.tabs.captureVisibleTab(undefined, { format: 'png' });
      const cropped = await sendToHeavyWorker<HeavyWorkerResult>({
        type: 'OFFSCREEN_ENCODE',
        dataUrl: segment,
        rect,
        metadata: viewportMetadata,
      });
      segments.push(await getWorkerDataUrl(cropped));
      if (top !== positions[positions.length - 1]) {
        await delay(CAPTURE_VISIBLE_TAB_DELAY_MS);
      }
    }
  } finally {
    await apis.scripting.executeScript({
      target: { tabId: payload.tabId },
      func: (selector, position, restoreMode) => {
        if (restoreMode !== 'restore-scroll-position') {
          return;
        }

        const element = document.querySelector(selector as string) as HTMLElement | null;
        if (element) {
          element.scrollTop = position as number;
        }
      },
      args: [payload.selector, originalScrollTop, 'restore-scroll-position'],
    });
  }

  const captureId = createCaptureId();
  const scrollMetadata: CaptureMetadata = {
    ...viewportMetadata,
    cssWidth: typeof rect.width === 'number'
      ? rect.width
      : typeof clientWidth === 'number'
        ? clientWidth
        : viewportMetadata.cssWidth,
    cssHeight: scrollHeight,
  };
  const stitched = await sendToHeavyWorker<HeavyWorkerResult>({
    type: 'OFFSCREEN_STITCH',
    segments,
    metadata: scrollMetadata,
    spec: payload.spec,
    stepPx: Math.round(viewportHeight * viewportMetadata.devicePixelRatio),
    overlapPx: 0,
  });

  await handleStoreCaptureDataUrl(
    {
      captureId,
      dataUrl: await getWorkerDataUrl(stitched),
      metadata: scrollMetadata,
      sourceTabId: payload.tabId,
    },
    apis,
  );

  return { captureId };
}

export async function handleNukeAllCaptures(
  apis: CaptureApis = getApis(),
): Promise<{ removedKeys: string[] }> {
  await nukeOffscreenMemory();
  const stored = await apis.storage.get(null);
  const captureKeys = Object.keys(stored).filter((key) => key.startsWith('capture:'));
  if (captureKeys.length > 0) {
    await apis.storage.remove(captureKeys);
  }
  inMemoryCaptureCache.clear();
  return { removedKeys: captureKeys };
}

export function registerCaptureMessageHandlers(
  apis: CaptureApis = getApis(),
): void {
  apis.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const payload = message as { type?: string; _target?: string };
    if (!payload.type || payload.type.startsWith('OFFSCREEN_') || payload._target) {
      return;
    }

    const handlers: Record<string, () => Promise<unknown>> = {
      CAPTURE_VISIBLE: () => handleCaptureVisible(payload as never, apis),
      STORE_CAPTURE_DATA_URL: () => handleStoreCaptureDataUrl(payload as never, apis),
      GET_CAPTURE_DATA_URL: () => handleGetCaptureDataUrl(payload as never, apis),
      DELETE_CAPTURE: () => handleDeleteCapture(payload as never, apis),
      PURGE_EXPIRED_CAPTURES: () => handlePurgeExpiredCaptures(apis),
      CAPTURE_REGION: () => handleCaptureRegion(payload as never, apis),
      CAPTURE_FULLPAGE: () => handleCaptureFullPage(payload as never, apis),
      CAPTURE_SCROLL_CONTAINER: () => handleCaptureScrollContainer(payload as never, apis),
      NUKE_ALL_CAPTURES: () => handleNukeAllCaptures(apis),
      OPEN_EDITOR: () => handleOpenEditor(payload as never, apis),
      RECAPTURE: () => handleRecapture(payload as never, apis),
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

export function scheduleStartupCaptureTasks(
  apis: CaptureApis = getApis(),
): void {
  queueMicrotask(() => {
    void handlePurgeExpiredCaptures(apis);
  });
}

export function __resetCaptureServiceForTests(): void {
  inMemoryCaptureCache.clear();
}
