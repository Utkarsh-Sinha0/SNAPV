import { processHeavyWorkerMessage } from '../shared/heavy-worker-service.lazy';
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
  sendMessage: (message: unknown) => Promise<unknown>;
};

const heldReferences = new Set<unknown>();
let listenerRegistered = false;

async function emitResult(
  runtime: RuntimeLike,
  result: HeavyWorkerResult,
): Promise<HeavyWorkerResult> {
  await runtime.sendMessage(result);
  return result;
}

export function rememberOffscreenReference(value: unknown): void {
  heldReferences.add(value);
}

export function getHeldReferenceCount(): number {
  return heldReferences.size;
}

export function registerOffscreenMessageListener(
  runtime: RuntimeLike = (globalThis as { chrome?: { runtime?: RuntimeLike } }).chrome
    ?.runtime as RuntimeLike,
): void {
  if (listenerRegistered) {
    return;
  }

  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const payload = message as HeavyWorkerRequest;
    if (payload._target !== 'offscreen' || typeof payload.id !== 'string') {
      return;
    }

    void processHeavyWorkerMessage(payload, {
      remember: rememberOffscreenReference,
      clear: () => heldReferences.clear(),
    })
      .then((result) => emitResult(runtime, result))
      .then(sendResponse);
    return true;
  });

  listenerRegistered = true;
}

export function __resetOffscreenListenerForTests(): void {
  heldReferences.clear();
  listenerRegistered = false;
}

if (
  (globalThis as { chrome?: { runtime?: RuntimeLike } }).chrome?.runtime?.onMessage
) {
  registerOffscreenMessageListener();
}
