import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './extension-fixtures';
import type { ExportSpecPreset } from '../src/shared/types';

const DEVICE_EXPORT_SPEC = {
  format: 'png',
  dimensions: { mode: 'preset', presetId: 'original' },
  dpiPolicy: 'device',
  filenameTemplate: 'snapvault-{date}-{time}.{format}',
} as const;

const TARGET_BYTES = 12_000;

async function openEditorFromPopup(
  popup: Page,
  context: BrowserContext,
) {
  const editorPagePromise = context.waitForEvent('page');
  await popup.getByRole('button', { name: 'Open Editor' }).click();
  const editorPage = await editorPagePromise;
  await editorPage.waitForLoadState('domcontentloaded');
  return editorPage;
}

async function readNumericLabel(page: Page, label: string): Promise<number> {
  const raw = await page.getByLabel(label).textContent();
  return Number.parseInt(raw ?? '0', 10);
}

async function waitForTargetTabId(
  getTargetTabId: () => Promise<number>,
): Promise<number> {
  await expect
    .poll(async () => {
      try {
        return await getTargetTabId();
      } catch {
        return null;
      }
    })
    .not.toBeNull();

  return getTargetTabId();
}

test('tier 1 flow exports an annotated PNG with matching dimensions and zero network calls', async ({
  context,
  createPopupPage,
  getTargetTabId,
  installDownloadProbe,
  startNetworkLog,
  targetPage,
}) => {
  await targetPage.bringToFront();
  const targetTabId = await waitForTargetTabId(getTargetTabId);
  const popup = await createPopupPage(targetTabId);
  const downloadProbe = await installDownloadProbe();
  const stopLogging = await startNetworkLog();

  await popup.getByRole('button', { name: /capture visible/i }).click();
  await expect(popup.getByRole('button', { name: 'Open Editor' })).toBeVisible();

  const editorPage = await openEditorFromPopup(popup, context);
  await editorPage.getByRole('button', { name: 'Text' }).click();

  await editorPage.getByLabel('Editor canvas').click({
    force: true,
    position: { x: 1, y: 1 },
  });
  await expect(editorPage.getByLabel('Annotation text editor')).toBeVisible();
  await editorPage.getByLabel('Annotation text editor').fill('Tier 1 annotation');
  await editorPage.getByLabel('Annotation text editor').press('Enter');

  await expect.poll(async () => readNumericLabel(editorPage, 'Annotation count')).toBe(1);

  await downloadProbe.reset();
  await editorPage.getByRole('button', { name: 'Export' }).click();

  await expect.poll(async () => downloadProbe.getArtifact()).not.toBeNull();
  const artifact = await downloadProbe.getArtifact();

  expect(artifact).not.toBeNull();
  expect(artifact?.mimeType).toBe('image/png');
  expect(artifact?.filename).toMatch(/\.png$/i);
  expect(artifact?.width).toBe(1280);
  expect(artifact?.height).toBe(700);
  expect(stopLogging()).toEqual([]);

  await editorPage.close();
  await popup.close();
});

test('tier 2 pro flow exports a redacted JPEG close to the target size', async ({
  context,
  createPopupPage,
  getTargetTabId,
  installDownloadProbe,
  piiPageUrl,
  targetPage,
  writeStorage,
}) => {
  await writeStorage({
    licenseState: {
      status: 'pro',
      plan: 'monthly',
    },
  });

  await targetPage.goto(piiPageUrl);
  await targetPage.bringToFront();

  const targetTabId = await waitForTargetTabId(getTargetTabId);
  const popup = await createPopupPage(targetTabId);
  const downloadProbe = await installDownloadProbe();

  await popup.getByLabel('Format').selectOption('jpeg');
  await popup.getByLabel('JPEG mode').selectOption('targetSize');
  await popup.getByLabel('Target bytes').fill(String(TARGET_BYTES));
  await popup.getByLabel('Tolerance').fill(String(Math.round(TARGET_BYTES * 0.1)));

  await popup.getByRole('button', { name: /capture full page/i }).click();
  await expect(popup.getByRole('button', { name: 'Open Editor' })).toBeVisible();

  const editorPage = await openEditorFromPopup(popup, context);
  await editorPage.getByRole('button', { name: 'Run DOM Redaction' }).click();

  await expect
    .poll(async () => readNumericLabel(editorPage, 'Pending redaction count'))
    .toBeGreaterThan(0);

  const pendingRedactions = await readNumericLabel(editorPage, 'Pending redaction count');
  await editorPage.getByRole('button', { name: 'Confirm redactions' }).click();

  await expect.poll(async () => readNumericLabel(editorPage, 'Pending redaction count')).toBe(0);
  await expect
    .poll(async () => readNumericLabel(editorPage, 'Annotation count'))
    .toBe(pendingRedactions);

  await downloadProbe.reset();
  await editorPage.getByRole('button', { name: 'Export' }).click();

  await expect.poll(async () => downloadProbe.getArtifact()).not.toBeNull();
  const artifact = await downloadProbe.getArtifact();

  expect(artifact).not.toBeNull();
  expect(artifact?.mimeType).toBe('image/jpeg');
  expect(artifact?.filename).toMatch(/\.jpeg$/i);
  expect(artifact?.sizeBytes).toBeGreaterThanOrEqual(Math.round(TARGET_BYTES * 0.9));
  expect(artifact?.sizeBytes).toBeLessThanOrEqual(Math.round(TARGET_BYTES * 1.1));

  await editorPage.close();
  await popup.close();
});

