import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/background/offscreen-manager', () => ({
  ensureOffscreenDocument: vi.fn(() => Promise.resolve()),
  hasNativeOffscreenSupport: vi.fn(() => true),
  resetOffscreenIdleTimer: vi.fn(),
}));

vi.mock('../../src/background/heavy-handler', () => ({
  handleBackgroundHeavyMessage: vi.fn(async (message: { id: string }) => ({
    type: 'OFFSCREEN_RESULT',
    id: message.id,
    ok: true,
  })),
}));

import {
  __resetOffscreenAdapterForTests,
  initializeHeavyWorkerMessaging,
  sendToHeavyWorker,
} from '../../src/shared/heavy-worker-client.chromium';
import { handleBackgroundHeavyMessage } from '../../src/background/heavy-handler';
import { ensureOffscreenDocument, resetOffscreenIdleTimer } from '../../src/background/offscreen-manager';

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

  it('routes to the background-heavy path when native offscreen support is unavailable', async () => {
    const { runtime } = createRuntimeMock();
    vi.mocked(runtime.sendMessage).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: 'fallback-id',
      ok: true,
    });
    const { hasNativeOffscreenSupport } = await import('../../src/background/offscreen-manager');
    vi.mocked(hasNativeOffscreenSupport).mockReturnValue(false);

    const result = await sendToHeavyWorker(
      { type: 'OFFSCREEN_CLEAR_MEMORY' },
      runtime,
    );

    expect(ensureOffscreenDocument).toHaveBeenCalledTimes(1);
    expect(resetOffscreenIdleTimer).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(handleBackgroundHeavyMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OFFSCREEN_CLEAR_MEMORY',
        _target: 'background-heavy',
      }),
    );
  });
});
