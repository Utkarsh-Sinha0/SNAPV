import { env as transformersEnv, pipeline } from '@huggingface/transformers';
import type { RedactAnnotation } from '../shared/types';

type MlDetection = {
  box?: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  score?: number;
  label?: string;
};

type MlPipeline = (
  image: unknown,
  options?: unknown,
) => Promise<unknown>;
type PipelineLoader = (
  task: 'object-detection',
  model: 'redaction',
) => Promise<MlPipeline>;

type ChromeRuntimeLike = {
  getURL: (path: string) => string;
};

function getChromeRuntime(): ChromeRuntimeLike | undefined {
  return (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome?.runtime;
}

const MODEL_ID = 'redaction';
const DETECTION_THRESHOLD = 0.75;
const MODEL_ROOT = getChromeRuntime()?.getURL('assets/ml/') ?? 'assets/ml/';
const WASM_MJS_PATH = getChromeRuntime()?.getURL('assets/ml/wasm/ort-wasm-simd-threaded.mjs')
  ?? 'assets/ml/wasm/ort-wasm-simd-threaded.mjs';
const WASM_BINARY_PATH = getChromeRuntime()?.getURL('assets/ml/wasm/ort-wasm-simd-threaded.wasm')
  ?? 'assets/ml/wasm/ort-wasm-simd-threaded.wasm';

transformersEnv.allowRemoteModels = false;
transformersEnv.allowLocalModels = true;
transformersEnv.localModelPath = MODEL_ROOT;
const onnxWasmEnv = transformersEnv.backends.onnx.wasm;
if (!onnxWasmEnv) {
  throw new Error('Transformers ONNX WASM backend is unavailable');
}
// SnapVault always runs the redaction pipeline on the plain WASM EP, so we can ship the
// smaller non-JSEP runtime instead of the heavier WebGPU/WebNN-enabled bundle.
onnxWasmEnv.wasmPaths = {
  mjs: WASM_MJS_PATH,
  wasm: WASM_BINARY_PATH,
};
onnxWasmEnv.proxy = false;

export const env = transformersEnv;

let pipelineLoader: PipelineLoader = async (task, model) => {
  try {
    return await pipeline(task, model, {
      device: 'wasm',
      dtype: 'q8',
    }) as unknown as MlPipeline;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load local ML redaction model from ${MODEL_ROOT}${MODEL_ID}: ${message}`);
  }
};
let detectorPromise: Promise<MlPipeline> | null = null;

export function __setMlPipelineLoader(loader: PipelineLoader): void {
  pipelineLoader = loader;
  detectorPromise = null;
}

async function getMlPipeline(): Promise<MlPipeline> {
  detectorPromise ??= pipelineLoader('object-detection', MODEL_ID);
  return detectorPromise;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  // pixel-audit: allow-local-fetch Data URLs are decoded locally inside the offscreen document.
  const response = await fetch(dataUrl);
  return response.blob();
}

function mapLabelToType(label: string | undefined): RedactAnnotation['type'] {
  const normalized = label?.trim().toLowerCase();

  if (normalized === 'face' || normalized === 'person') {
    return 'face';
  }

  if (normalized === 'logo' || normalized === 'brand') {
    return 'logo';
  }

  if (normalized?.includes('text')) {
    return 'text-block';
  }

  return 'custom';
}

export async function runMlRedaction(
  dataUrl: string,
): Promise<{ annotations: RedactAnnotation[] }> {
  const detector = await getMlPipeline();
  const bitmap = await createImageBitmap(await dataUrlToBlob(dataUrl));

  try {
    const detections = (await detector(bitmap, {
      threshold: DETECTION_THRESHOLD,
      percentage: false,
    })) as MlDetection[];

    return {
      annotations: detections.map((detection, index) => {
        const box = detection.box ?? { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
        return {
          id: `ml-${index}`,
          type: mapLabelToType(detection.label),
          rect: {
            x: box.xmin,
            y: box.ymin,
            w: Math.max(0, box.xmax - box.xmin),
            h: Math.max(0, box.ymax - box.ymin),
          },
          confidence: detection.score ?? 0.5,
          source: 'ml',
          userReviewed: false,
        };
      }),
    };
  } finally {
    bitmap.close?.();
  }
}
