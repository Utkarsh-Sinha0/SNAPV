import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import os from 'node:os';

const TARGET_TITLE = 'SnapVault Capture Target';
const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4AWL6z8DwH4SZGKAAAAAA//8qMqaOAAAABklEQVQDADYSBAFv606fAAAAAElFTkSuQmCC';

type CaptureVisibleTabFn = (
  windowId?: number,
  options?: { format?: 'png' | 'jpeg' },
) => Promise<string>;

type ExecuteScriptFn = (injection: {
  args?: unknown[];
}) => Promise<Array<{ result: unknown }>>;

type DownloadProbe = {
  reset: () => Promise<void>;
  getTimestamp: () => Promise<number | null>;
  getArtifact: () => Promise<{
    timestamp: number | null;
    filename: string | null;
    url: string | null;
    dataUrl: string | null;
    sizeBytes: number | null;
    mimeType: string | null;
    width: number | null;
    height: number | null;
  } | null>;
};

type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
  extensionPage: Page;
  targetPage: Page;
  testServerOrigin: string;
  popupUrl: string;
  testPageUrl: string;
  piiPageUrl: string;
  createPopupPage: (targetTabId?: number) => Promise<Page>;
  getTargetTabId: () => Promise<number>;
  sendRuntimeMessage: <T>(message: unknown) => Promise<T>;
  readStorage: () => Promise<Record<string, unknown>>;
  writeStorage: (items: Record<string, unknown>) => Promise<void>;
  hasOffscreenDocument: () => Promise<boolean>;
  installDownloadProbe: () => Promise<DownloadProbe>;
  startNetworkLog: () => Promise<() => string[]>;
};

