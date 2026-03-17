// Compatibility shim: the heavy-work core now lives in ../shared/heavy-worker-service.
export type { RefTracker } from '../shared/heavy-worker-service';
export { processHeavyWorkerMessage } from '../shared/heavy-worker-service.lazy';
