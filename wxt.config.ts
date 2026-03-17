import { defineConfig } from 'wxt';

const targetBrowser = process.env.TARGET_BROWSER === 'firefox' ? 'firefox' : 'chrome';

const permissions = [
  'activeTab',
  'storage',
  'downloads',
  'clipboardWrite',
  'scripting',
  ...(process.env.SNAPVAULT_E2E === '1' ? ['tabs'] : []),
  ...(targetBrowser === 'firefox' ? [] : ['offscreen']),
];

const hostPermissions = process.env.SNAPVAULT_E2E === '1' ? ['<all_urls>'] : undefined;

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: '.',
  outDir: `dist/${targetBrowser}`,
  browser: targetBrowser,
  manifestVersion: targetBrowser === 'firefox' ? 2 : 3,
  vite: () => ({
    build: {
      chunkSizeWarningLimit: 600,
    },
  }),
  manifest: {
    name: 'SnapVault',
    description: 'Local-first browser capture extension for screenshots and exports.',
    permissions,
    host_permissions: hostPermissions,
    sandbox: targetBrowser === 'firefox' ? undefined : { pages: ['ads_sandbox.html'] },
  },
  hooks: {
    'build:manifestGenerated': (_, manifest) => {
      if (process.env.SNAPVAULT_E2E === '1') {
        manifest.content_scripts = [
          {
            matches: ['<all_urls>'],
            js: ['content-scripts/content.js'],
            run_at: 'document_idle',
          },
        ];
      }
    },
  },
});
