import { initializeHeavyWorkerMessaging } from '../shared/heavy-worker-client.chromium';

export function registerBackgroundShell(): void {
  initializeHeavyWorkerMessaging();
}
