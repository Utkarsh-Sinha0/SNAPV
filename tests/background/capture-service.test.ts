import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/offscreen-adapter', () => ({
  sendToHeavyWorker: vi.fn(),
}));

vi.mock('../../src/background/offscreen-manager', () => ({
  nukeOffscreenMemory: vi.fn(() => Promise.resolve()),
}));

import {
  __resetCaptureServiceForTests,
  generateInstallationId,
  handleCaptureFullPage,
  handleOpenEditor,
  handleCaptureRegion,
  handleRecapture,
  handleCaptureScrollContainer,
  handleCaptureVisible,
  handleDeleteCapture,
  handleGetCaptureDataUrl,
  handleNukeAllCaptures,
  handlePurgeExpiredCaptures,
  handleStoreCaptureDataUrl,
  registerCaptureMessageHandlers,
  scheduleStartupCaptureTasks,
} from '../../src/background/capture-service';
import { nukeOffscreenMemory } from '../../src/background/offscreen-manager';
import { sendToHeavyWorker } from '../../src/shared/offscreen-adapter';
import type { CaptureMetadata, ExportSpec } from '../../src/shared/types';

const baseSpec: ExportSpec = {
  format: 'png',
  dimensions: { mode: 'preset', presetId: 'original' },
  dpiPolicy: 'css1x',
  filenameTemplate: 'snapvault-{timestamp}',
};

const baseMetadata = {
  cssWidth: 1200,
  cssHeight: 800,
  devicePixelRatio: 2,
  screenLeft: 10,
  screenTop: 20,
};

function createApis(initialStorage: Record<string, unknown> = {}) {
  const storageState = { ...initialStorage };
  const runtimeListeners: Array<
    (
      message: unknown,
      sender: unknown,
      sendResponse: (response?: unknown) => void,
    ) => boolean | void
  > = [];
  const storage = {
    get: vi.fn(async (keys?: string | string[] | null | Record<string, unknown>) => {
      if (keys === null || keys === undefined) {
        return { ...storageState };
      }
      if (typeof keys === 'string') {
        return keys in storageState ? { [keys]: storageState[keys] } : {};
      }
      if (Array.isArray(keys)) {
        return Object.fromEntries(
          keys.filter((key) => key in storageState).map((key) => [key, storageState[key]]),
        );
      }

      return { ...storageState };
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(storageState, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete storageState[key];
      }
    }),
  };
  const tabs = {
    captureVisibleTab: vi.fn(async () => 'data:image/png;base64,visible'),
    sendMessage: vi.fn(async () => ({ ok: true })),
    create: vi.fn(async () => ({ id: 99 })),
  };
  const scripting = {
    executeScript: vi.fn(async (injection: { args?: unknown[] }) => {
      if (injection.args?.[0] === '.scrollable') {
        return [{ result: { scrollHeight: 1500, viewportHeight: 500, clientWidth: 640 } }];
      }

      if (typeof injection.args?.[0] === 'number') {
        return [{ result: injection.args[0] }];
      }

      if (
        typeof injection.args?.[0] === 'string' &&
        typeof injection.args?.[1] === 'number'
      ) {
        return [{ result: { selector: injection.args[0], top: injection.args[1] } }];
      }

      return [{ result: { ...baseMetadata, scrollHeight: 2400, viewportHeight: 800 } }];
    }),
  };
  const runtime = {
    onMessage: {
      addListener: (callback: typeof runtimeListeners[number]) => {
        runtimeListeners.push(callback);
      },
    },
    getURL: vi.fn((path: string) => `chrome-extension://snapvault/${path}`),
  };

  return {
    storageState,
    runtimeListeners,
    apis: { runtime, storage, tabs, scripting },
  };
}

