import type { CaptureRecord } from '../shared/types';

const inMemoryCaptureCache = new Map<string, CaptureRecord>();

export function getCachedCapture(captureId: string): CaptureRecord | undefined {
  return inMemoryCaptureCache.get(captureId);
}

export function setCachedCapture(captureId: string, record: CaptureRecord): void {
  inMemoryCaptureCache.set(captureId, record);
}

export function deleteCachedCapture(captureId: string): void {
  inMemoryCaptureCache.delete(captureId);
}

export function clearCachedCaptures(): void {
  inMemoryCaptureCache.clear();
}
