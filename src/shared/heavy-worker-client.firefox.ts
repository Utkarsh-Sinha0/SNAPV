import type { HeavyWorkerRequest, HeavyWorkerResult } from './types';

type RuntimeLike = {
  sendMessage: (message: unknown) => Promise<unknown>;
};

function getRuntime(): RuntimeLike {
  return (globalThis as { chrome?: { runtime?: RuntimeLike } }).chrome
    ?.runtime as RuntimeLike;
}

function createRequestId(): string {
  return crypto.randomUUID();
}

async function getHandleBackgroundHeavyMessage() {
  const module = await import('../background/heavy-handler');
  return module.handleBackgroundHeavyMessage;
}

async function invokeBackgroundHeavyMessage(
  message: HeavyWorkerRequest & { id: string; _target: 'background-heavy' },
): Promise<HeavyWorkerResult> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      void getHandleBackgroundHeavyMessage()
        .then((handleBackgroundHeavyMessage) => handleBackgroundHeavyMessage(message))
        .then(resolve)
        .catch(reject);
    }, 0);
  });
}

export function initializeHeavyWorkerMessaging(): void {}

export async function sendToHeavyWorker<T extends HeavyWorkerResult>(
  message: HeavyWorkerRequest,
  _runtime: RuntimeLike = getRuntime(),
): Promise<T> {
  const response = (await invokeBackgroundHeavyMessage({
    ...message,
    id: message.id ?? createRequestId(),
    _target: 'background-heavy',
  })) as T;

  if (!response.ok) {
    throw new Error(response.error ?? 'Heavy worker request failed');
  }

  return response;
}

export function __resetOffscreenAdapterForTests(): void {}