describe('capture-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetCaptureServiceForTests();
  });

  afterEach(() => {
    __resetCaptureServiceForTests();
  });

  it('generates and reuses an installation id', async () => {
    const { apis, storageState } = createApis();

    const first = await generateInstallationId(apis);
    const second = await generateInstallationId(apis);

    expect(first).toBe(second);
    expect(storageState.installationId).toBe(first);
  });

  it('captures visible tabs and stores the data url', async () => {
    const { apis } = createApis({ 'privacySettings.storeCaptures': true });

    const result = await handleCaptureVisible({ tabId: 1, spec: baseSpec }, apis);
    const stored = await handleGetCaptureDataUrl(result, apis);

    expect(stored.dataUrl).toBe('data:image/png;base64,visible');
    expect(stored.metadata?.cssWidth).toBe(1200);
    expect(apis.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        type: 'SHOW_CAPTURE_ACTION_BAR',
        captureId: result.captureId,
        captureMode: 'visible',
      }),
    );
  });

  it('stores captures in memory always and in storage only when enabled', async () => {
    const metadata: CaptureMetadata = {
      ...baseMetadata,
      lightMode: false,
      capturedAt: 100,
    };
    const { apis, storageState } = createApis({ 'privacySettings.storeCaptures': false });

    await handleStoreCaptureDataUrl(
      { captureId: 'capture-1', dataUrl: 'data:test', metadata },
      apis,
    );
    expect(storageState['capture:capture-1']).toBeUndefined();

    const result = await handleGetCaptureDataUrl({ captureId: 'capture-1' }, apis);
    expect(result.dataUrl).toBe('data:test');
  });

  it('returns in-memory captures without querying storage', async () => {
    const metadata: CaptureMetadata = {
      ...baseMetadata,
      lightMode: false,
      capturedAt: 100,
    };
    const { apis } = createApis({ 'privacySettings.storeCaptures': false });

    await handleStoreCaptureDataUrl(
      { captureId: 'capture-2', dataUrl: 'data:test', metadata },
      apis,
    );
    vi.mocked(apis.storage.get).mockClear();

    const result = await handleGetCaptureDataUrl({ captureId: 'capture-2' }, apis);

    expect(result.dataUrl).toBe('data:test');
    expect(apis.storage.get).not.toHaveBeenCalled();
  });

  it('deletes captures from memory and storage', async () => {
    const metadata: CaptureMetadata = {
      ...baseMetadata,
      lightMode: false,
      capturedAt: 100,
    };
    const { apis, storageState } = createApis({ 'privacySettings.storeCaptures': true });

    await handleStoreCaptureDataUrl(
      { captureId: 'capture-3', dataUrl: 'data:test', metadata },
      apis,
    );
    await handleDeleteCapture({ captureId: 'capture-3' }, apis);

    expect(storageState['capture:capture-3']).toBeUndefined();
    expect(apis.storage.remove).toHaveBeenCalledWith('capture:capture-3');
  });

  it('purges expired captures based on captureExpiryDays', async () => {
    const { apis, storageState } = createApis({
      'privacySettings.captureExpiryDays': 7,
      'capture:old': {
        dataUrl: 'data:old',
        metadata: { ...baseMetadata, lightMode: false, capturedAt: 0 },
      },
      'capture:new': {
        dataUrl: 'data:new',
        metadata: {
          ...baseMetadata,
          lightMode: false,
          capturedAt: 6 * 24 * 60 * 60 * 1000,
        },
      },
    });

    const result = await handlePurgeExpiredCaptures(apis, 8 * 24 * 60 * 60 * 1000);

    expect(result.removedKeys).toEqual(['capture:old']);
    expect(storageState['capture:old']).toBeUndefined();
    expect(storageState['capture:new']).toBeDefined();
  });

  it('schedules purge on startup within one tick', async () => {
    const { apis } = createApis();
    vi.spyOn(globalThis, 'queueMicrotask');

    scheduleStartupCaptureTasks(apis);

    expect(queueMicrotask).toHaveBeenCalledTimes(1);
  });

  it('captures a region through the offscreen encoder', async () => {
    const { apis } = createApis({ 'privacySettings.storeCaptures': true });
    vi.mocked(sendToHeavyWorker).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: '1',
      ok: true,
      data: { dataUrl: 'data:image/png;base64,cropped' },
    });

    const result = await handleCaptureRegion(
      {
        tabId: 1,
        rect: { x: 10, y: 20, width: 200, height: 100 },
        spec: baseSpec,
      },
      apis,
    );
    const stored = await handleGetCaptureDataUrl(result, apis);

    expect(apis.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ type: 'CONFIRM_CAPTURE_REGION' }),
    );
    expect(sendToHeavyWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OFFSCREEN_ENCODE',
        rect: { x: 10, y: 20, width: 200, height: 100 },
      }),
    );
    expect(stored.dataUrl).toBe('data:image/png;base64,cropped');
    expect(stored.metadata).toEqual(
      expect.objectContaining({
        cssWidth: 200,
        cssHeight: 100,
      }),
    );
    expect(apis.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        type: 'SHOW_CAPTURE_ACTION_BAR',
        captureId: result.captureId,
        captureMode: 'region',
      }),
    );
  });

  it('opens the editor in a new tab for a capture id', async () => {
    const { apis } = createApis();

    await handleOpenEditor({ captureId: 'capture-42' }, apis);

    expect(apis.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://snapvault/editor.html?captureId=capture-42',
    });
  });

  it('recaptures visible captures directly and region captures via the content script', async () => {
    const { apis } = createApis({ 'privacySettings.storeCaptures': true });

    await handleRecapture(
      {
        tabId: 7,
        captureMode: 'visible',
        spec: baseSpec,
      },
      apis,
    );
    await handleRecapture(
      {
        tabId: 7,
        captureMode: 'region',
        spec: baseSpec,
      },
      apis,
    );

    expect(apis.tabs.captureVisibleTab).toHaveBeenCalled();
    expect(apis.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: 'CAPTURE_REGION',
        spec: baseSpec,
      }),
    );
  });

  it('captures a full page and forwards light mode in metadata', async () => {
    const { apis } = createApis({ 'privacySettings.storeCaptures': true });
    vi.mocked(sendToHeavyWorker).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: '2',
      ok: true,
      data: { dataUrl: 'data:image/png;base64,stitched' },
    });

    const result = await handleCaptureFullPage(
      { tabId: 1, spec: baseSpec, lightMode: true },
      apis,
    );
    const stored = await handleGetCaptureDataUrl(result, apis);

    expect(sendToHeavyWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OFFSCREEN_STITCH',
        metadata: expect.objectContaining({
          lightMode: true,
          cssHeight: 2400,
        }),
      }),
    );
    expect(stored.metadata).toEqual(
      expect.objectContaining({
        lightMode: true,
        cssHeight: 2400,
      }),
    );
  });

  it('captures a scroll container using the provided selector', async () => {
    const { apis } = createApis({ 'privacySettings.storeCaptures': true });
    vi.mocked(sendToHeavyWorker).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: '3',
      ok: true,
      data: { dataUrl: 'data:image/png;base64,container' },
    });

    const result = await handleCaptureScrollContainer(
      { tabId: 1, selector: '.scrollable', spec: baseSpec },
      apis,
    );
    const stored = await handleGetCaptureDataUrl(result, apis);

    expect(apis.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['.scrollable'],
      }),
    );
    expect(sendToHeavyWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OFFSCREEN_STITCH',
        selector: '.scrollable',
      }),
    );
    expect(stored.metadata).toEqual(
      expect.objectContaining({
        cssWidth: 640,
        cssHeight: 1500,
      }),
    );
  });

  it('nukes captures in the correct order', async () => {
    const { apis, storageState } = createApis({
      'capture:one': {
        dataUrl: 'data:one',
        metadata: { ...baseMetadata, lightMode: false, capturedAt: 1 },
      },
      'capture:two': {
        dataUrl: 'data:two',
        metadata: { ...baseMetadata, lightMode: false, capturedAt: 2 },
      },
    });

    await handleNukeAllCaptures(apis);

    expect(nukeOffscreenMemory).toHaveBeenCalledTimes(1);
    expect(apis.storage.remove).toHaveBeenCalledWith(['capture:one', 'capture:two']);
    expect(Object.keys(storageState).filter((key) => key.startsWith('capture:'))).toEqual([]);
  });

  it('registers runtime handlers for capture messages', async () => {
    const { apis, runtimeListeners } = createApis({ 'privacySettings.storeCaptures': true });
    registerCaptureMessageHandlers(apis);

    const response = await new Promise<unknown>((resolve) => {
      runtimeListeners[0](
        { type: 'GET_CAPTURE_DATA_URL', captureId: 'missing' },
        {},
        resolve,
      );
    });

    expect(response).toEqual({});
  });
});
