import { beforeEach, describe, expect, it } from 'vitest';

import {
  __resetOffscreenListenerForTests,
  getHeldReferenceCount,
  registerOffscreenMessageListener,
  rememberOffscreenReference,
} from '../../src/offscreen/runtime.chromium';

describe('offscreen listener', () => {
  beforeEach(() => {
    __resetOffscreenListenerForTests();
  });

  it('responds ok and clears held references for OFFSCREEN_CLEAR_MEMORY', async () => {
    const listeners: Array<
      (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void,
      ) => boolean | void
    > = [];
    const sentMessages: unknown[] = [];
    const runtime = {
      onMessage: {
        addListener: (
          callback: (
            message: unknown,
            sender: unknown,
            sendResponse: (response?: unknown) => void,
          ) => boolean | void,
        ) => {
          listeners.push(callback);
        },
      },
      sendMessage: async (message: unknown) => {
        sentMessages.push(message);
        return undefined;
      },
    };

    registerOffscreenMessageListener(runtime);
    rememberOffscreenReference({ foo: 'bar' });
    expect(getHeldReferenceCount()).toBe(1);

    const response = await new Promise<unknown>((resolve) => {
      listeners[0](
        {
          type: 'OFFSCREEN_CLEAR_MEMORY',
          id: 'abc',
          _target: 'offscreen',
        },
        {},
        resolve,
      );
    });

    expect(response).toEqual({
      type: 'OFFSCREEN_RESULT',
      id: 'abc',
      ok: true,
    });
    expect(sentMessages).toEqual([
      {
        type: 'OFFSCREEN_RESULT',
        id: 'abc',
        ok: true,
      },
    ]);
    expect(getHeldReferenceCount()).toBe(0);
  });
});
