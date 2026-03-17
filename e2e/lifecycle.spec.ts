import { test, expect } from './extension-fixtures';

const BASE_SPEC = {
  format: 'png',
  dimensions: { mode: 'preset', presetId: 'original' },
  dpiPolicy: 'device',
  filenameTemplate: 'snapvault-{date}-{time}.{format}',
};

test('offscreen lifecycle opens on capture and closes after 31 seconds', async ({
  getTargetTabId,
  hasOffscreenDocument,
  sendRuntimeMessage,
  targetPage,
}) => {
  await targetPage.bringToFront();
  expect(await hasOffscreenDocument()).toBe(false);

  const tabId = await getTargetTabId();
  await sendRuntimeMessage({
    type: 'CAPTURE_FULLPAGE',
    tabId,
    spec: BASE_SPEC,
    lightMode: false,
  });

  await expect
    .poll(async () => hasOffscreenDocument(), {
      timeout: 2_000,
    })
    .toBe(true);

  await targetPage.waitForTimeout(31_000);
  await expect.poll(async () => hasOffscreenDocument()).toBe(false);
});

test('nuke everything clears stored captures and closes offscreen within 500ms', async ({
  extensionPage,
  getTargetTabId,
  hasOffscreenDocument,
  readStorage,
  sendRuntimeMessage,
  targetPage,
}) => {
  await extensionPage.getByLabel('Store recent captures').check();
  await targetPage.bringToFront();

  const tabId = await getTargetTabId();
  await sendRuntimeMessage({
    type: 'CAPTURE_FULLPAGE',
    tabId,
    spec: BASE_SPEC,
    lightMode: false,
  });

  await expect
    .poll(async () =>
      Object.keys(await readStorage()).filter((key) => key.startsWith('capture:')).length,
    )
    .toBeGreaterThan(0);
  await expect.poll(async () => hasOffscreenDocument()).toBe(true);

  extensionPage.once('dialog', (dialog) => {
    void dialog.accept();
  });

  const startedAt = Date.now();
  await extensionPage.getByRole('button', { name: 'Nuke everything' }).click();

  await expect.poll(async () => {
    const storedKeys = Object.keys(await readStorage()).filter((key) => key.startsWith('capture:'));
    const hasDocument = await hasOffscreenDocument();
    return storedKeys.length === 0 && hasDocument === false;
  }, {
    timeout: 500,
  }).toBe(true);

  expect(Date.now() - startedAt).toBeLessThanOrEqual(500);
});
