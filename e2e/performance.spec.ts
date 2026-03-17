import { chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from './extension-fixtures';

async function measureServiceWorkerStartup(
  projectName: string,
  projectUse: {
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
    channel?: 'chromium' | 'msedge';
  },
  samples = 3,
): Promise<number[]> {
  const extensionPath = path.join(
    process.cwd(),
    'dist',
    projectName.includes('edge') ? 'edge' : 'chrome',
  );
  const timings: number[] = [];

  for (let index = 0; index < samples; index += 1) {
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'snapvault-pw-startup-'));
    const startedAt = performance.now();
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
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      await serviceWorker.evaluate(() => {
        const chromeLike = globalThis as typeof globalThis & {
          chrome?: { runtime?: { id?: string } };
        };
        return typeof chromeLike.chrome?.runtime?.id === 'string';
      });
      timings.push(performance.now() - startedAt);
    } finally {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  }

  return timings;
}

function getMedian(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]!;
}

test('service worker cold-start median stays under 1200ms', async ({}, testInfo) => {
  test.skip(testInfo.project.name.includes('hidpi'), 'Cold-start budget is tracked on the default DPR projects only.');

  const projectUse = testInfo.project.use as {
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
    channel?: 'chromium' | 'msedge';
  };
  const timings = await measureServiceWorkerStartup(
    testInfo.project.name,
    projectUse,
  );
  const median = getMedian(timings);

  expect(median).toBeLessThan(1_200);
});

test('popup DOMContentLoaded median stays under 150ms', async ({
  context,
  popupUrl,
}) => {
  const timings: number[] = [];

  for (let index = 0; index < 5; index += 1) {
    const page = await context.newPage();
    const startedAt = performance.now();
    await page.goto(popupUrl, { waitUntil: 'domcontentloaded' });
    timings.push(performance.now() - startedAt);
    await page.close();
  }

  const median = getMedian(timings);
  expect(median).toBeLessThan(150);
});

test('capture visible to download median stays under 1000ms', async ({
  createPopupPage,
  getTargetTabId,
  installDownloadProbe,
  targetPage,
}) => {
  await targetPage.bringToFront();
  const targetTabId = await getTargetTabId();
  const popup = await createPopupPage(targetTabId);
  const downloadProbe = await installDownloadProbe();
  const durations: number[] = [];

  for (let index = 0; index < 5; index += 1) {
    await downloadProbe.reset();
    const startedAt = Date.now();
    await popup.getByRole('button', { name: /capture visible/i }).click();
    await expect(popup.getByRole('button', { name: 'Download' })).toBeVisible();
    await popup.getByRole('button', { name: 'Download' }).click();

    await expect.poll(async () => downloadProbe.getTimestamp()).not.toBeNull();
    const downloadTimestamp = await downloadProbe.getTimestamp();

    durations.push((downloadTimestamp ?? startedAt) - startedAt);

    if (index < 4) {
      await popup.waitForTimeout(1_100);
    }
  }

  const median = getMedian(durations);
  expect(median).toBeLessThan(1_000);
  await popup.close();
});
