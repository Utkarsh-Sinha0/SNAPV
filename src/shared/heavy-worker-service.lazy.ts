import type { HeavyWorkerRequest, HeavyWorkerResult } from './types';
import type { BuildPdf, RefTracker, RunMlRedaction } from './heavy-worker-service';
import { processHeavyWorkerMessageWithDeps } from './heavy-worker-service';

let buildPdfPromise: Promise<BuildPdf> | null = null;
let runMlRedactionPromise: Promise<RunMlRedaction> | null = null;

async function getBuildPdf(): Promise<BuildPdf> {
  buildPdfPromise ??= import('./pdf').then((module) => module.buildPdf);
  return buildPdfPromise;
}

async function getRunMlRedaction(): Promise<RunMlRedaction> {
  runMlRedactionPromise ??= import('../offscreen/ml-redaction').then(
    (module) => module.runMlRedaction,
  );
  return runMlRedactionPromise;
}

export async function processHeavyWorkerMessage(
  message: HeavyWorkerRequest,
  refs: RefTracker,
): Promise<HeavyWorkerResult> {
  const [buildPdf, runMlRedaction] = await Promise.all([
    getBuildPdf(),
    getRunMlRedaction(),
  ]);

  return processHeavyWorkerMessageWithDeps(message, refs, {
    buildPdf,
    runMlRedaction,
  });
}
