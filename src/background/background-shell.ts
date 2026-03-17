import { registerBackgroundShell as registerChromiumBackgroundShell } from './background-shell.chromium';
import { registerBackgroundShell as registerFirefoxBackgroundShell } from './background-shell.firefox';

declare const __SNAPVAULT_TARGET_FAMILY__: 'chromium' | 'firefox';

const targetFamily =
  typeof __SNAPVAULT_TARGET_FAMILY__ === 'string'
    ? __SNAPVAULT_TARGET_FAMILY__
    : 'chromium';

export function registerBackgroundShell(): void {
  if (targetFamily === 'firefox') {
    registerFirefoxBackgroundShell();
    return;
  }

  registerChromiumBackgroundShell();
}
