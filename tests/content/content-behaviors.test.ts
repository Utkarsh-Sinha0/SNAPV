import { fireEvent } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachContentScriptHandlers,
  buildUniqueSelector,
  type ContentBindings,
} from '../../src/content/content-behaviors';
import type { ExportSpec } from '../../src/shared/types';

const baseSpec: ExportSpec = {
  format: 'png',
  dimensions: {
    mode: 'preset',
    presetId: 'original',
  },
  dpiPolicy: 'device',
  filenameTemplate: 'snapvault-{date}-{time}.{format}',
};

function createBindings(): {
  bindings: ContentBindings;
  runtimeListeners: Array<
    (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void
  >;
  sendMessage: ReturnType<typeof vi.fn>;
} {
  const runtimeListeners: Array<
    (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void
  > = [];
  const sendMessage = vi.fn(async () => ({ ok: true }));

  return {
    runtimeListeners,
    sendMessage,
    bindings: {
      document,
      runtime: {
        sendMessage,
        onMessage: {
          addListener: (listener) => {
            runtimeListeners.push(listener);
          },
          removeListener: (listener) => {
            const index = runtimeListeners.indexOf(listener);
            if (index >= 0) {
              runtimeListeners.splice(index, 1);
            }
          },
        },
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      window,
    },
  };
}

describe('content behaviors', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('adds a region overlay and sends the selected rect back to runtime', async () => {
    const { bindings, runtimeListeners, sendMessage } = createBindings();
    const cleanup = attachContentScriptHandlers(bindings);

    runtimeListeners[0](
      {
        type: 'CAPTURE_REGION',
        tabId: 9,
        spec: baseSpec,
      },
      {},
      () => undefined,
    );

    const overlay = document.querySelector('[data-snapvault-region-overlay="true"]') as HTMLDivElement;
    expect(overlay).toBeTruthy();

    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60, clientY: 50 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 60, clientY: 50 }));

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'CAPTURE_REGION',
      tabId: 9,
      spec: baseSpec,
      rect: {
        x: 10,
        y: 10,
        width: 50,
        height: 40,
      },
    });
    expect(document.querySelector('[data-snapvault-region-overlay="true"]')).toBeNull();

    cleanup();
  });

  it('highlights hovered elements and returns rect plus selector when clicked', async () => {
    const { bindings, runtimeListeners, sendMessage } = createBindings();
    const cleanup = attachContentScriptHandlers(bindings);
    const button = document.createElement('button');
    button.id = 'target-button';
    button.textContent = 'Pick me';
    button.getBoundingClientRect = () =>
      ({
        x: 15,
        y: 25,
        width: 120,
        height: 45,
      }) as DOMRect;
    document.body.append(button);

    runtimeListeners[0]({ type: 'PICK_DOM_ELEMENT' }, {}, () => undefined);

    button.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(button.style.outline).toContain('solid');
    expect(button.style.outline).toContain('2px');
    expect(buildUniqueSelector(button)).toBe('#target-button');

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'PICK_DOM_ELEMENT_RESULT',
      rect: {
        x: 15,
        y: 25,
        width: 120,
        height: 45,
      },
      selector: '#target-button',
    });
    expect(button.style.outline).toBe('');

    cleanup();
  });

  it('renders the capture action bar and sends the correct button message', async () => {
    const { bindings, runtimeListeners, sendMessage } = createBindings();
    const cleanup = attachContentScriptHandlers(bindings);

    runtimeListeners[0](
      {
        type: 'SHOW_CAPTURE_ACTION_BAR',
        captureId: 'capture-1',
        tabId: 4,
        captureMode: 'visible',
        spec: baseSpec,
      },
      {},
      () => undefined,
    );

    expect(document.querySelector('[data-snapvault-action-bar="true"]')).toBeTruthy();
    for (const label of ['Copy', 'Download', 'Editor', 'Re-capture']) {
      expect(document.querySelector(`button`)).toBeTruthy();
      expect(
        Array.from(document.querySelectorAll('button')).some(
          (button) => button.textContent === label,
        ),
      ).toBe(true);
    }

    const copyButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Copy',
    ) as HTMLButtonElement;
    fireEvent.click(copyButton);

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'EXPORT_CLIPBOARD',
        captureId: 'capture-1',
        tabId: 4,
        captureMode: 'visible',
        spec: baseSpec,
      }),
    );
    expect(document.querySelector('[data-snapvault-action-bar="true"]')).toBeNull();

    cleanup();
  });

  it('removes the action bar after eight seconds', async () => {
    vi.useFakeTimers();
    const { bindings, runtimeListeners } = createBindings();
    const cleanup = attachContentScriptHandlers(bindings);

    runtimeListeners[0](
      {
        type: 'SHOW_CAPTURE_ACTION_BAR',
        captureId: 'capture-timeout',
      },
      {},
      () => undefined,
    );

    expect(document.querySelector('[data-snapvault-action-bar="true"]')).toBeTruthy();
    vi.advanceTimersByTime(8_000);
    expect(document.querySelector('[data-snapvault-action-bar="true"]')).toBeNull();

    cleanup();
  });
});
