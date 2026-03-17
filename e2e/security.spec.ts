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
