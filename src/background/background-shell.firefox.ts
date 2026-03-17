import { registerBackgroundPageMessageListener } from './background-page';

export function registerBackgroundShell(): void {
  registerBackgroundPageMessageListener();
}
