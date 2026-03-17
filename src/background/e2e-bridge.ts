import {
  handleStoreCaptureDataUrl,
  handleOpenEditor,
} from './capture-service';
import { sendToHeavyWorker } from '../shared/offscreen-adapter';
import { getWebExtensionNamespace } from '../shared/webextension-namespace';
import type {
  CaptureMetadata,
  ExportSpec,
  HeavyWorkerResult,
  LicenseState,
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
  captureTab?: (
    tabId: number,
    options?: { format?: 'png' | 'jpeg' },
  ) => Promise<string>;
  sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
  create?: (createProperties: { url: string }) => Promise<unknown>;
  update: (tabId: number, updateProperties: { active?: boolean }) => Promise<unknown>;
};

type ScriptingLike = {
  executeScript: (injection: {
    target: { tabId: number };
    func: (...args: unknown[]) => unknown;
    args?: unknown[];
  }) => Promise<Array<{ result: unknown }>>;
};

type WindowsLike = {
  update: (windowId: number, updateInfo: { focused?: boolean }) => Promise<unknown>;
};

type CaptureApisLike = {
  runtime: RuntimeLike;
  storage: StorageAreaLike;
  tabs: TabsLike;
  scripting: ScriptingLike;
};

type BridgeApis = CaptureApisLike & {
  windows: WindowsLike;
};

type BackgroundE2EBridge = {
  captureVisible: (payload: {
    tabId: number;
    windowId: number;
    spec: ExportSpec;
  }) => Promise<{ captureId: string }>;
  captureFullPage: (payload: {
    tabId: number;
    windowId: number;
    spec: ExportSpec;
    lightMode?: boolean;
  }) => Promise<{ captureId: string }>;
  openEditor: (payload: { captureId: string }) => Promise<{ ok: true }>;
  setLicenseState: (licenseState: LicenseState) => Promise<void>;
};

const CAPTURE_STEP_DELAY_MS = 550;

function getApis(): BridgeApis {
  const extensionApi = getWebExtensionNamespace<{
    runtime: RuntimeLike;
    storage: { local: StorageAreaLike };
    tabs: TabsLike;
    scripting: ScriptingLike;
    windows: WindowsLike;
  }>();

  return {
    runtime: extensionApi.runtime,
    storage: extensionApi.storage.local,
    tabs: extensionApi.tabs,
    scripting: extensionApi.scripting,
    windows: extensionApi.windows,
  };
}

function createCaptureId(): string {
  return crypto.randomUUID();
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getCaptureMetadata(
  tabId: number,
  apis: BridgeApis,
  lightMode = false,
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

async function captureTabDataUrl(
  tabId: number,
  apis: BridgeApis,
  windowId?: number,
): Promise<string> {
  if (apis.tabs.captureTab) {
    return apis.tabs.captureTab(tabId, { format: 'png' });
  }

  if (typeof windowId !== 'number') {
    throw new Error('windowId is required when captureTab is unavailable');
  }

  await apis.windows.update(windowId, { focused: true });
  await apis.tabs.update(tabId, { active: true });
  await delay(800);
  return apis.tabs.captureVisibleTab(undefined, { format: 'png' });
}

async function captureVisibleWithCaptureTab(
  tabId: number,
  apis: BridgeApis,
  spec: ExportSpec,
  windowId?: number,
): Promise<{ captureId: string }> {
  const [dataUrl, metadata] = await Promise.all([
    captureTabDataUrl(tabId, apis, windowId),
    getCaptureMetadata(tabId, apis),
  ]);
  const captureId = createCaptureId();
  await handleStoreCaptureDataUrl(
    { captureId, dataUrl, metadata, sourceTabId: tabId },
    apis,
  );

  await apis.tabs.sendMessage(tabId, {
    type: 'SHOW_CAPTURE_ACTION_BAR',
    captureId,
    tabId,
    captureMode: 'visible',
    spec,
  }).catch(() => undefined);

  return { captureId };
}

async function captureFullPageWithCaptureTab(
  tabId: number,
  apis: BridgeApis,
  spec: ExportSpec,
  lightMode = false,
  windowId?: number,
): Promise<{ captureId: string }> {
  const [measurement] = await apis.scripting.executeScript({
    target: { tabId },
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
        target: { tabId },
        func: (position) => {
          window.scrollTo(0, position as number);
          return position;
        },
        args: [top],
      });
      segments.push(await captureTabDataUrl(tabId, apis, windowId));
      if (top !== positions[positions.length - 1]) {
        await delay(CAPTURE_STEP_DELAY_MS);
      }
    }
  } finally {
    await apis.scripting.executeScript({
      target: { tabId },
      func: (x, y) => {
        window.scrollTo((x as number) ?? 0, (y as number) ?? 0);
      },
      args: [scrollX, scrollY],
    });
  }

  const metadata = await getCaptureMetadata(tabId, apis, lightMode);
  const fullPageMetadata: CaptureMetadata = {
    ...metadata,
    cssHeight: Math.max(metadata.cssHeight, scrollHeight),
  };
  const stitched = await sendToHeavyWorker<HeavyWorkerResult>({
    type: 'OFFSCREEN_STITCH',
    segments,
    metadata: fullPageMetadata,
    spec,
    stepPx: Math.round(viewportHeight * metadata.devicePixelRatio),
    overlapPx: 0,
  });
  const captureId = createCaptureId();
  await handleStoreCaptureDataUrl(
    {
      captureId,
      dataUrl: await getWorkerDataUrl(stitched),
      metadata: fullPageMetadata,
      sourceTabId: tabId,
    },
    apis,
  );

  return { captureId };
}

export function registerBackgroundE2EBridge(apis: BridgeApis = getApis()): void {
  (globalThis as typeof globalThis & { __snapvaultE2EBridge?: BackgroundE2EBridge })
    .__snapvaultE2EBridge = {
    captureVisible: async ({ tabId, windowId, spec }) => {
      return captureVisibleWithCaptureTab(tabId, apis, spec, windowId);
    },
    captureFullPage: async ({ tabId, windowId, spec, lightMode }) => {
      return captureFullPageWithCaptureTab(
        tabId,
        apis,
        spec,
        lightMode,
        windowId,
      );
    },
    openEditor: async ({ captureId }) => handleOpenEditor({ captureId }, apis as CaptureApisLike),
    setLicenseState: async (licenseState) => {
      await apis.storage.set({
        licenseState,
        licenseStatus: licenseState.status,
        licensePlan: licenseState.plan ?? null,
        licenseExpiresAt: licenseState.expiresAt ?? null,
      });
    },
  };
}
