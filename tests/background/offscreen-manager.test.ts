import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetOffscreenManagerForTests,
  closeOffscreenDocument,
  ensureOffscreenDocument,
  nukeOffscreenMemory,
  OFFSCREEN_IDLE_TIMEOUT_MS,
  resetOffscreenIdleTimer,
} from '../../src/background/offscreen-manager';

describe('offscreen-manager', () => {
  const createDocument = vi.fn();
  const hasDocument = vi.fn();
  const closeDocument = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    createDocument.mockReset();
    hasDocument.mockReset();
    closeDocument.mockReset();
    Object.assign(globalThis, {
      chrome: {
        runtime: {
          getURL: (path: string) => `chrome-extension://test/${path}`,
        },
        offscreen: {
        Reason: {
          BLOBS: 'BLOBS',
          DOM_PARSER: 'DOM_PARSER',
        },
          createDocument,
          hasDocument,
          closeDocument,
        },
      },
    });
    __resetOffscreenManagerForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetOffscreenManagerForTests();
  });

  it('creates the offscreen document once even under concurrent calls', async () => {
    hasDocument.mockResolvedValue(false);
    let resolveCreate: (() => void) | undefined;
    createDocument.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const firstCall = ensureOffscreenDocument();
    const secondCall = ensureOffscreenDocument();
    await Promise.resolve();
    expect(createDocument).toHaveBeenCalledTimes(1);
    resolveCreate?.();

    await Promise.all([firstCall, secondCall]);

    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'chrome-extension://test/offscreen.html',
        reasons: ['BLOBS', 'DOM_PARSER'],
      }),
    );
  });

  it('closes the offscreen document and ignores missing-document errors', async () => {
    closeDocument.mockRejectedValueOnce(new Error('no document'));
    await expect(closeOffscreenDocument()).resolves.toBeUndefined();
    expect(closeDocument).toHaveBeenCalledTimes(1);
  });

  it('resets the idle timer so only one close happens', async () => {
    closeDocument.mockResolvedValue(undefined);

    resetOffscreenIdleTimer();
    vi.advanceTimersByTime(5_000);
    resetOffscreenIdleTimer();
    vi.advanceTimersByTime(OFFSCREEN_IDLE_TIMEOUT_MS - 1);
    expect(closeDocument).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();

    expect(closeDocument).toHaveBeenCalledTimes(1);
  });

  it('nukes offscreen memory immediately and cancels the timer', async () => {
    closeDocument.mockResolvedValue(undefined);

    resetOffscreenIdleTimer();
    await nukeOffscreenMemory();
    vi.advanceTimersByTime(OFFSCREEN_IDLE_TIMEOUT_MS);

    expect(closeDocument).toHaveBeenCalledTimes(1);
  });
});
