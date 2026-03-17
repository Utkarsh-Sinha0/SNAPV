import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(__dirname),
  testMatch: ['*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  outputDir: path.join(process.cwd(), 'output', 'playwright'),
  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
      },
      grepInvert: /@hidpi/,
    },
    {
      name: 'chromium-extension-hidpi',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        deviceScaleFactor: 2,
      },
      grep: /@hidpi/,
    },
    {
      name: 'edge-extension',
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
      },
      grepInvert: /@hidpi/,
    },
    {
      name: 'edge-extension-hidpi',
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        deviceScaleFactor: 2,
      },
      grep: /@hidpi/,
    },
  ],
});
