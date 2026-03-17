import { initializeHeavyWorkerMessaging } from '../shared/offscreen-adapter';
import {
  registerCaptureMessageHandlers,
  scheduleStartupCaptureTasks,
} from './capture-service';
import { registerExportMessageHandlers } from './export-service';
import { registerProMessageHandlers } from './pro-service';
import { registerBackgroundPageMessageListener } from './background-page';

export default defineBackground(() => {
  initializeHeavyWorkerMessaging();
  registerCaptureMessageHandlers();
  registerExportMessageHandlers();
  registerProMessageHandlers();
  registerBackgroundPageMessageListener();
  scheduleStartupCaptureTasks();

  console.log('SW started');
});
