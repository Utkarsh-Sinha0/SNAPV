import {
  registerCaptureMessageHandlers,
  scheduleStartupCaptureTasks,
} from './capture-service';
import { registerBackgroundE2EBridge } from './e2e-bridge';
import { registerBackgroundShell } from './background-shell';
import { registerExportMessageHandlers } from './export-service';
import { registerProMessageHandlers } from './pro-service';

declare const __SNAPVAULT_E2E__: boolean;

export default defineBackground(() => {
  registerBackgroundShell();
  registerCaptureMessageHandlers();
  registerExportMessageHandlers();
  registerProMessageHandlers();
  if (__SNAPVAULT_E2E__) {
    registerBackgroundE2EBridge();
  }
  scheduleStartupCaptureTasks();

  console.log('SW started');
});
