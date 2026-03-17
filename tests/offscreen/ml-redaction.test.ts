import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ml-redaction', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('configures the local-only model environment on module load', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://snapvault/${path}`,
      },
    });

    const { env } = await import('../../src/offscreen/ml-redaction');

    expect(env.allowRemoteModels).toBe(false);
    expect(env.localModelPath).toBe('chrome-extension://snapvault/assets/ml/');
  });

  it('maps detections to ml annotations without fetching over the network', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://snapvault/${path}`,
      },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { __setMlPipelineLoader, runMlRedaction } = await import(
      '../../src/offscreen/ml-redaction'
    );
    __setMlPipelineLoader(async () => async () => [
      {
        label: 'face',
        score: 0.9,
        box: { xmin: 10, ymin: 20, xmax: 40, ymax: 80 },
      },
      {
        label: 'logo',
        score: 0.8,
        box: { xmin: 45, ymin: 30, xmax: 65, ymax: 70 },
      },
    ]);

    const result = await runMlRedaction('data:image/png;base64,AAAA');

    expect(result.annotations).toHaveLength(2);
    expect(result.annotations[0]).toEqual(
      expect.objectContaining({
        type: 'face',
        source: 'ml',
        rect: { x: 10, y: 20, w: 30, h: 60 },
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
