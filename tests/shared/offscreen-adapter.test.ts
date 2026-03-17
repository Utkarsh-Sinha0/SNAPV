import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/browser', () => ({
  isFirefox: vi.fn(() => false),
}));

vi.mock('../../src/background/offscreen-manager', () => ({
  ensureOffscreenDocument: vi.fn(() => Promise.resolve()),
  hasNativeOffscreenSupport: vi.fn(() => true),
  resetOffscreenIdleTimer: vi.fn(),
}));

import {
  __resetOffscreenAdapterForTests,
  initializeHeavyWorkerMessaging,
  sendToHeavyWorker,
} from '../../src/shared/offscreen-adapter';
import { ensureOffscreenDocument, resetOffscreenIdleTimer } from '../../src/background/offscreen-manager';
import { isFirefox } from '../../src/shared/browser';

function createRuntimeMock() {
  const listeners: Array<
    (
      message: unknown,
      sender: unknown,
      sendResponse: (response?: unknown) => void,
    ) => boolean | void
  > = [];

  return {
    listeners,
    runtime: {
      onMessage: {
        addListener: (callback: (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void) => {
          listeners.push(callback);
        },
      },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('sendToHeavyWorker', () => {
  beforeEach(() => {
    __resetOffscreenAdapterForTests();
    vi.clearAllMocks();
    vi.mocked(isFirefox).mockReturnValue(false);
  });

  afterEach(() => {
    __resetOffscreenAdapterForTests();
  });

  it('ensures offscreen exists, resets idle timer, and resolves by correlation id', async () => {
    const { runtime, listeners } = createRuntimeMock();
    initializeHeavyWorkerMessaging(runtime);

    const promise = sendToHeavyWorker(
      { type: 'OFFSCREEN_CLEAR_MEMORY' },
      runtime,
    );
    await Promise.resolve();

    expect(ensureOffscreenDocument).toHaveBeenCalledTimes(1);
    expect(resetOffscreenIdleTimer).toHaveBeenCalledTimes(1);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);

    const sentMessage = vi.mocked(runtime.sendMessage).mock.calls[0][0] as {
      id: string;
      _target: string;
    };
    expect(sentMessage._target).toBe('offscreen');

    listeners[0](
      {
        type: 'OFFSCREEN_RESULT',
        id: sentMessage.id,
        ok: true,
      },
      {},
      () => undefined,
    );

    await expect(promise).resolves.toEqual({
      type: 'OFFSCREEN_RESULT',
      id: sentMessage.id,
      ok: true,
    });
  });

  it('routes to the background-heavy path on firefox', async () => {
    const { runtime } = createRuntimeMock();
    vi.mocked(isFirefox).mockReturnValue(true);
    vi.mocked(runtime.sendMessage).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: 'firefox-id',
      ok: true,
    });

    const result = await sendToHeavyWorker(
      { type: 'OFFSCREEN_CLEAR_MEMORY' },
      runtime,
    );

    expect(ensureOffscreenDocument).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(vi.mocked(runtime.sendMessage).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        _target: 'background-heavy',
      }),
    );
  });
});
