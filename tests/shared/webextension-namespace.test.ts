import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWebExtensionNamespace } from '../../src/shared/webextension-namespace';

describe('getWebExtensionNamespace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers the browser namespace when it is available', () => {
    vi.stubGlobal('browser', { runtime: { id: 'browser-runtime' } });
    vi.stubGlobal('chrome', { runtime: { id: 'chrome-runtime' } });

    const namespace = getWebExtensionNamespace<{ runtime: { id: string } }>();

    expect(namespace.runtime.id).toBe('browser-runtime');
  });

  it('falls back to chrome when browser is unavailable', () => {
    vi.stubGlobal('chrome', { runtime: { id: 'chrome-runtime' } });

    const namespace = getWebExtensionNamespace<{ runtime: { id: string } }>();

    expect(namespace.runtime.id).toBe('chrome-runtime');
  });

  it('throws when no extension namespace exists', () => {
    expect(() => getWebExtensionNamespace()).toThrow('WebExtension APIs are unavailable');
  });
});
