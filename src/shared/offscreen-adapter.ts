import {
  __resetOffscreenAdapterForTests as resetChromiumOffscreenAdapterForTests,
  initializeHeavyWorkerMessaging as initializeChromiumHeavyWorkerMessaging,
  sendToHeavyWorker as sendToChromiumHeavyWorker,
} from './heavy-worker-client.chromium';
import {
  __resetOffscreenAdapterForTests as resetFirefoxOffscreenAdapterForTests,
  initializeHeavyWorkerMessaging as initializeFirefoxHeavyWorkerMessaging,
  sendToHeavyWorker as sendToFirefoxHeavyWorker,
} from './heavy-worker-client.firefox';
import type { HeavyWorkerRequest, HeavyWorkerResult } from './types';

declare const __SNAPVAULT_TARGET_FAMILY__: 'chromium' | 'firefox';

const targetFamily =
  typeof __SNAPVAULT_TARGET_FAMILY__ === 'string'
    ? __SNAPVAULT_TARGET_FAMILY__
    : 'chromium';

export function initializeHeavyWorkerMessaging(): void {
  if (targetFamily === 'firefox') {
    initializeFirefoxHeavyWorkerMessaging();
    return;
  }

  initializeChromiumHeavyWorkerMessaging();
}

export async function sendToHeavyWorker<T extends HeavyWorkerResult>(
  message: HeavyWorkerRequest,
): Promise<T> {
  if (targetFamily === 'firefox') {
    return sendToFirefoxHeavyWorker<T>(message);
  }

  return sendToChromiumHeavyWorker<T>(message);
}

export function __resetOffscreenAdapterForTests(): void {
  if (targetFamily === 'firefox') {
    resetFirefoxOffscreenAdapterForTests();
    return;
  }

  resetChromiumOffscreenAdapterForTests();
}
