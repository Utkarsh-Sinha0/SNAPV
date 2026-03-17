import type { HeavyWorkerRequest, HeavyWorkerResult } from '../shared/types';

export async function handleBackgroundHeavyMessage(
  message: HeavyWorkerRequest,
): Promise<HeavyWorkerResult> {
  const { processHeavyWorkerMessage } = await import('../shared/heavy-worker-service.lazy');
  return processHeavyWorkerMessage(message, {
    remember: () => undefined,
    clear: () => undefined,
  });
}
