import { processHeavyWorkerMessage } from '../offscreen/processor';
import type { HeavyWorkerRequest, HeavyWorkerResult } from '../shared/types';

type RuntimeLike = {
  onMessage: {
    addListener: (
      callback: (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void,
      ) => boolean | void,
    ) => void;
  };
};

let listenerRegistered = false;

function getRuntime(): RuntimeLike {
  return (globalThis as { chrome?: { runtime?: RuntimeLike } }).chrome
    ?.runtime as RuntimeLike;
}

export async function handleBackgroundPageHeavyMessage(
  message: HeavyWorkerRequest,
): Promise<HeavyWorkerResult> {
  return processHeavyWorkerMessage(message, {
    remember: () => undefined,
    clear: () => undefined,
  });
}

export function registerBackgroundPageMessageListener(
  runtime: RuntimeLike = getRuntime(),
): void {
  if (listenerRegistered) {
    return;
  }

  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const payload = message as HeavyWorkerRequest;
    if (payload._target !== 'background-heavy' || typeof payload.id !== 'string') {
      return;
    }

    void handleBackgroundPageHeavyMessage(payload).then(sendResponse);
    return true;
  });

  listenerRegistered = true;
}

export function __resetBackgroundPageListenerForTests(): void {
  listenerRegistered = false;
}

if (
  (globalThis as { chrome?: { runtime?: RuntimeLike } }).chrome?.runtime?.onMessage
) {
  registerBackgroundPageMessageListener();
}
