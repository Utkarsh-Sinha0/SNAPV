import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/offscreen-adapter', () => ({
  sendToHeavyWorker: vi.fn(),
}));

vi.mock('../../src/background/capture-service', () => ({
  handleGetCaptureDataUrl: vi.fn(),
}));

vi.mock('../../src/shared/browser', () => ({
  isFirefox: vi.fn(() => false),
}));

import {
  __resetExportArtifactCacheForTests,
  createDownloadTarget,
  handleApplyExportSpec,
  handleCheckFeasibility,
  handleExportClipboard,
  handleExportDownload,
  registerExportMessageHandlers,
  resolveFilenameTemplate,
} from '../../src/background/export-service';
import { handleGetCaptureDataUrl } from '../../src/background/capture-service';
import { isFirefox } from '../../src/shared/browser';
import { sendToHeavyWorker } from '../../src/shared/offscreen-adapter';
import type { CaptureMetadata, ExportSpec } from '../../src/shared/types';

const baseSpec: ExportSpec = {
  format: 'png',
  dimensions: { mode: 'preset', presetId: 'original' },
  dpiPolicy: 'device',
  filenameTemplate: 'screenshot-{date}-{time}.{format}',
};

const baseMetadata: CaptureMetadata = {
  cssWidth: 1200,
  cssHeight: 800,
  devicePixelRatio: 2,
  screenLeft: 0,
  screenTop: 0,
  lightMode: false,
  capturedAt: 123,
};

function createApis() {
  const runtimeListeners: Array<
    (
      message: unknown,
      sender: unknown,
      sendResponse: (response?: unknown) => void,
    ) => boolean | void
  > = [];

  return {
    runtimeListeners,
    apis: {
      runtime: {
        onMessage: {
          addListener: (callback: typeof runtimeListeners[number]) => {
            runtimeListeners.push(callback);
          },
        },
      },
      storage: {
        get: vi.fn(async () => ({
          licenseState: { status: 'free' },
        })),
      },
      downloads: {
        download: vi.fn(async () => 1),
      },
    },
  };
}

