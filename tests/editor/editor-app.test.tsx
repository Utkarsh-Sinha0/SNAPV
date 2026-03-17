import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorApp, type EditorAnnotation } from '../../src/editor/EditorApp';
import type { EditorApis } from '../../src/editor/editor-api';
import {
  createSolidTestImage,
  getCanvasContext,
  installCanvasMocks,
  setImagePixel,
  type TestImage,
} from './canvas-test-utils';
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

function createApis() {
  const runtimeListeners: Array<
    (
      message: unknown,
      sender: unknown,
      sendResponse: (response?: unknown) => void,
    ) => boolean | void
  > = [];

  const sendMessage = vi.fn(async (message: unknown) => {
    const payload = message as { type?: string };
    if (payload.type === 'GET_CAPTURE_DATA_URL') {
      return {
        dataUrl: 'data:image/png;base64,test',
        metadata: {
          cssWidth: 120,
          cssHeight: 100,
          devicePixelRatio: 1,
          screenLeft: 0,
          screenTop: 0,
          lightMode: false,
          capturedAt: 1,
        },
        sourceTabId: 91,
      };
    }

    if (payload.type === 'EXPORT_DOWNLOAD') {
      return { filename: 'snapvault.png' };
    }

    if (payload.type === 'RUN_DOM_REDACTION') {
      return {
        annotations: [
          {
            id: 'dom-1',
            type: 'email',
            rect: { x: 5, y: 10, w: 25, h: 15 },
            confidence: 0.8,
            source: 'dom',
            userReviewed: false,
          },
        ],
      };
    }

    if (payload.type === 'OPEN_CAPTURE_BOARD') {
      return {
        ok: false,
        error: 'Pro license required',
      };
    }

    return {
      dataUrl: 'data:image/png;base64,encoded',
      mimeType: 'image/png',
    };
  });

  const apis: EditorApis = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (callback) => {
          runtimeListeners.push(callback);
        },
        removeListener: (callback) => {
          const index = runtimeListeners.indexOf(callback);
          if (index >= 0) {
            runtimeListeners.splice(index, 1);
          }
        },
      },
    },
    storage: {
      get: vi.fn(async () => ({})),
    },
  };

  return {
    apis,
    runtimeListeners,
    sendMessage,
  };
}

function renderEditor(options?: {
  image?: TestImage;
  apis?: EditorApis;
  initialCaptureId?: string;
  onAnnotationsChange?: (annotations: EditorAnnotation[]) => void;
}) {
  const image = options?.image ?? createSolidTestImage(120, 100, [255, 255, 255, 255]);
  const loadImage = vi.fn(async () => image as never);
  const props = {
    initialSpec: baseSpec,
    loadImage,
    ...(options?.apis ? { apis: options.apis } : {}),
    ...(options?.initialCaptureId ? { initialCaptureId: options.initialCaptureId } : {}),
    ...(options?.onAnnotationsChange ? { onAnnotationsChange: options.onAnnotationsChange } : {}),
  };

  const view = render(<EditorApp {...props} />);

  return {
    ...view,
    loadImage,
    image,
    canvas: () => screen.getByLabelText('Editor canvas') as HTMLCanvasElement,
  };
}

