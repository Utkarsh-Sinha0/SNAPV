import { scanTextNode } from '../shared/dom-redact';
import { getWebExtensionNamespace } from '../shared/webextension-namespace';
import type { ExportSpec, RectLike, RedactAnnotation } from '../shared/types';
import { applyCleanCapture } from './clean-capture';

type ContentMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

type RuntimeLike = {
  sendMessage: (message: unknown) => Promise<unknown>;
  onMessage: {
    addListener: (listener: ContentMessageListener) => void;
    removeListener?: (listener: ContentMessageListener) => void;
  };
};

type WindowLike = Window & typeof globalThis;

export type ContentBindings = {
  document: Document;
  runtime: RuntimeLike;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  window: WindowLike;
};

export type CaptureRegionTriggerMessage = {
  type: 'CAPTURE_REGION';
  tabId?: number;
  spec?: ExportSpec;
};

export type PickDomElementTriggerMessage = {
  type: 'PICK_DOM_ELEMENT';
  tabId?: number;
  spec?: ExportSpec;
};

export type ShowCaptureActionBarMessage = {
  type: 'SHOW_CAPTURE_ACTION_BAR';
  captureId: string;
  tabId?: number;
  captureMode?: 'visible' | 'region';
  spec?: ExportSpec;
};

export type ApplyCleanCaptureMessage = {
  type: 'APPLY_CLEAN_CAPTURE';
  css?: string;
};

export type RunDomRedactionMessage = {
  type: 'RUN_DOM_REDACTION';
};

type SupportedContentMessage =
  | CaptureRegionTriggerMessage
  | PickDomElementTriggerMessage
  | ShowCaptureActionBarMessage
  | ApplyCleanCaptureMessage
  | RunDomRedactionMessage;

const REGION_OVERLAY_SELECTOR = '[data-snapvault-region-overlay="true"]';
const ELEMENT_PICKER_ATTR = 'data-snapvault-element-picker';
const ACTION_BAR_SELECTOR = '[data-snapvault-action-bar="true"]';

