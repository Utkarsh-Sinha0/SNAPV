import { afterEach, describe, expect, it, vi } from 'vitest';

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value,
    configurable: true,
  });
}

describe('isFirefox', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('returns false for a Chrome-like user agent when browser is unavailable', async () => {
    vi.stubGlobal('browser', undefined);
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
    );

    const { isFirefox } = await import('../../src/shared/browser');

    expect(isFirefox()).toBe(false);
  });

  it('returns true for a Firefox user agent', async () => {
    vi.stubGlobal('browser', undefined);
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0',
    );

    const { isFirefox } = await import('../../src/shared/browser');

    expect(isFirefox()).toBe(true);
  });

  it('returns false when a browser global exists without Firefox-only APIs', async () => {
    vi.stubGlobal('browser', {
      runtime: {},
    });
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
    );

    const { isFirefox } = await import('../../src/shared/browser');

    expect(isFirefox()).toBe(false);
  });

  it('returns true when Firefox browser APIs are present', async () => {
    vi.stubGlobal('browser', {
      runtime: {
        getBrowserInfo: () => Promise.resolve({ name: 'Firefox' }),
      },
    });
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
    );

    const { isFirefox } = await import('../../src/shared/browser');

    expect(isFirefox()).toBe(true);
  });
});