test('preset export and import round-trip preserves every export spec field', async ({
  extensionPage,
  readStorage,
  writeStorage,
}, testInfo) => {
  const roundTripPreset: ExportSpecPreset = {
    snapvault_preset: '1.0',
    name: 'Round Trip Preset',
    description: 'Preset used for browser round-trip coverage',
    spec: {
      format: 'jpeg',
      dimensions: {
        mode: 'manual',
        width: 1440,
        height: 900,
      },
      dpiPolicy: 'device',
      jpeg: {
        mode: 'targetSize',
        targetBytes: 333333,
        toleranceBytes: 22222,
      },
      filenameTemplate: 'round-trip-{date}-{time}.{format}',
      lightMode: true,
      gpuAccelerate: false,
    },
    createdAt: '2026-03-17T00:00:00.000Z',
  };

  await writeStorage({
    'options.presets': [roundTripPreset],
  });
  await extensionPage.reload();
  await extensionPage.waitForLoadState('domcontentloaded');

  await extensionPage.evaluate(() => {
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const globalScope = window as typeof window & {
      __snapvaultExportedPresetText?: string | null;
    };

    globalScope.__snapvaultExportedPresetText = null;
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob) {
        void object.text().then((text) => {
          globalScope.__snapvaultExportedPresetText = text;
        });
      }

      return originalCreateObjectUrl(object);
    };
  });

  await extensionPage.getByRole('button', { name: 'Export' }).click();

  await expect.poll(async () =>
    extensionPage.evaluate(
      () =>
        ((window as typeof window & {
          __snapvaultExportedPresetText?: string | null;
        }).__snapvaultExportedPresetText ?? null),
    ),
  ).not.toBeNull();

  const exportedPresetText = await extensionPage.evaluate(
    () =>
      ((window as typeof window & {
        __snapvaultExportedPresetText?: string | null;
      }).__snapvaultExportedPresetText ?? null),
  );
  expect(exportedPresetText).not.toBeNull();

  await mkdir(testInfo.outputDir, { recursive: true });
  const importPath = path.join(testInfo.outputDir, 'round-trip-preset.json');
  await writeFile(importPath, exportedPresetText!, 'utf8');

  await writeStorage({
    'options.presets': [],
  });
  await extensionPage.reload();
  await extensionPage.waitForLoadState('domcontentloaded');

  await extensionPage.getByLabel('Import preset file').setInputFiles(importPath);
  await expect(extensionPage.getByText('Round Trip Preset', { exact: true })).toBeVisible();

  const stored = await readStorage();
  expect(stored['options.presets']).toEqual([roundTripPreset]);
});

test('@hidpi popup shows the HiDPI banner and exports a 2x artifact', async ({
  createPopupPage,
  getTargetTabId,
  installDownloadProbe,
  targetPage,
  writeStorage,
}) => {
  await writeStorage({
    'popup.exportSpec': DEVICE_EXPORT_SPEC,
  });

  await targetPage.bringToFront();
  const targetTabId = await waitForTargetTabId(getTargetTabId);
  const popup = await createPopupPage(targetTabId);
  const downloadProbe = await installDownloadProbe();

  await expect(popup.getByText('HiDPI capture detected.')).toBeVisible();

  await popup.getByRole('button', { name: /capture visible/i }).click();
  await expect(popup.getByRole('button', { name: 'Download' })).toBeVisible();

  await downloadProbe.reset();
  await popup.getByRole('button', { name: 'Download' }).click();

  await expect.poll(async () => downloadProbe.getArtifact()).not.toBeNull();
  const artifact = await downloadProbe.getArtifact();

  expect(artifact).not.toBeNull();
  expect(artifact?.mimeType).toBe('image/png');
  expect(artifact?.width).toBe(2560);
  expect(artifact?.height).toBe(1400);

  await popup.close();
});

test('free users see the board gate and no board tab opens', async ({
  context,
  createPopupPage,
  getTargetTabId,
  targetPage,
}) => {
  await targetPage.bringToFront();
  const targetTabId = await waitForTargetTabId(getTargetTabId);
  const popup = await createPopupPage(targetTabId);

  await popup.getByRole('button', { name: /capture visible/i }).click();
  await expect(popup.getByRole('button', { name: 'Open Editor' })).toBeVisible();

  const editorPage = await openEditorFromPopup(popup, context);
  const pageCountBeforeBoardAttempt = context.pages().length;

  await editorPage.getByRole('button', { name: 'Open board' }).click();
  await expect(editorPage.getByLabel('Editor status')).toContainText('Pro license required');

  await editorPage.waitForTimeout(500);
  expect(context.pages()).toHaveLength(pageCountBeforeBoardAttempt);

  await editorPage.close();
  await popup.close();
});
