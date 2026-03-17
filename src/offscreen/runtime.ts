import { registerOffscreenMessageListener as registerChromiumOffscreenListener } from './runtime.chromium';
import { registerOffscreenMessageListener as registerFirefoxOffscreenListener } from './runtime.firefox';

declare const __SNAPVAULT_TARGET_FAMILY__: 'chromium' | 'firefox';

const targetFamily =
  typeof __SNAPVAULT_TARGET_FAMILY__ === 'string'
    ? __SNAPVAULT_TARGET_FAMILY__
    : 'chromium';

function registerRuntimeShell(): void {
  if (targetFamily === 'firefox') {
    registerFirefoxOffscreenListener();
    return;
  }

  registerChromiumOffscreenListener();
}

registerRuntimeShell();
