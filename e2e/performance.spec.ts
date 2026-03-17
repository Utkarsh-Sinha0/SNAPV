import { test, expect } from './extension-fixtures';

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

  const median = [...timings].sort((left, right) => left - right)[2]!;
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

  const median = [...durations].sort((left, right) => left - right)[2]!;
  expect(median).toBeLessThan(1_000);
  await popup.close();
});
