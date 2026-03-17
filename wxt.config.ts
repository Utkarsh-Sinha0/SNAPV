import { defineConfig } from 'wxt';

const supportedBrowsers = ['chrome', 'firefox', 'edge'] as const;
type SupportedBrowser = (typeof supportedBrowsers)[number];

const requestedBrowser = process.env.TARGET_BROWSER ?? 'chrome';
if (!supportedBrowsers.includes(requestedBrowser as SupportedBrowser)) {
  throw new Error(
    `Unsupported TARGET_BROWSER "${requestedBrowser}". Expected one of: ${supportedBrowsers.join(', ')}`,
  );
}

const targetBrowser = requestedBrowser as SupportedBrowser;
const isFirefox = targetBrowser === 'firefox';

const permissions = [
  'activeTab',
  'storage',
  'downloads',
  'clipboardWrite',
  'scripting',
  ...(process.env.SNAPVAULT_E2E === '1' ? ['tabs'] : []),
  ...(isFirefox ? [] : ['offscreen']),
];

const hostPermissions = process.env.SNAPVAULT_E2E === '1' ? ['<all_urls>'] : undefined;
const manifest = {
  name: 'SnapVault',
  description: 'Local-first browser capture extension for screenshots and exports.',
  permissions,
  ...(hostPermissions ? { host_permissions: hostPermissions } : {}),
  ...(!isFirefox ? { sandbox: { pages: ['ads_sandbox.html'] } } : {}),
  ...(isFirefox
    ? {
        browser_specific_settings: {
          gecko: {
            data_collection_permissions: {
              required: ['none'],
            },
            id: 'snapvault@snapvault.app',
            strict_min_version: '115.0',
          },
        },
      }
    : {}),
};

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: '.',
  outDir: `dist/${targetBrowser}`,
  browser: targetBrowser,
  manifestVersion: isFirefox ? 2 : 3,
  vite: () => ({
    define: {
      __SNAPVAULT_E2E__: JSON.stringify(process.env.SNAPVAULT_E2E === '1'),
    },
    build: {
      // The local ML/runtime assets intentionally produce large generated chunks, so keep
      // Vite from flagging expected release output as console noise in CI.
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        onwarn(warning, warn) {
          const isTransformersPureAnnotationNotice =
            warning.code === 'INVALID_ANNOTATION'
            && warning.id?.includes('@huggingface/transformers/dist/transformers.web.js');

          if (isTransformersPureAnnotationNotice) {
            return;
          }

          warn(warning);
        },
      },
    },
  }),
  manifest,
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