describe('EditorApp', () => {
  let restoreCanvasMocks: (() => void) | null = null;

  beforeEach(() => {
    restoreCanvasMocks = installCanvasMocks();
    window.history.replaceState({}, '', '/editor.html');
  });

  afterEach(() => {
    cleanup();
    restoreCanvasMocks?.();
    restoreCanvasMocks = null;
  });

  async function waitForCaptureLoad() {
    await waitFor(() =>
      expect(screen.getByLabelText('Editor status').textContent).toContain('Loaded capture'),
    );
  }

  it('requests the capture id from the URL and draws the loaded image on canvas', async () => {
    const { apis, sendMessage } = createApis();
    window.history.replaceState({}, '', '/editor.html?captureId=capture-77');

    const { canvas, image } = renderEditor({ apis });

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'GET_CAPTURE_DATA_URL',
        captureId: 'capture-77',
      }),
    );

    await waitFor(() => {
      const context = getCanvasContext(canvas());
      expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0);
    });
  });

  it('creates an arrow annotation from mouse drag coordinates', async () => {
    const { apis } = createApis();
    const onAnnotationsChange = vi.fn();
    const { canvas } = renderEditor({
      apis,
      initialCaptureId: 'capture-arrow',
      onAnnotationsChange,
    });

    await waitForCaptureLoad();

    fireEvent.mouseDown(canvas(), { clientX: 10, clientY: 20 });
    fireEvent.mouseMove(canvas(), { clientX: 60, clientY: 90 });
    fireEvent.mouseUp(canvas(), { clientX: 60, clientY: 90 });

    await waitFor(() =>
      expect(onAnnotationsChange).toHaveBeenLastCalledWith([
        expect.objectContaining({
          type: 'arrow',
          startX: 10,
          startY: 20,
          endX: 60,
          endY: 90,
        }),
      ]),
    );
  });

  it('opens an inline textarea for text annotations and stores the content on blur', async () => {
    const { apis } = createApis();
    const onAnnotationsChange = vi.fn();
    const { canvas } = renderEditor({
      apis,
      initialCaptureId: 'capture-text',
      onAnnotationsChange,
    });

    await waitForCaptureLoad();

    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.click(canvas(), { clientX: 50, clientY: 80 });

    const textarea = screen.getByLabelText('Annotation text editor') as HTMLTextAreaElement;
    expect(textarea.style.left).toBe('50px');
    expect(textarea.style.top).toBe('80px');

    fireEvent.input(textarea, {
      currentTarget: { value: 'Ship this' },
      target: { value: 'Ship this' },
    });
    fireEvent.blur(textarea);

    await waitFor(() =>
      expect(onAnnotationsChange).toHaveBeenLastCalledWith([
        expect.objectContaining({
          type: 'text',
          x: 50,
          y: 80,
          content: 'Ship this',
        }),
      ]),
    );
  });

  it('commits text annotations only once when Enter also triggers blur', async () => {
    const { apis } = createApis();
    const onAnnotationsChange = vi.fn();
    const { canvas } = renderEditor({
      apis,
      initialCaptureId: 'capture-text-enter',
      onAnnotationsChange,
    });

    await waitForCaptureLoad();

    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.click(canvas(), { clientX: 12, clientY: 18 });

    const textarea = screen.getByLabelText('Annotation text editor') as HTMLTextAreaElement;
    fireEvent.input(textarea, {
      currentTarget: { value: 'Only once' },
      target: { value: 'Only once' },
    });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    fireEvent.blur(textarea);

    await waitFor(() =>
      expect(onAnnotationsChange).toHaveBeenLastCalledWith([
        expect.objectContaining({
          type: 'text',
          content: 'Only once',
        }),
      ]),
    );
    expect(screen.getByLabelText('Annotation count').textContent).toBe('1');
  });

  it('creates a highlight annotation from a drag gesture', async () => {
    const { apis } = createApis();
    const onAnnotationsChange = vi.fn();
    const { canvas } = renderEditor({
      apis,
      initialCaptureId: 'capture-highlight',
      onAnnotationsChange,
    });

    await waitForCaptureLoad();

    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    fireEvent.mouseDown(canvas(), { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas(), { clientX: 60, clientY: 60 });
    fireEvent.mouseUp(canvas(), { clientX: 60, clientY: 60 });

    await waitFor(() =>
      expect(onAnnotationsChange).toHaveBeenLastCalledWith([
        expect.objectContaining({
          type: 'highlight',
          rect: {
            x: 10,
            y: 10,
            w: 50,
            h: 50,
          },
        }),
      ]),
    );
  });

  it('renders blur annotations by mutating pixels inside the dragged region', async () => {
    const { apis } = createApis();
    const image = createSolidTestImage(4, 4, [255, 255, 255, 255]);
    setImagePixel(image, 1, 1, [0, 0, 0, 255]);

    const { canvas } = renderEditor({
      apis,
      initialCaptureId: 'capture-blur',
      image,
    });

    await waitForCaptureLoad();

    const context = getCanvasContext(canvas());
    await waitFor(() =>
      expect(context.getPixel(1, 1)).toEqual([0, 0, 0, 255]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Blur' }));
    fireEvent.mouseDown(canvas(), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(canvas(), { clientX: 3, clientY: 3 });
    fireEvent.mouseUp(canvas(), { clientX: 3, clientY: 3 });

    await waitFor(() =>
      expect(context.getPixel(1, 1)).not.toEqual([0, 0, 0, 255]),
    );
  });

  it('supports undo with Ctrl+Z by removing the newest annotations', async () => {
    const { apis } = createApis();
    const onAnnotationsChange = vi.fn();
    const { canvas } = renderEditor({
      apis,
      initialCaptureId: 'capture-undo',
      onAnnotationsChange,
    });

    await waitForCaptureLoad();

    fireEvent.mouseDown(canvas(), { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(canvas(), { clientX: 20, clientY: 20 });
    fireEvent.mouseDown(canvas(), { clientX: 30, clientY: 30 });
    fireEvent.mouseUp(canvas(), { clientX: 40, clientY: 40 });
    fireEvent.mouseDown(canvas(), { clientX: 50, clientY: 50 });
    fireEvent.mouseUp(canvas(), { clientX: 60, clientY: 60 });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));

    await waitFor(() => expect(screen.getByLabelText('Annotation count').textContent).toBe('1'));
    await waitFor(() =>
      expect(onAnnotationsChange.mock.calls.at(-1)?.[0] as EditorAnnotation[] | undefined).toHaveLength(1),
    );

    const lastAnnotations = onAnnotationsChange.mock.calls.at(-1)?.[0] as EditorAnnotation[] | undefined;
    expect(lastAnnotations?.[0]).toEqual(
      expect.objectContaining({
        type: 'arrow',
        startX: 10,
        startY: 10,
        endX: 20,
        endY: 20,
      }),
    );
  });

  it('exports by sending APPLY_EXPORT_SPEC before EXPORT_DOWNLOAD', async () => {
    const { apis, sendMessage } = createApis();
    renderEditor({
      apis,
      initialCaptureId: 'capture-export',
    });

    await waitForCaptureLoad();

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => {
      const calls = sendMessage.mock.calls.map(([message]) => message as { type: string });
      expect(calls.slice(-3)).toEqual([
        {
          type: 'STORE_CAPTURE_DATA_URL',
          captureId: 'capture-export',
          dataUrl: expect.stringMatching(/^data:image\/png;base64,canvas-\d+x\d+$/),
          metadata: {
            cssWidth: 120,
            cssHeight: 100,
            devicePixelRatio: 1,
            screenLeft: 0,
            screenTop: 0,
            lightMode: false,
            capturedAt: 1,
          },
          sourceTabId: 91,
        },
        {
          type: 'APPLY_EXPORT_SPEC',
          captureId: 'capture-export',
          spec: baseSpec,
        },
        {
          type: 'EXPORT_DOWNLOAD',
          captureId: 'capture-export',
          spec: baseSpec,
        },
      ]);
    });
  });

  it('loads DOM redaction suggestions and confirms them into blur annotations', async () => {
    const { apis, sendMessage } = createApis();
    renderEditor({
      apis,
      initialCaptureId: 'capture-redaction',
    });

    await waitForCaptureLoad();

    fireEvent.click(screen.getByRole('button', { name: 'Run DOM Redaction' }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'RUN_DOM_REDACTION',
        tabId: 91,
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Pending redaction count').textContent).toBe('1'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm redactions' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Annotation count').textContent).toBe('1'),
    );
    expect(screen.getByLabelText('Pending redaction count').textContent).toBe('0');
  });

  it('shows the board gate error when a free user tries to open the board', async () => {
    const { apis, sendMessage } = createApis();
    renderEditor({
      apis,
      initialCaptureId: 'capture-board-gate',
    });

    await waitForCaptureLoad();
    fireEvent.click(screen.getByRole('button', { name: 'Open board' }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'OPEN_CAPTURE_BOARD',
        captureIds: ['capture-board-gate'],
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Editor status').textContent).toContain('Pro license required'),
    );
  });

  it('loads board mode from the URL and exports the board through the background service', async () => {
    const { apis, sendMessage } = createApis();
    window.history.replaceState({}, '', '/editor.html?board=1&captureIds=one,two,three');

    renderEditor({ apis });

    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(3),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export board' }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'EXPORT_CAPTURE_BOARD',
        captureIds: ['one', 'two', 'three'],
        spec: baseSpec,
      }),
    );
  });
});
