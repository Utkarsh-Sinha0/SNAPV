import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/offscreen-adapter', () => ({
  sendToHeavyWorker: vi.fn(),
}));

vi.mock('../../src/shared/assert-no-pixel-payload', () => ({
  assertNoPixelPayload: vi.fn(),
}));

vi.mock('../../src/shared/browser', () => ({
  isFirefox: vi.fn(() => false),
}));

import {
  __resetCaptureServiceForTests,
  handleStoreCaptureDataUrl,
} from '../../src/background/capture-service';
import {
  handleExportCaptureBoard,
  handleGetLicenseState,
  handleOpenCaptureBoard,
  handlePickDomElementResult,
  handleRunDomRedaction,
  handleStartLicenseCheckout,
  handleSyncLicense,
  registerProMessageHandlers,
} from '../../src/background/pro-service';
import { assertNoPixelPayload } from '../../src/shared/assert-no-pixel-payload';
import { sendToHeavyWorker } from '../../src/shared/offscreen-adapter';
import type { CaptureMetadata, ExportSpec } from '../../src/shared/types';

const baseMetadata: CaptureMetadata = {
  cssWidth: 1200,
  cssHeight: 800,
  devicePixelRatio: 1,
  screenLeft: 0,
  screenTop: 0,
  lightMode: false,
  capturedAt: 100,
};

const baseSpec: ExportSpec = {
  format: 'png',
  dimensions: { mode: 'preset', presetId: 'original' },
  dpiPolicy: 'device',
  filenameTemplate: 'snapvault-{date}-{time}.{format}',
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
    sendMessage: vi.fn(async () => ({ annotations: [] })),
    create: vi.fn(async () => ({ id: 88 })),
  };
  const downloads = {
    download: vi.fn(async () => 1),
  };
  const scripting = {
    executeScript: vi.fn(async () => [{ result: ['.valid-selector'] }]),
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
    apis: { runtime, storage, tabs, downloads, scripting },
  };
}

