import { attachContentScriptHandlers } from './content-behaviors';

export * from './content-behaviors';

export default defineContentScript({
  registration: 'runtime',
  main() {
    attachContentScriptHandlers();
    console.log('SnapVault content script ready');
  },
});