function getDefaultBindings(): ContentBindings {
  const extensionApi = getWebExtensionNamespace<{
    runtime: RuntimeLike;
  }>();

  return {
    document,
    runtime: extensionApi.runtime,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    window,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSupportedContentMessage(message: unknown): message is SupportedContentMessage {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return false;
  }

  return (
    message.type === 'CAPTURE_REGION' ||
    message.type === 'PICK_DOM_ELEMENT' ||
    message.type === 'SHOW_CAPTURE_ACTION_BAR' ||
    message.type === 'APPLY_CLEAN_CAPTURE' ||
    message.type === 'RUN_DOM_REDACTION'
  );
}

function removeExistingNode(documentLike: Document, selector: string): void {
  documentLike.querySelector(selector)?.remove();
}

function normalizeRect(startX: number, startY: number, endX: number, endY: number): RectLike {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function escapeSelectorFragment(value: string): string {
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

export function buildUniqueSelector(element: Element): string {
  if (element.id) {
    return `#${escapeSelectorFragment(element.id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let part = current.tagName.toLowerCase();
    if (current.classList.length > 0) {
      part += `.${Array.from(current.classList)
        .slice(0, 2)
        .map(escapeSelectorFragment)
        .join('.')}`;
    }

    const siblings = Array.from(current.parentElement?.children ?? []).filter(
      (candidate) => candidate.tagName === current?.tagName,
    );
    if (siblings.length > 1) {
      part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }

    parts.unshift(part);
    const selector = parts.join(' > ');
    if (current.ownerDocument?.querySelectorAll(selector).length === 1) {
      return selector;
    }

    current = current.parentElement;
  }

  return parts.join(' > ') || element.tagName.toLowerCase();
}

export function startRegionSelection(
  message: CaptureRegionTriggerMessage,
  bindings: ContentBindings = getDefaultBindings(),
): () => void {
  removeExistingNode(bindings.document, REGION_OVERLAY_SELECTOR);

  const overlay = bindings.document.createElement('div');
  overlay.dataset.snapvaultRegionOverlay = 'true';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '2147483647';
  overlay.style.background = 'rgba(15, 23, 42, 0.28)';
  overlay.style.cursor = 'crosshair';

  const selectionBox = bindings.document.createElement('div');
  selectionBox.style.position = 'absolute';
  selectionBox.style.border = '2px solid #38bdf8';
  selectionBox.style.background = 'rgba(56, 189, 248, 0.15)';
  overlay.append(selectionBox);

  let dragStart: { x: number; y: number } | null = null;

  function updateSelection(currentX: number, currentY: number) {
    if (!dragStart) {
      return;
    }

    const rect = normalizeRect(dragStart.x, dragStart.y, currentX, currentY);
    selectionBox.style.left = `${rect.x}px`;
    selectionBox.style.top = `${rect.y}px`;
    selectionBox.style.width = `${rect.width}px`;
    selectionBox.style.height = `${rect.height}px`;
  }

  function cleanup() {
    overlay.remove();
    bindings.window.removeEventListener('mousemove', handleMouseMove, true);
    bindings.window.removeEventListener('mouseup', handleMouseUp, true);
  }

  function handleMouseMove(event: MouseEvent) {
    updateSelection(event.clientX, event.clientY);
  }

  function handleMouseUp(event: MouseEvent) {
    if (!dragStart) {
      cleanup();
      return;
    }

    const rect = normalizeRect(dragStart.x, dragStart.y, event.clientX, event.clientY);
    const nextMessage =
      typeof message.tabId === 'number' && message.spec
        ? {
            type: 'CAPTURE_REGION',
            tabId: message.tabId,
            spec: message.spec,
            rect,
          }
        : {
            type: 'CAPTURE_REGION_SELECTED',
            rect,
          };

    void bindings.runtime.sendMessage(nextMessage);
    cleanup();
  }

  overlay.addEventListener('mousedown', (event) => {
    dragStart = {
      x: event.clientX,
      y: event.clientY,
    };
    updateSelection(event.clientX, event.clientY);
    event.preventDefault();
  });
  bindings.window.addEventListener('mousemove', handleMouseMove, true);
  bindings.window.addEventListener('mouseup', handleMouseUp, true);
  bindings.document.body.append(overlay);

  return cleanup;
}

export function startElementPicker(
  message: PickDomElementTriggerMessage,
  bindings: ContentBindings = getDefaultBindings(),
): () => void {
  removeExistingNode(bindings.document, `[${ELEMENT_PICKER_ATTR}="true"]`);

  const marker = bindings.document.createElement('div');
  marker.setAttribute(ELEMENT_PICKER_ATTR, 'true');
  marker.hidden = true;
  bindings.document.body.append(marker);

  let activeElement: HTMLElement | null = null;
  let previousOutline = '';
  let previousOutlineOffset = '';

  function clearHighlight() {
    if (!activeElement) {
      return;
    }

    activeElement.style.outline = previousOutline;
    activeElement.style.outlineOffset = previousOutlineOffset;
    activeElement = null;
  }

  function cleanup() {
    clearHighlight();
    marker.remove();
    bindings.window.removeEventListener('mousemove', handleMouseMove, true);
    bindings.window.removeEventListener('click', handleClick, true);
    bindings.document.body.style.cursor = '';
  }

  function handleMouseMove(event: MouseEvent) {
    const candidate = event.target instanceof HTMLElement ? event.target : null;
    if (!candidate || candidate === marker || candidate === activeElement) {
      return;
    }

    clearHighlight();
    activeElement = candidate;
    previousOutline = candidate.style.outline;
    previousOutlineOffset = candidate.style.outlineOffset;
    candidate.style.outline = '2px solid #38bdf8';
    candidate.style.outlineOffset = '2px';
  }

  function handleClick(event: MouseEvent) {
    const candidate = event.target instanceof HTMLElement ? event.target : null;
    if (!candidate) {
      cleanup();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = candidate.getBoundingClientRect();
    void bindings.runtime.sendMessage({
      type: 'PICK_DOM_ELEMENT_RESULT',
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      selector: buildUniqueSelector(candidate),
      ...(typeof message.tabId === 'number' ? { tabId: message.tabId } : {}),
      ...(message.spec ? { spec: message.spec } : {}),
    });

    cleanup();
  }

  bindings.document.body.style.cursor = 'crosshair';
  bindings.window.addEventListener('mousemove', handleMouseMove, true);
  bindings.window.addEventListener('click', handleClick, true);

  return cleanup;
}

function buildActionButton(
  label: string,
  message: Record<string, unknown>,
  teardown: () => void,
  bindings: ContentBindings,
): HTMLButtonElement {
  const button = bindings.document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.border = 'none';
  button.style.borderRadius = '999px';
  button.style.padding = '8px 12px';
  button.style.background = '#0f172a';
  button.style.color = '#f8fafc';
  button.style.cursor = 'pointer';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void bindings.runtime.sendMessage(message);
    teardown();
  });

  return button;
}

export function showCaptureActionBar(
  message: ShowCaptureActionBarMessage,
  bindings: ContentBindings = getDefaultBindings(),
): () => void {
  removeExistingNode(bindings.document, ACTION_BAR_SELECTOR);

  const bar = bindings.document.createElement('div');
  bar.dataset.snapvaultActionBar = 'true';
  bar.style.position = 'fixed';
  bar.style.left = '50%';
  bar.style.bottom = '20px';
  bar.style.transform = 'translateX(-50%)';
  bar.style.zIndex = '2147483647';
  bar.style.display = 'flex';
  bar.style.gap = '8px';
  bar.style.padding = '10px 12px';
  bar.style.borderRadius = '999px';
  bar.style.background = 'rgba(15, 23, 42, 0.95)';
  bar.style.boxShadow = '0 18px 40px rgba(15, 23, 42, 0.24)';

  let timeoutId = 0 as unknown as ReturnType<typeof globalThis.setTimeout>;

  function teardown() {
    bindings.clearTimeout(timeoutId);
    bar.remove();
    bindings.window.removeEventListener('click', handleWindowClick, true);
  }

  function handleWindowClick(event: MouseEvent) {
    if (!bar.contains(event.target as Node)) {
      teardown();
    }
  }

  const commonPayload = {
    captureId: message.captureId,
    ...(message.spec ? { spec: message.spec } : {}),
    ...(typeof message.tabId === 'number' ? { tabId: message.tabId } : {}),
    ...(message.captureMode ? { captureMode: message.captureMode } : {}),
  };

  bar.append(
    buildActionButton(
      'Copy',
      {
        type: 'EXPORT_CLIPBOARD',
        ...commonPayload,
      },
      teardown,
      bindings,
    ),
    buildActionButton(
      'Download',
      {
        type: 'EXPORT_DOWNLOAD',
        ...commonPayload,
      },
      teardown,
      bindings,
    ),
    buildActionButton(
      'Editor',
      {
        type: 'OPEN_EDITOR',
        ...commonPayload,
      },
      teardown,
      bindings,
    ),
    buildActionButton(
      'Re-capture',
      {
        type: 'RECAPTURE',
        ...commonPayload,
      },
      teardown,
      bindings,
    ),
  );

  bindings.document.body.append(bar);
  bindings.window.addEventListener('click', handleWindowClick, true);
  timeoutId = bindings.setTimeout(() => teardown(), 8_000);

  return teardown;
}

function isVisibleTextParent(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

export function runDomRedactionScan(
  documentLike: Document = document,
): { annotations: RedactAnnotation[] } {
  const annotations: RedactAnnotation[] = [];
  const walker = documentLike.createTreeWalker(documentLike.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let index = 0;

  while (node) {
    const textNode = node as Text;
    const text = textNode.textContent?.trim() ?? '';
    const parent = textNode.parentElement;

    if (text.length > 0 && parent && isVisibleTextParent(parent)) {
      const range = documentLike.createRange();
      range.selectNodeContents(textNode);
      const rect = range.getBoundingClientRect();
      const matches = scanTextNode(text);

      if (rect.width > 0 && rect.height > 0) {
        for (const match of matches) {
          annotations.push({
            id: `dom-${index}`,
            type: match,
            rect: {
              x: rect.x,
              y: rect.y,
              w: rect.width,
              h: rect.height,
            },
            confidence: 0.75,
            source: 'dom',
            userReviewed: false,
          });
          index += 1;
        }
      }
    }

    node = walker.nextNode();
  }

  return { annotations };
}

export function attachContentScriptHandlers(
  bindings: ContentBindings = getDefaultBindings(),
): () => void {
  let cleanupCurrentInteraction: (() => void) | null = null;
  let cleanupCleanCapture: (() => void) | null = null;

  const listener: ContentMessageListener = (message, _sender, sendResponse) => {
    if (!isSupportedContentMessage(message)) {
      return;
    }

    if (message.type === 'APPLY_CLEAN_CAPTURE') {
      cleanupCleanCapture?.();
      cleanupCleanCapture = null;
      if (message.css && message.css.trim().length > 0) {
        cleanupCleanCapture = applyCleanCapture(message.css, bindings.document);
      }
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'RUN_DOM_REDACTION') {
      sendResponse(runDomRedactionScan(bindings.document));
      return;
    }

    cleanupCurrentInteraction?.();
    cleanupCurrentInteraction = null;

    if (message.type === 'CAPTURE_REGION') {
      cleanupCurrentInteraction = startRegionSelection(message, bindings);
      return;
    }

    if (message.type === 'PICK_DOM_ELEMENT') {
      cleanupCurrentInteraction = startElementPicker(message, bindings);
      return;
    }

    cleanupCurrentInteraction = showCaptureActionBar(message, bindings);
  };

  bindings.runtime.onMessage.addListener(listener);

  return () => {
    cleanupCurrentInteraction?.();
    cleanupCleanCapture?.();
    bindings.runtime.onMessage.removeListener?.(listener);
  };
}
