const OFFSCREEN_URL = 'offscreen.html';
export const OFFSCREEN_IDLE_TIMEOUT_MS = 30_000;

type OffscreenApi = {
  Reason: {
    BLOBS: string;
    DOM_PARSER?: string;
    DOM_PARSING?: string;
  };
  hasDocument?: () => Promise<boolean>;
  createDocument: (options: {
    url: string;
    reasons: string[];
    justification: string;
  }) => Promise<void>;
  closeDocument: () => Promise<void>;
};

let ensurePromise: Promise<void> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let fallbackDocumentOpen = false;

function getChromeRuntimeGetUrl(): ((path: string) => string) | undefined {
  return (globalThis as { chrome?: { runtime?: { getURL?: (path: string) => string } } }).chrome
    ?.runtime?.getURL;
}

function getOffscreenApi(): OffscreenApi | undefined {
  return (globalThis as { chrome?: { offscreen?: OffscreenApi } }).chrome?.offscreen;
}

function setFallbackDocumentOpen(value: boolean): void {
  fallbackDocumentOpen = value;
  (globalThis as typeof globalThis & { __snapvaultFallbackOffscreenOpen?: boolean }).__snapvaultFallbackOffscreenOpen = value;
}

function getDomParsingReason(offscreen: OffscreenApi): string {
  return offscreen.Reason.DOM_PARSER ?? offscreen.Reason.DOM_PARSING ?? 'DOM_PARSER';
}

export function hasNativeOffscreenSupport(): boolean {
  return Boolean(getOffscreenApi());
}

function hasNoDocumentError(error: unknown): boolean {
  return error instanceof Error && /no document|offscreen document/i.test(error.message);
}

export async function ensureOffscreenDocument(): Promise<void> {
  const offscreen = getOffscreenApi();
  if (!offscreen) {
    setFallbackDocumentOpen(true);
    return;
  }

  if (ensurePromise) {
    return ensurePromise;
  }

  ensurePromise = (async () => {
    const hasDocument = (await offscreen.hasDocument?.()) ?? false;
    if (hasDocument) {
      return;
    }

    await offscreen.createDocument({
      url: getChromeRuntimeGetUrl()?.(OFFSCREEN_URL) ?? OFFSCREEN_URL,
      reasons: [offscreen.Reason.BLOBS, getDomParsingReason(offscreen)],
      justification:
        'Canvas stitching, JPEG encoding, PDF assembly, and DOM parsing require a document context.',
    });
  })();

  try {
    await ensurePromise;
  } finally {
    ensurePromise = null;
  }
}

export async function closeOffscreenDocument(): Promise<void> {
  const offscreen = getOffscreenApi();
  if (!offscreen) {
    setFallbackDocumentOpen(false);
    return;
  }

  try {
    await offscreen.closeDocument();
  } catch (error) {
    if (!hasNoDocumentError(error)) {
      throw error;
    }
  }
}

export function resetOffscreenIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  idleTimer = setTimeout(() => {
    void closeOffscreenDocument();
    idleTimer = null;
  }, OFFSCREEN_IDLE_TIMEOUT_MS);
}

export async function nukeOffscreenMemory(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  await closeOffscreenDocument();
}

export function __resetOffscreenManagerForTests(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  ensurePromise = null;
  setFallbackDocumentOpen(false);
}