describe('pro-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetCaptureServiceForTests();
  });

  afterEach(() => {
    __resetCaptureServiceForTests();
  });

  it('returns a pro error before clean capture runs for free users', async () => {
    const { apis, runtimeListeners } = createApis({
      licenseState: { status: 'free' },
    });
    registerProMessageHandlers(apis);

    const response = await new Promise<unknown>((resolve) => {
      runtimeListeners[0](
        {
          type: 'TOGGLE_CLEAN_CAPTURE',
          tabId: 5,
          selectors: ['.valid-selector'],
        },
        {},
        resolve,
      );
    });

    expect(response).toEqual({
      ok: false,
      error: 'Pro license required',
    });
    expect(apis.storage.set).not.toHaveBeenCalled();
    expect(apis.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('filters invalid selectors before storing and applying clean capture css', async () => {
    const { apis, runtimeListeners, storageState } = createApis({
      licenseState: { status: 'pro' },
    });
    registerProMessageHandlers(apis);

    const response = await new Promise<unknown>((resolve) => {
      runtimeListeners[0](
        {
          type: 'TOGGLE_CLEAN_CAPTURE',
          tabId: 5,
          selectors: ['.valid-selector', '{{invalid}}'],
        },
        {},
        resolve,
      );
    });

    expect(response).toEqual({
      ok: true,
      selectors: ['.valid-selector'],
    });
    expect(storageState['cleanCapture.selectors']).toEqual(['.valid-selector']);
    expect(apis.tabs.sendMessage).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        type: 'APPLY_CLEAN_CAPTURE',
      }),
    );
  });

  it('forwards isolated element rects through the region capture flow', async () => {
    const { apis } = createApis({
      licenseState: { status: 'pro' },
      'privacySettings.storeCaptures': true,
    });
    vi.mocked(sendToHeavyWorker).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: 'crop-1',
      ok: true,
      data: { dataUrl: 'data:image/png;base64,cropped' },
    });

    await handlePickDomElementResult(
      {
        tabId: 3,
        rect: { x: 12, y: 24, width: 200, height: 100 },
        spec: baseSpec,
      },
      apis,
    );

    expect(sendToHeavyWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OFFSCREEN_ENCODE',
        rect: { x: 12, y: 24, width: 200, height: 100 },
      }),
    );
  });

  it('bootstraps the content script before DOM redaction messages', async () => {
    const { apis } = createApis({
      licenseState: { status: 'pro' },
    });

    await handleRunDomRedaction({ tabId: 9 }, apis);

    expect(apis.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 9 },
        args: [
          'chrome-extension://snapvault/content-scripts/content.js',
          '__snapvaultContentScriptReady',
        ],
      }),
    );
    expect(apis.tabs.sendMessage).toHaveBeenCalledWith(9, {
      type: 'RUN_DOM_REDACTION',
    });
  });

  it('opens the board editor only for pro users', async () => {
    const { apis } = createApis({
      licenseState: { status: 'pro' },
    });

    await handleOpenCaptureBoard({ captureIds: ['one', 'two'] }, apis);

    expect(apis.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://snapvault/editor.html?board=1&captureIds=one%2Ctwo',
    });
  });

  it('stitches then encodes board captures before downloading', async () => {
    const { apis } = createApis({
      licenseState: { status: 'pro' },
      'privacySettings.storeCaptures': true,
    });
    await handleStoreCaptureDataUrl(
      {
        captureId: 'one',
        dataUrl: 'data:image/png;base64,one',
        metadata: baseMetadata,
      },
      apis,
    );
    await handleStoreCaptureDataUrl(
      {
        captureId: 'two',
        dataUrl: 'data:image/png;base64,two',
        metadata: baseMetadata,
      },
      apis,
    );
    await handleStoreCaptureDataUrl(
      {
        captureId: 'three',
        dataUrl: 'data:image/png;base64,three',
        metadata: baseMetadata,
      },
      apis,
    );
    vi.mocked(sendToHeavyWorker)
      .mockResolvedValueOnce({
        type: 'OFFSCREEN_RESULT',
        id: 'stitch-1',
        ok: true,
        data: { dataUrl: 'data:image/png;base64,stitched' },
      })
      .mockResolvedValueOnce({
        type: 'OFFSCREEN_RESULT',
        id: 'encode-1',
        ok: true,
        data: {
          dataUrl: 'data:image/png;base64,encoded',
          mimeType: 'image/png',
        },
      });

    const result = await handleExportCaptureBoard(
      {
        captureIds: ['one', 'two', 'three'],
        spec: baseSpec,
      },
      apis,
      new Date('2026-03-17T12:00:00.000Z'),
    );

    expect(result.filename).toBe('snapvault-2026-03-17-12-00-00.png');
    expect(sendToHeavyWorker).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'OFFSCREEN_STITCH',
        segments: [
          'data:image/png;base64,one',
          'data:image/png;base64,two',
          'data:image/png;base64,three',
        ],
      }),
    );
    expect(sendToHeavyWorker).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'OFFSCREEN_ENCODE',
        dataUrl: 'data:image/png;base64,stitched',
      }),
    );
    expect(apis.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'data:image/png;base64,encoded',
      }),
    );
  });

  it('uses the stored installation id for checkout and opens the returned url', async () => {
    const { apis } = createApis({
      installationId: 'install-123',
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://checkout.example/session' }),
      text: async () => '',
    }));

    const result = await handleStartLicenseCheckout(
      {
        plan: 'monthly',
        country: 'IN',
      },
      apis,
      {
        fetch: fetchMock,
        now: () => 0,
        baseUrl: 'https://license.example',
      },
    );

    expect(assertNoPixelPayload).toHaveBeenCalledWith({
      installationId: 'install-123',
      plan: 'monthly',
      country: 'IN',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://license.example/v1/licensing/checkout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          installationId: 'install-123',
          plan: 'monthly',
          country: 'IN',
        }),
      }),
    );
    expect(apis.tabs.create).toHaveBeenCalledWith({
      url: 'https://checkout.example/session',
    });
    expect(result).toEqual({
      url: 'https://checkout.example/session',
      installationId: 'install-123',
    });
  });

  it('syncs the license state into storage and updates the cached status keys', async () => {
    const { apis, storageState } = createApis({
      installationId: 'install-123',
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'pro',
        plan: 'monthly',
        expiresAt: '2030-01-01T00:00:00.000Z',
      }),
      text: async () => '',
    }));

    const result = await handleSyncLicense(
      {},
      apis,
      {
        fetch: fetchMock,
        now: () => 987_654_321,
        baseUrl: 'https://license.example',
      },
    );

    expect(assertNoPixelPayload).toHaveBeenCalledWith({
      installationId: 'install-123',
    });
    expect(result).toEqual({
      status: 'pro',
      plan: 'monthly',
      expiresAt: '2030-01-01T00:00:00.000Z',
      installationId: 'install-123',
    });
    expect(storageState.licenseState).toEqual(result);
    expect(storageState.licenseStatus).toBe('pro');
    expect(storageState.licensePlan).toBe('monthly');
    expect(storageState.licenseExpiresAt).toBe('2030-01-01T00:00:00.000Z');
    expect(storageState.lastSyncedAt).toBe(987_654_321);
  });

  it('returns the cached license state without a network request', async () => {
    const { apis } = createApis({
      installationId: 'install-123',
      licenseState: {
        status: 'expired',
        plan: 'monthly',
      },
    });

    const result = await handleGetLicenseState(apis);

    expect(result).toEqual({
      status: 'expired',
      plan: 'monthly',
      installationId: 'install-123',
    });
  });
});
