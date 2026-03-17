import { beforeEach, describe, expect, it, vi } from 'vitest';

const pipelineSpy = vi.fn();
const mockedTransformersEnv = {
  allowRemoteModels: true,
  allowLocalModels: false,
  localModelPath: '',
  backends: {
    onnx: {
      wasm: {
        wasmPaths: '',
        proxy: true,
      },
    },
  },
};

vi.mock('@huggingface/transformers', () => ({
  env: mockedTransformersEnv,
  pipeline: pipelineSpy,
}));

describe('ml-redaction', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    mockedTransformersEnv.allowRemoteModels = true;
    mockedTransformersEnv.allowLocalModels = false;
    mockedTransformersEnv.localModelPath = '';
    mockedTransformersEnv.backends.onnx.wasm.wasmPaths = '';
    mockedTransformersEnv.backends.onnx.wasm.proxy = true;
  });

  it('configures the local-only model environment on module load', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://snapvault/${path}`,
      },
    });

    const { env } = await import('../../src/offscreen/ml-redaction');

    expect(env.allowRemoteModels).toBe(false);
    expect(env.allowLocalModels).toBe(true);
    expect(env.localModelPath).toBe('chrome-extension://snapvault/assets/ml/');
    expect(env.backends.onnx.wasm?.wasmPaths).toEqual({
      mjs: 'chrome-extension://snapvault/assets/ml/wasm/ort-wasm-simd-threaded.mjs',
      wasm: 'chrome-extension://snapvault/assets/ml/wasm/ort-wasm-simd-threaded.wasm',
    });
    expect(env.backends.onnx.wasm?.proxy).toBe(false);
  });

  it('loads the bundled pipeline once and maps detections without remote fetches', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://snapvault/${path}`,
      },
    });
    const fetchSpy = vi.fn(async (url: string) => ({
      blob: async () => new Blob([url], { type: 'image/png' }),
    }));
    vi.stubGlobal('fetch', fetchSpy);
    const createImageBitmapSpy = vi.fn(async () => ({
      close: vi.fn(),
    }));
    vi.stubGlobal('createImageBitmap', createImageBitmapSpy);

    pipelineSpy.mockResolvedValue(async () => [
      {
        label: 'person',
        score: 0.9,
        box: { xmin: 10, ymin: 20, xmax: 40, ymax: 80 },
      },
      {
        label: 'logo',
        score: 0.8,
        box: { xmin: 45, ymin: 30, xmax: 65, ymax: 70 },
      },
    ]);

    const { runMlRedaction } = await import('../../src/offscreen/ml-redaction');
    const firstResult = await runMlRedaction('data:image/png;base64,AAAA');
    const secondResult = await runMlRedaction('data:image/png;base64,BBBB');

    expect(firstResult.annotations).toHaveLength(2);
    expect(firstResult.annotations[0]).toEqual(
      expect.objectContaining({
        type: 'face',
        source: 'ml',
        rect: { x: 10, y: 20, w: 30, h: 60 },
      }),
    );
    expect(secondResult.annotations[1]).toEqual(
      expect.objectContaining({
        type: 'logo',
        rect: { x: 45, y: 30, w: 20, h: 40 },
      }),
    );
    expect(pipelineSpy).toHaveBeenCalledTimes(1);
    expect(pipelineSpy).toHaveBeenCalledWith('object-detection', 'redaction', {
      device: 'wasm',
      dtype: 'q8',
    });
    expect(createImageBitmapSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(
      fetchSpy.mock.calls.some(([url]) => /^https?:/i.test(String(url))),
    ).toBe(false);
  });
});
