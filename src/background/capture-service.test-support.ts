import { clearCachedCaptures } from './capture-cache';

export function resetCaptureServiceStateForTests(): void {
  clearCachedCaptures();
}