async function waitForServiceWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers();
  if (existing.length > 0) {
    return existing[0]!;
  }

  return context.waitForEvent('serviceworker');
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use, testInfo) => {
    const projectUse = testInfo.project.use as {
      viewport?: { width: number; height: number };
      deviceScaleFactor?: number;
      channel?: 'chromium' | 'msedge';
    };
    const extensionPath = path.join(
      process.cwd(),
      'dist',
      testInfo.project.name.includes('edge') ? 'edge' : 'chrome',
    );
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'snapvault-pw-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: projectUse.channel ?? 'chromium',
      headless: true,
      viewport: projectUse.viewport ?? { width: 1280, height: 720 },
      deviceScaleFactor: projectUse.deviceScaleFactor ?? 1,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    try {
      await use(context);
    } finally {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  },

  serviceWorker: async ({ context }, use, testInfo) => {
    const projectUse = testInfo.project.use as {
      deviceScaleFactor?: number;
    };
    const serviceWorker = await waitForServiceWorker(context);
    await serviceWorker.evaluate(({ validPngDataUrl, deviceScaleFactor }) => {
      const globalScope = globalThis as typeof globalThis & {
        __snapvaultForceBackgroundHeavy?: boolean;
        __snapvaultOriginalCaptureVisibleTab?: CaptureVisibleTabFn;
        __snapvaultOriginalExecuteScript?: ExecuteScriptFn;
      };
      const chromeLike = globalThis as typeof globalThis & {
        chrome: {
          tabs: {
            captureVisibleTab: CaptureVisibleTabFn;
          };
          scripting: {
            executeScript: ExecuteScriptFn;
          };
        };
      };

      globalScope.__snapvaultForceBackgroundHeavy = true;

      if (!globalScope.__snapvaultOriginalCaptureVisibleTab) {
        globalScope.__snapvaultOriginalCaptureVisibleTab =
          chromeLike.chrome.tabs.captureVisibleTab.bind(chromeLike.chrome.tabs);
        chromeLike.chrome.tabs.captureVisibleTab = async () =>
          validPngDataUrl;
      }

      if (!globalScope.__snapvaultOriginalExecuteScript) {
        globalScope.__snapvaultOriginalExecuteScript =
          chromeLike.chrome.scripting.executeScript.bind(chromeLike.chrome.scripting);
        chromeLike.chrome.scripting.executeScript = async (injection) => {
          const args = injection.args ?? [];
          if (typeof args[0] === 'number') {
            return [{ result: args[0] }];
          }

          if (typeof args[0] === 'string' && typeof args[1] === 'number') {
            return [{ result: { selector: args[0], top: args[1] } }];
          }

          if (typeof args[0] === 'string') {
            return [{ result: { scrollHeight: 1400, viewportHeight: 700 } }];
          }

          return [{
            result: {
              cssWidth: 1280,
              cssHeight: 700,
              devicePixelRatio: deviceScaleFactor,
              screenLeft: 0,
              screenTop: 0,
              scrollHeight: 1400,
              viewportHeight: 700,
            },
          }];
        };
      }
    }, {
      validPngDataUrl: VALID_PNG_DATA_URL,
      deviceScaleFactor: projectUse.deviceScaleFactor ?? 1,
    });
    await use(serviceWorker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    const extensionId = new URL(serviceWorker.url()).host;
    await use(extensionId);
  },

  testServerOrigin: async ({}, use) => {
    const server = await new Promise<Server>((resolve) => {
      const nextServer = createServer((request, response) => {
        if (request.url === '/capture.html') {
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          response.end(`
            <html>
              <head><title>${TARGET_TITLE}</title></head>
              <body style="margin:0">
                <main style="height:1400px;background:linear-gradient(#f8fafc,#cbd5e1)">
                  <h1>SnapVault Capture Target</h1>
                  <p>This page is intentionally tall for full-page capture tests.</p>
                </main>
              </body>
            </html>
          `);
          return;
        }

        if (request.url === '/pii.html') {
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          response.end(`
            <html>
              <head><title>${TARGET_TITLE}</title></head>
              <body style="margin:0">
                <main style="height:1400px;background:linear-gradient(#fef2f2,#fee2e2);padding:24px">
                  <h1>SnapVault Capture Target</h1>
                  <p>Reach us at user@example.com for release coordination.</p>
                  <p>Backup contact: +1-800-555-0100</p>
                  <p>Card reference: 4532015112830366</p>
                </main>
              </body>
            </html>
          `);
          return;
        }

        response.writeHead(404);
        response.end('Not found');
      });

      nextServer.listen(0, '127.0.0.1', () => resolve(nextServer));
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve local test server address');
    }

    try {
      await use(`http://127.0.0.1:${address.port}`);
    } finally {
      server.closeAllConnections?.();
      server.closeIdleConnections?.();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  },

  testPageUrl: async ({ testServerOrigin }, use) => {
    await use(`${testServerOrigin}/capture.html`);
  },

  piiPageUrl: async ({ testServerOrigin }, use) => {
    await use(`${testServerOrigin}/pii.html`);
  },

  targetPage: async ({ context, testPageUrl }, use) => {
    const page = await context.newPage();
    await page.goto(testPageUrl);
    await use(page);
    await page.close();
  },

  extensionPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await use(page);
    await page.close();
  },

  popupUrl: async ({ extensionId }, use) => {
    await use(`chrome-extension://${extensionId}/popup.html`);
  },

  createPopupPage: async ({ context, popupUrl }, use, testInfo) => {
    const projectUse = testInfo.project.use as {
      deviceScaleFactor?: number;
    };
    await use(async (targetTabId?: number) => {
      const page = await context.newPage();
      await page.addInitScript((params) => {
        const chromeLike = globalThis as typeof globalThis & {
          chrome?: {
            tabs?: {
              query?: (queryInfo: unknown) => Promise<Array<Record<string, unknown>>>;
            };
            scripting?: {
              executeScript?: (injection: { args?: unknown[] }) => Promise<Array<{ result: unknown }>>;
            };
          };
        };

        const tabsApi = chromeLike.chrome?.tabs;
        const originalQuery = tabsApi?.query?.bind(tabsApi);
        if (tabsApi && originalQuery) {
          Object.defineProperty(tabsApi, 'query', {
            configurable: true,
            value: async (queryInfo: { active?: boolean; currentWindow?: boolean }) => {
              if (queryInfo?.active && queryInfo?.currentWindow) {
                if (typeof params.expectedTabId === 'number') {
                  return [{ id: params.expectedTabId }];
                }

                const tabs = await originalQuery({});
                const match = tabs.find((tab) => tab.title === params.expectedTitle);
                if (match) {
                  return [match];
                }
              }

              return originalQuery(queryInfo);
            },
          });
        }

        const scriptingApi = chromeLike.chrome?.scripting;
        if (scriptingApi?.executeScript) {
          Object.defineProperty(scriptingApi, 'executeScript', {
            configurable: true,
            value: async (injection: { args?: unknown[] }) => {
              const args = injection.args ?? [];
              if (typeof args[0] === 'number') {
                return [{ result: args[0] }];
              }

              if (typeof args[0] === 'string' && typeof args[1] === 'number') {
                return [{ result: { selector: args[0], top: args[1] } }];
              }

              if (typeof args[0] === 'string') {
                return [{ result: { scrollHeight: 1400, viewportHeight: 700 } }];
              }

              return [{
                result: {
                  cssWidth: 1280,
                  cssHeight: 700,
                  devicePixelRatio: params.deviceScaleFactor,
                  screenLeft: 0,
                  screenTop: 0,
                },
              }];
            },
          });
        }
      }, {
        expectedTabId: targetTabId,
        expectedTitle: TARGET_TITLE,
        deviceScaleFactor: projectUse.deviceScaleFactor ?? 1,
      });
      await page.goto(popupUrl);
      return page;
    });
  },

  getTargetTabId: async ({ serviceWorker, testPageUrl }, use) => {
    await use(async () =>
      serviceWorker.evaluate(async ({ expectedTitle, expectedUrl }) => {
        const chromeLike = globalThis as typeof globalThis & {
          chrome: {
            tabs: {
              query: (
                queryInfo: unknown,
              ) => Promise<Array<{ id?: number; title?: string; url?: string }>>;
            };
          };
        };

        const tabs = await chromeLike.chrome.tabs.query({});
        const matchingTab = tabs.find(
          (tab) =>
            tab.title === expectedTitle
            || tab.url === expectedUrl
            || tab.url?.startsWith(expectedUrl.replace('/capture.html', '')),
        );

        if (typeof matchingTab?.id !== 'number') {
          throw new Error('Unable to locate the target tab');
        }

        return matchingTab.id;
      }, {
        expectedTitle: TARGET_TITLE,
        expectedUrl: testPageUrl,
      }),
    );
  },

  sendRuntimeMessage: async ({ extensionPage }, use) => {
    await use(async <T>(message: unknown) =>
      extensionPage.evaluate((payload) => {
        const chromeLike = globalThis as typeof globalThis & {
          chrome: {
            runtime: {
              sendMessage: (message: unknown) => Promise<unknown>;
            };
          };
        };
        return chromeLike.chrome.runtime.sendMessage(payload);
      }, message).then((response) => {
        const payload = response as { __error__?: string };
        if (payload?.__error__) {
          throw new Error(payload.__error__);
        }

        return response as T;
      }),
    );
  },

  readStorage: async ({ extensionPage }, use) => {
    await use(async () =>
      extensionPage.evaluate(() => {
        const chromeLike = globalThis as typeof globalThis & {
          chrome: {
            storage: {
              local: {
                get: (keys: null) => Promise<Record<string, unknown>>;
              };
            };
          };
        };
        return chromeLike.chrome.storage.local.get(null);
      }),
    );
  },

  writeStorage: async ({ extensionPage }, use) => {
    await use(async (items) => {
      await extensionPage.evaluate((payload) => {
        const chromeLike = globalThis as typeof globalThis & {
          chrome: {
            storage: {
              local: {
                set: (items: Record<string, unknown>) => Promise<void>;
              };
            };
          };
        };
        return chromeLike.chrome.storage.local.set(payload);
      }, items);
    });
  },

  hasOffscreenDocument: async ({ serviceWorker }, use) => {
    await use(async () =>
      serviceWorker.evaluate(() => {
        const chromeLike = globalThis as typeof globalThis & {
          chrome?: {
            offscreen?: {
              hasDocument?: () => Promise<boolean>;
            };
          };
          __snapvaultFallbackOffscreenOpen?: boolean;
        };
        return chromeLike.chrome?.offscreen?.hasDocument?.().then((hasDocument: boolean) => hasDocument ?? false)
          ?? chromeLike.__snapvaultFallbackOffscreenOpen
          ?? false;
      }),
    );
  },

  installDownloadProbe: async ({ serviceWorker }, use) => {
    await use(async () => {
      await serviceWorker.evaluate(() => {
        const globalScope = globalThis as typeof globalThis & {
          __snapvaultOriginalDownload?: (...args: unknown[]) => Promise<number>;
          __snapvaultDownloadTimestamp?: number | null;
        };
        const chromeLike = globalThis as typeof globalThis & {
          chrome: {
            downloads: {
              download: (...args: unknown[]) => Promise<number>;
            };
          };
          __snapvaultDownloadFilename?: string | null;
          __snapvaultDownloadUrl?: string | null;
        };

        if (!globalScope.__snapvaultOriginalDownload) {
          globalScope.__snapvaultOriginalDownload =
            chromeLike.chrome.downloads.download.bind(chromeLike.chrome.downloads);
          chromeLike.chrome.downloads.download = async (...args: unknown[]) => {
            const downloadOptions = args[0] as { filename?: string; url?: string } | undefined;
            globalScope.__snapvaultDownloadTimestamp = Date.now();
            chromeLike.__snapvaultDownloadFilename = downloadOptions?.filename ?? null;
            chromeLike.__snapvaultDownloadUrl = downloadOptions?.url ?? null;
            return globalScope.__snapvaultOriginalDownload!(...args);
          };
        }
      });

      return {
        reset: () =>
          serviceWorker.evaluate(() => {
            const globalScope = globalThis as typeof globalThis & {
              __snapvaultDownloadTimestamp?: number | null;
              __snapvaultDownloadFilename?: string | null;
              __snapvaultDownloadUrl?: string | null;
            };
            globalScope.__snapvaultDownloadTimestamp = null;
            globalScope.__snapvaultDownloadFilename = null;
            globalScope.__snapvaultDownloadUrl = null;
          }),
        getTimestamp: () =>
          serviceWorker.evaluate(
            () =>
              (globalThis as typeof globalThis & {
                __snapvaultDownloadTimestamp?: number | null;
              }).__snapvaultDownloadTimestamp ?? null,
          ),
        getArtifact: () =>
          serviceWorker.evaluate(async () => {
            const globalScope = globalThis as typeof globalThis & {
              __snapvaultDownloadTimestamp?: number | null;
              __snapvaultDownloadFilename?: string | null;
              __snapvaultDownloadUrl?: string | null;
            };

            if (!globalScope.__snapvaultDownloadUrl) {
              return null;
            }

            const response = await fetch(globalScope.__snapvaultDownloadUrl);
            const blob = await response.blob();
            let width: number | null = null;
            let height: number | null = null;

            if (blob.type.startsWith('image/')) {
              const bitmap = await createImageBitmap(blob);
              width = bitmap.width;
              height = bitmap.height;
              bitmap.close();
            }

            return {
              timestamp: globalScope.__snapvaultDownloadTimestamp ?? null,
              filename: globalScope.__snapvaultDownloadFilename ?? null,
              url: globalScope.__snapvaultDownloadUrl ?? null,
              dataUrl: globalScope.__snapvaultDownloadUrl ?? null,
              sizeBytes: blob.size,
              mimeType: blob.type || null,
              width,
              height,
            };
          }),
      };
    });
  },

  startNetworkLog: async ({ context }, use) => {
    await use(async () => {
      const requests: string[] = [];
      const listener = (request: { url: () => string }) => {
        const url = new URL(request.url());
        if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
          requests.push(request.url());
        }
      };

      context.on('request', listener);
      return () => {
        context.off('request', listener);
        return [...requests];
      };
    });
  },
});

export { expect };