describe('export-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetExportArtifactCacheForTests();
    vi.mocked(handleGetCaptureDataUrl).mockResolvedValue({
      dataUrl: 'data:image/png;base64,capture',
      metadata: baseMetadata,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('applies export specs by loading the capture and forwarding the spec', async () => {
    const { apis } = createApis();
    vi.mocked(sendToHeavyWorker).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: '1',
      ok: true,
      data: {
        dataUrl: 'data:image/png;base64,encoded',
        mimeType: 'image/png',
      },
    });

    const result = await handleApplyExportSpec(
      { captureId: 'capture-1', spec: baseSpec },
      apis,
    );

    expect(handleGetCaptureDataUrl).toHaveBeenCalledWith({ captureId: 'capture-1' });
    expect(sendToHeavyWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OFFSCREEN_ENCODE',
        spec: baseSpec,
      }),
    );
    expect(result.dataUrl).toBe('data:image/png;base64,encoded');
  });

  it('downloads the encoded result with a resolved filename', async () => {
    const { apis } = createApis();
    vi.mocked(sendToHeavyWorker).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: '2',
      ok: true,
      data: {
        dataUrl: 'data:image/png;base64,encoded',
        mimeType: 'image/png',
      },
    });

    const result = await handleExportDownload(
      { captureId: 'capture-1', spec: baseSpec },
      apis,
      new Date('2026-03-16T07:08:09Z'),
    );

    expect(result.filename).toBe('screenshot-2026-03-16-07-08-09.png');
    expect(apis.downloads.download).toHaveBeenCalledWith({
      url: 'data:image/png;base64,encoded',
      filename: 'screenshot-2026-03-16-07-08-09.png',
    });
  });

  it('reuses the cached artifact from APPLY_EXPORT_SPEC when exporting downloads', async () => {
    const { apis } = createApis();
    vi.mocked(sendToHeavyWorker).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: 'cache-1',
      ok: true,
      data: {
        dataUrl: 'data:image/png;base64,encoded',
        mimeType: 'image/png',
      },
    });

    await handleApplyExportSpec(
      { captureId: 'capture-1', spec: baseSpec },
      apis,
    );
    await handleExportDownload(
      { captureId: 'capture-1', spec: baseSpec },
      apis,
      new Date('2026-03-16T07:08:09Z'),
    );

    expect(sendToHeavyWorker).toHaveBeenCalledTimes(1);
    expect(apis.downloads.download).toHaveBeenCalledWith({
      url: 'data:image/png;base64,encoded',
      filename: 'screenshot-2026-03-16-07-08-09.png',
    });
  });

  it('resolves filename templates', () => {
    const filename = resolveFilenameTemplate(
      'screenshot-{date}-{time}.{format}',
      'png',
      new Date('2026-03-16T07:08:09Z'),
    );

    expect(filename).toBe('screenshot-2026-03-16-07-08-09.png');
  });

  it('creates blob download targets on Firefox', async () => {
    vi.useFakeTimers();
    vi.mocked(isFirefox).mockReturnValue(true);
    const createObjectURL = vi.fn(() => 'blob:firefox-download');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: async () => new Blob(['A'], { type: 'image/png' }),
    })));
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });

    const target = await createDownloadTarget('data:image/png;base64,QQ==');

    expect(target.url).toBe('blob:firefox-download');
    target.cleanup?.();
    vi.runAllTimers();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:firefox-download');
  });

  it('appends the format extension when the template omits it', () => {
    const filename = resolveFilenameTemplate(
      'snapvault-{date}-{time}',
      'jpeg',
      new Date('2026-03-16T07:08:09Z'),
    );

    expect(filename).toBe('snapvault-2026-03-16-07-08-09.jpeg');
  });

  it('writes png blobs to the clipboard', async () => {
    const { apis } = createApis();
    vi.mocked(sendToHeavyWorker).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: '3',
      ok: true,
      data: {
        dataUrl: 'data:image/png;base64,QQ==',
        mimeType: 'image/png',
      },
    });
    const clipboardWrite = vi.fn(async () => undefined);
    class ClipboardItemMock {
      readonly data: Record<string, Blob>;

      constructor(data: Record<string, Blob>) {
        this.data = data;
      }
    }

    vi.stubGlobal('navigator', {
      clipboard: {
        write: clipboardWrite,
      },
    });
    vi.stubGlobal('ClipboardItem', ClipboardItemMock);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: async () => new Blob(['A'], { type: 'image/png' }),
    })));

    await handleExportClipboard(
      { captureId: 'capture-1', spec: { ...baseSpec, format: 'jpeg' } },
      apis,
    );

    expect(sendToHeavyWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.objectContaining({ format: 'png' }),
      }),
    );
    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    const clipboardWriteCalls = clipboardWrite.mock.calls as unknown as Array<[ClipboardItemMock[]]>;
    const clipboardItem = clipboardWriteCalls[0]![0][0]!;
    expect(clipboardItem).toBeInstanceOf(ClipboardItemMock);
    expect(clipboardItem.data['image/png']).toBeInstanceOf(Blob);
  });

  it('delegates feasibility checks directly', async () => {
    const result = await handleCheckFeasibility({
      spec: baseSpec,
      metadata: baseMetadata,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        blockingReasons: [],
      }),
    );
  });

  it('registers export runtime handlers', async () => {
    const { apis, runtimeListeners } = createApis();
    vi.mocked(sendToHeavyWorker).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: '4',
      ok: true,
      data: {
        dataUrl: 'data:image/png;base64,encoded',
        mimeType: 'image/png',
      },
    });
    registerExportMessageHandlers(apis);

    const response = await new Promise<unknown>((resolve) => {
      runtimeListeners[0](
        { type: 'APPLY_EXPORT_SPEC', captureId: 'capture-1', spec: baseSpec },
        {},
        resolve,
      );
    });

    expect(response).toEqual({
      dataUrl: 'data:image/png;base64,encoded',
      mimeType: 'image/png',
    });
  });
});
