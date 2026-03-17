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

type MlPipeline = (dataUrl: string) => Promise<MlDetection[]>;
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

export const env = {
  allowRemoteModels: false,
  localModelPath: getChromeRuntime()?.getURL('assets/ml/') ?? 'assets/ml/',
};

let pipelineLoader: PipelineLoader = async () => {
  throw new Error('ML pipeline loader is not configured');
};

export function __setMlPipelineLoader(loader: PipelineLoader): void {
  pipelineLoader = loader;
}

function mapLabelToType(label: string | undefined): RedactAnnotation['type'] {
  if (label === 'face' || label === 'logo') {
    return label;
  }

  return 'custom';
}

export async function runMlRedaction(
  dataUrl: string,
): Promise<{ annotations: RedactAnnotation[] }> {
  const pipeline = await pipelineLoader('object-detection', 'redaction');
  const detections = await pipeline(dataUrl);

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
}
