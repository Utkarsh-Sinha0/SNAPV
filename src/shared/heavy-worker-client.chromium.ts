import {
  ensureOffscreenDocument,
  hasNativeOffscreenSupport,
  resetOffscreenIdleTimer,
} from '../background/offscreen-manager';
import type { HeavyWorkerRequest, HeavyWorkerResult } from './types';

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

type PendingRequest = {
  resolve: (value: HeavyWorkerResult) => void;
  reject: (reason?: unknown) => void;
};

const pendingRequests = new Map<string, PendingRequest>();
let resultListenerRegistered = false;
const OFFSCREEN_READY_RETRY_MS = 100;
const OFFSCREEN_READY_MAX_ATTEMPTS = 5;

function getRuntime(): RuntimeLike {
  return (globalThis as { chrome?: { runtime?: RuntimeLike } }).chrome
    ?.runtime as RuntimeLike;
}

function createRequestId(): string {
  return crypto.randomUUID();
}

function shouldForceBackgroundHeavyFallback(): boolean {
  return Boolean(
    (globalThis as typeof globalThis & { __snapvaultForceBackgroundHeavy?: boolean })
      .__snapvaultForceBackgroundHeavy,
  );
}

function isMissingReceiverError(error: unknown): boolean {
  return error instanceof Error && /Receiving end does not exist/i.test(error.message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function sendOffscreenMessageWithRetry(
  payload: HeavyWorkerRequest,
  runtime: RuntimeLike,
  attempt = 1,
): Promise<void> {
  try {
    await runtime.sendMessage(payload);
  } catch (error) {
    if (!isMissingReceiverError(error) || attempt >= OFFSCREEN_READY_MAX_ATTEMPTS) {
      throw error;
    }

    await delay(OFFSCREEN_READY_RETRY_MS);
    await sendOffscreenMessageWithRetry(payload, runtime, attempt + 1);
  }
}

async function getHandleBackgroundHeavyMessage() {
  const module = await import('../background/heavy-handler');
  return module.handleBackgroundHeavyMessage;
}

export function initializeHeavyWorkerMessaging(runtime: RuntimeLike = getRuntime()): void {
  if (resultListenerRegistered) {
    return;
  }

  runtime.onMessage.addListener((message) => {
    const payload = message as Partial<HeavyWorkerResult>;
    if (payload.type !== 'OFFSCREEN_RESULT' || typeof payload.id !== 'string') {
      return;
    }

    const pending = pendingRequests.get(payload.id);
    if (!pending) {
      return;
    }

    pendingRequests.delete(payload.id);
    if (payload.ok) {
      pending.resolve(payload as HeavyWorkerResult);
      return;
    }

    pending.reject(new Error(payload.error ?? 'Heavy worker request failed'));
  });

  resultListenerRegistered = true;
}

export async function sendToHeavyWorker<T extends HeavyWorkerResult>(
  message: HeavyWorkerRequest,
  runtime: RuntimeLike = getRuntime(),
): Promise<T> {
  initializeHeavyWorkerMessaging(runtime);

  const id = message.id ?? createRequestId();

  if (shouldForceBackgroundHeavyFallback() || !hasNativeOffscreenSupport()) {
    await ensureOffscreenDocument();
    resetOffscreenIdleTimer();

    const handleBackgroundHeavyMessage = await getHandleBackgroundHeavyMessage();
    const response = (await handleBackgroundHeavyMessage({
      ...message,
      id,
      _target: 'background-heavy',
    })) as T;

    if (!response.ok) {
      throw new Error(response.error ?? 'Heavy worker request failed');
    }

    return response;
  }

  await ensureOffscreenDocument();
  resetOffscreenIdleTimer();

  return new Promise<T>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
    });
    void sendOffscreenMessageWithRetry({
      ...message,
      id,
      _target: 'offscreen',
    }, runtime)
      .catch((error) => {
        pendingRequests.delete(id);
        reject(error);
      });
  });
}

export function __resetOffscreenAdapterForTests(): void {
  pendingRequests.clear();
  resultListenerRegistered = false;
}
