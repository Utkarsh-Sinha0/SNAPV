import { test, expect } from './extension-fixtures';

const BASE_SPEC = {
  format: 'png',
  dimensions: { mode: 'preset', presetId: 'original' },
  dpiPolicy: 'device',
  filenameTemplate: 'snapvault-{date}-{time}.{format}',
};

test('network intercept stays empty during full-page capture and export', async ({
  getTargetTabId,
  sendRuntimeMessage,
  startNetworkLog,
  targetPage,
}) => {
  await targetPage.bringToFront();
  const tabId = await getTargetTabId();
  const stopLogging = await startNetworkLog();

  const capture = await sendRuntimeMessage<{ captureId: string }>({
    type: 'CAPTURE_FULLPAGE',
    tabId,
    spec: BASE_SPEC,
    lightMode: false,
  });
  await sendRuntimeMessage({
    type: 'EXPORT_DOWNLOAD',
    captureId: capture.captureId,
    spec: BASE_SPEC,
  });

  expect(stopLogging()).toEqual([]);
});

test('ml redaction emits zero network requests', async ({
  getTargetTabId,
  sendRuntimeMessage,
  startNetworkLog,
  targetPage,
  writeStorage,
}) => {
  await targetPage.bringToFront();
  const tabId = await getTargetTabId();
  await writeStorage({
    licenseState: {
      status: 'pro',
    },
  });

  const capture = await sendRuntimeMessage<{ captureId: string }>({
    type: 'CAPTURE_VISIBLE',
    tabId,
    spec: BASE_SPEC,
  });

  const stopLogging = await startNetworkLog();
  await sendRuntimeMessage({
    type: 'RUN_ML_REDACTION',
    captureId: capture.captureId,
  });

  expect(stopLogging()).toEqual([]);
});

test('ads stay isolated to the sandbox iframe and never appear in the popup DOM', async ({
  createPopupPage,
  extensionPage,
  getTargetTabId,
  targetPage,
}) => {
  await targetPage.bringToFront();
  const targetTabId = await getTargetTabId();
  const popup = await createPopupPage(targetTabId);

  const sponsorFrame = extensionPage.getByTitle('Sponsor slot');
  await expect(sponsorFrame).toBeVisible();
  await expect(sponsorFrame).toHaveAttribute('sandbox', /allow-scripts allow-popups/);
  await expect(sponsorFrame).toHaveAttribute('src', /ads_sandbox\.html$/);

  await expect(popup.locator('iframe')).toHaveCount(0);
  await popup.close();
});
