import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AnnotationToolbar, type EditorTool } from './components/AnnotationToolbar';
import {
  applyExportSpec,
  exportCaptureBoard,
  exportToDownloads,
  getBoardCaptureIdsFromLocation,
  getCaptureIdFromLocation,
  getEditorApis,
  isEditorCaptureMessage,
  loadImageFromDataUrl,
  loadStoredEditorSpec,
  openCaptureBoard,
  requestCaptureData,
  runDomRedaction,
  storeCaptureData,
  type EditorApis,
  type LoadedEditorImage,
} from './editor-api';
import { getDefaultExportSpec } from '../shared/export-spec';
import type { CaptureMetadata, ExportSpec, RedactAnnotation } from '../shared/types';

type BaseRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EditorAnnotation =
  | {
      id: string;
      type: 'arrow';
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }
  | {
      id: string;
      type: 'text';
      x: number;
      y: number;
      content: string;
    }
  | {
      id: string;
      type: 'highlight';
      rect: BaseRect;
    }
  | {
      id: string;
      type: 'blur';
      rect: BaseRect;
    };

type DragState = {
  tool: 'arrow' | 'highlight' | 'blur';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type PendingText = {
  x: number;
  y: number;
  content: string;
};

type BoardCapture = {
  captureId: string;
  image: LoadedEditorImage;
};

export type EditorAppProps = {
  apis?: EditorApis;
  initialCaptureId?: string | null;
  initialSpec?: ExportSpec;
  loadImage?: (dataUrl: string) => Promise<LoadedEditorImage>;
  onAnnotationsChange?: (annotations: EditorAnnotation[]) => void;
};

function createAnnotationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context is unavailable');
  }

  return context;
}

function getCanvasPoint(
  event: MouseEvent | { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function normalizeRect(startX: number, startY: number, endX: number, endY: number): BaseRect {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  return {
    x,
    y,
    w: Math.abs(endX - startX),
    h: Math.abs(endY - startY),
  };
}

function applyBlurRect(
  context: CanvasRenderingContext2D,
  rect: BaseRect,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const minX = Math.max(0, Math.floor(rect.x));
  const minY = Math.max(0, Math.floor(rect.y));
  const maxX = Math.min(canvasWidth, Math.ceil(rect.x + rect.w));
  const maxY = Math.min(canvasHeight, Math.ceil(rect.y + rect.h));

  if (maxX <= minX || maxY <= minY) {
    return;
  }

  const imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);
  const output = new Uint8ClampedArray(imageData.data);

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let samples = 0;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = Math.max(0, Math.min(canvasWidth - 1, x + offsetX));
          const sampleY = Math.max(0, Math.min(canvasHeight - 1, y + offsetY));
          const sourceIndex = (sampleY * canvasWidth + sampleX) * 4;
          red += imageData.data[sourceIndex];
          green += imageData.data[sourceIndex + 1];
          blue += imageData.data[sourceIndex + 2];
          alpha += imageData.data[sourceIndex + 3];
          samples += 1;
        }
      }

      const targetIndex = (y * canvasWidth + x) * 4;
      output[targetIndex] = Math.round(red / samples);
      output[targetIndex + 1] = Math.round(green / samples);
      output[targetIndex + 2] = Math.round(blue / samples);
      output[targetIndex + 3] = Math.round(alpha / samples);
    }
  }

  context.putImageData(new ImageData(output, imageData.width, imageData.height), 0, 0);
}

function drawArrow(
  context: CanvasRenderingContext2D,
  annotation: Extract<EditorAnnotation, { type: 'arrow' }>,
): void {
  const angle = Math.atan2(annotation.endY - annotation.startY, annotation.endX - annotation.startX);
  const headLength = 12;

  context.save();
  context.strokeStyle = '#dc2626';
  context.lineWidth = 4;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(annotation.startX, annotation.startY);
  context.lineTo(annotation.endX, annotation.endY);
  context.lineTo(
    annotation.endX - headLength * Math.cos(angle - Math.PI / 6),
    annotation.endY - headLength * Math.sin(angle - Math.PI / 6),
  );
  context.moveTo(annotation.endX, annotation.endY);
  context.lineTo(
    annotation.endX - headLength * Math.cos(angle + Math.PI / 6),
    annotation.endY - headLength * Math.sin(angle + Math.PI / 6),
  );
  context.stroke();
  context.restore();
}

function drawHighlight(
  context: CanvasRenderingContext2D,
  annotation: Extract<EditorAnnotation, { type: 'highlight' }>,
): void {
  context.save();
  context.fillStyle = 'rgba(250, 204, 21, 0.35)';
  context.fillRect(
    annotation.rect.x,
    annotation.rect.y,
    annotation.rect.w,
    annotation.rect.h,
  );
  context.restore();
}

function drawText(
  context: CanvasRenderingContext2D,
  annotation: Extract<EditorAnnotation, { type: 'text' }>,
): void {
  context.save();
  context.fillStyle = '#111827';
  context.font = '600 22px Arial';
  context.fillText(annotation.content, annotation.x, annotation.y);
  context.restore();
}

function renderCanvas(
  canvas: HTMLCanvasElement,
  image: LoadedEditorImage,
  annotations: EditorAnnotation[],
): void {
  const context = getCanvasContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  for (const annotation of annotations) {
    if (annotation.type === 'arrow') {
      drawArrow(context, annotation);
      continue;
    }

    if (annotation.type === 'highlight') {
      drawHighlight(context, annotation);
      continue;
    }

    if (annotation.type === 'blur') {
      applyBlurRect(context, annotation.rect, canvas.width, canvas.height);
      continue;
    }

    drawText(context, annotation);
  }
}

export function EditorApp({
  apis,
  initialCaptureId,
  initialSpec,
  loadImage = loadImageFromDataUrl,
  onAnnotationsChange,
}: EditorAppProps) {
  const editorApis = useMemo(() => apis ?? getEditorApis(), [apis]);
  const [captureId, setCaptureId] = useState<string | null>(
    initialCaptureId ?? getCaptureIdFromLocation(),
  );
  const [boardCaptureIds, setBoardCaptureIds] = useState<string[]>(
    initialCaptureId ? [] : getBoardCaptureIdsFromLocation(),
  );
  const [spec, setSpec] = useState<ExportSpec>(
    initialSpec ?? {
      ...getDefaultExportSpec(),
      filenameTemplate: 'snapvault-{date}-{time}.{format}',
    },
  );
  const [activeTool, setActiveTool] = useState<EditorTool>('arrow');
  const [annotations, setAnnotations] = useState<EditorAnnotation[]>([]);
  const [captureMetadata, setCaptureMetadata] = useState<CaptureMetadata | null>(null);
  const [sourceTabId, setSourceTabId] = useState<number | null>(null);
  const [suggestedRedactions, setSuggestedRedactions] = useState<RedactAnnotation[]>([]);
  const [image, setImage] = useState<LoadedEditorImage | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pendingText, setPendingText] = useState<PendingText | null>(null);
  const [boardCaptures, setBoardCaptures] = useState<BoardCapture[]>([]);
  const [busyExport, setBusyExport] = useState(false);
  const [busyRedaction, setBusyRedaction] = useState(false);
  const [busyBoardOpen, setBusyBoardOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Waiting for a capture.');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragCaptureIdRef = useRef<string | null>(null);
  const pendingTextRef = useRef<PendingText | null>(null);
  const isBoardMode = boardCaptureIds.length > 0;

  useEffect(() => {
    if (initialSpec) {
      return;
    }

    let cancelled = false;

    void loadStoredEditorSpec(editorApis).then((storedSpec) => {
      if (!cancelled) {
        setSpec(storedSpec);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [editorApis, initialSpec]);

  useEffect(() => {
    const runtimeListener = (message: unknown) => {
      if (isEditorCaptureMessage(message)) {
        setCaptureId(message.captureId);
      }
    };

    const windowListener = (event: MessageEvent<unknown>) => {
      if (isEditorCaptureMessage(event.data)) {
        setCaptureId(event.data.captureId);
      }
    };

    editorApis.runtime.onMessage?.addListener(runtimeListener);
    window.addEventListener('message', windowListener);

    return () => {
      editorApis.runtime.onMessage?.removeListener?.(runtimeListener);
      window.removeEventListener('message', windowListener);
    };
  }, [editorApis]);

  useEffect(() => {
    if (!isBoardMode) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setStatusMessage('Loading board captures...');
        const loadedCaptures = await Promise.all(
          boardCaptureIds.map(async (boardCaptureId) => {
            const capture = await requestCaptureData(boardCaptureId, editorApis);
            if (!capture.dataUrl) {
              throw new Error(`Capture not found: ${boardCaptureId}`);
            }

            return {
              captureId: boardCaptureId,
              image: await loadImage(capture.dataUrl),
            };
          }),
        );

        if (!cancelled) {
          setBoardCaptures(loadedCaptures);
          setStatusMessage(`Loaded ${loadedCaptures.length} captures into the board.`);
        }
      } catch (error) {
        if (!cancelled) {
          setBoardCaptures([]);
          setStatusMessage(
            error instanceof Error ? error.message : 'Failed to load the capture board.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boardCaptureIds, editorApis, isBoardMode, loadImage]);

  useEffect(() => {
    if (isBoardMode) {
      return;
    }

    if (!captureId) {
      setImage(null);
      setCaptureMetadata(null);
      setSourceTabId(null);
      setSuggestedRedactions([]);
      setStatusMessage('Waiting for a capture.');
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setStatusMessage('Loading capture...');
        const capture = await requestCaptureData(captureId, editorApis);
        if (!capture.dataUrl) {
          throw new Error(`Capture not found: ${captureId}`);
        }

        const loadedImage = await loadImage(capture.dataUrl);
        if (cancelled) {
          return;
        }

        setImage(loadedImage);
        setCaptureMetadata(capture.metadata ?? null);
        setSourceTabId(
          typeof capture.sourceTabId === 'number' ? capture.sourceTabId : null,
        );
        setAnnotations([]);
        setSuggestedRedactions([]);
        setPendingText(null);
        setDragState(null);
        setStatusMessage(`Loaded capture ${captureId.slice(0, 8)}.`);
      } catch (error) {
        if (!cancelled) {
          setImage(null);
          setCaptureMetadata(null);
          setSourceTabId(null);
          setSuggestedRedactions([]);
          setStatusMessage(error instanceof Error ? error.message : 'Failed to load the capture.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [captureId, editorApis, isBoardMode, loadImage]);

  useEffect(() => {
    if (!canvasRef.current || !image) {
      return;
    }

    canvasRef.current.width = image.width;
    canvasRef.current.height = image.height;
    renderCanvas(canvasRef.current, image, annotations);
  }, [annotations, image]);

  useEffect(() => {
    onAnnotationsChange?.(annotations);
  }, [annotations, onAnnotationsChange]);

  useEffect(() => {
    if (pendingText && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [pendingText]);

  useEffect(() => {
    pendingTextRef.current = pendingText;
  }, [pendingText]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') {
        return;
      }

      event.preventDefault();
      setAnnotations((previous) => previous.slice(0, -1));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function pushAnnotation(annotation: EditorAnnotation) {
    setAnnotations((previous) => [...previous, annotation]);
  }

  function handleCanvasMouseDown(event: MouseEvent) {
    if (!canvasRef.current || !image || activeTool === 'text') {
      return;
    }

    const point = getCanvasPoint(event, canvasRef.current);
    setPendingText(null);
    const nextDragState: DragState = {
      tool: activeTool,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    };
    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  }

  function handleCanvasMouseMove(event: MouseEvent) {
    if (!canvasRef.current || !dragStateRef.current) {
      return;
    }

    const point = getCanvasPoint(event, canvasRef.current);
    const nextDragState: DragState = {
      ...dragStateRef.current,
      currentX: point.x,
      currentY: point.y,
    };
    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  }

  function handleCanvasMouseUp(event: MouseEvent) {
    if (!canvasRef.current || !dragStateRef.current) {
      return;
    }

    const point = getCanvasPoint(event, canvasRef.current);
    const finalState = {
      ...dragStateRef.current,
      currentX: point.x,
      currentY: point.y,
    };

    if (finalState.tool === 'arrow') {
      pushAnnotation({
        id: createAnnotationId(),
        type: 'arrow',
        startX: finalState.startX,
        startY: finalState.startY,
        endX: finalState.currentX,
        endY: finalState.currentY,
      });
    } else {
      pushAnnotation({
        id: createAnnotationId(),
        type: finalState.tool,
        rect: normalizeRect(
          finalState.startX,
          finalState.startY,
          finalState.currentX,
          finalState.currentY,
        ),
      });
    }

    dragStateRef.current = null;
    setDragState(null);
  }

  function handleCanvasClick(event: MouseEvent) {
    if (!canvasRef.current || activeTool !== 'text') {
      return;
    }

    const point = getCanvasPoint(event, canvasRef.current);
    setPendingText({
      x: point.x,
      y: point.y,
      content: '',
    });
  }

  function commitPendingText() {
    const currentPendingText = pendingTextRef.current;
    if (!currentPendingText) {
      return;
    }

    pendingTextRef.current = null;
    const content = currentPendingText.content.trim();
    if (content.length > 0) {
      pushAnnotation({
        id: createAnnotationId(),
        type: 'text',
        x: currentPendingText.x,
        y: currentPendingText.y,
        content,
      });
    }

    setPendingText(null);
  }

  async function handleRunDomRedaction() {
    if (sourceTabId === null) {
      setStatusMessage('DOM redaction needs the original source tab.');
      return;
    }

    setBusyRedaction(true);
    setStatusMessage('Scanning the source page for sensitive text...');

    try {
      const result = await runDomRedaction(sourceTabId, editorApis);
      setSuggestedRedactions(result.annotations);
      setStatusMessage(`Found ${result.annotations.length} redaction suggestion(s).`);
    } catch (error) {
      setSuggestedRedactions([]);
      setStatusMessage(
        error instanceof Error ? error.message : 'DOM redaction failed.',
      );
    } finally {
      setBusyRedaction(false);
    }
  }

  function handleConfirmRedactions() {
    if (suggestedRedactions.length === 0) {
      setStatusMessage('No redaction suggestions are waiting for confirmation.');
      return;
    }

    const confirmed = suggestedRedactions.map((annotation) => ({
      id: annotation.id,
      type: 'blur' as const,
      rect: {
        x: annotation.rect.x,
        y: annotation.rect.y,
        w: annotation.rect.w,
        h: annotation.rect.h,
      },
    }));

    setAnnotations((previous) => [...previous, ...confirmed]);
    setSuggestedRedactions([]);
    setStatusMessage(`Confirmed ${confirmed.length} redaction annotation(s).`);
  }

  async function handleOpenBoard() {
    if (!captureId) {
      setStatusMessage('Load a capture before opening the board.');
      return;
    }

    setBusyBoardOpen(true);

    try {
      const result = await openCaptureBoard([captureId], editorApis);
      if (!result.ok) {
        setStatusMessage(result.error);
        return;
      }

      setStatusMessage('Opened the capture board.');
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to open the board.',
      );
    } finally {
      setBusyBoardOpen(false);
    }
  }

  async function handleExport() {
    if (isBoardMode) {
      setBusyExport(true);
      setStatusMessage('Preparing board export...');

      try {
        const result = await exportCaptureBoard(boardCaptureIds, spec, editorApis);
        setStatusMessage(`Saved ${result.filename}.`);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Board export failed.');
      } finally {
        setBusyExport(false);
      }

      return;
    }

    if (!captureId) {
      setStatusMessage('Pick or pass a capture before exporting.');
      return;
    }

    setBusyExport(true);
    setStatusMessage('Preparing export...');

    try {
      if (canvasRef.current && captureMetadata) {
        await storeCaptureData(
          captureId,
          canvasRef.current.toDataURL('image/png'),
          captureMetadata,
          sourceTabId === null ? undefined : sourceTabId,
          editorApis,
        );
      }

      await applyExportSpec(captureId, spec, editorApis);
      const result = await exportToDownloads(captureId, spec, editorApis);
      setStatusMessage(`Saved ${result.filename}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusyExport(false);
    }
  }

  function reorderBoardCaptures(targetCaptureId: string) {
    const draggedCaptureId = dragCaptureIdRef.current;
    if (!draggedCaptureId || draggedCaptureId === targetCaptureId) {
      return;
    }

    setBoardCaptureIds((previous) => {
      const next = [...previous];
      const draggedIndex = next.indexOf(draggedCaptureId);
      const targetIndex = next.indexOf(targetCaptureId);
      if (draggedIndex < 0 || targetIndex < 0) {
        return previous;
      }

      next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedCaptureId);
      return next;
    });
  }

  if (isBoardMode) {
    return (
      <main className="editor-shell">
        <section className="editor-hero">
          <div>
            <p className="eyebrow">SnapVault Board</p>
            <h1>Arrange multiple captures, then export them as one board.</h1>
          </div>
          <button
            type="button"
            className="export-button"
            onClick={handleExport}
            disabled={busyExport || boardCaptureIds.length === 0}
          >
            {busyExport ? 'Exporting...' : 'Export board'}
          </button>
        </section>

        <section className="editor-panel">
          <div className="section-header">
            <p className="eyebrow">Board</p>
            <h2>Drag to reorder the capture stack</h2>
          </div>
          <div className="board-grid" role="list" aria-label="Capture board">
            {boardCaptures.map((capture) => (
              <article
                key={capture.captureId}
                className="board-card"
                role="listitem"
                draggable
                onDragStart={() => {
                  dragCaptureIdRef.current = capture.captureId;
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={() => {
                  reorderBoardCaptures(capture.captureId);
                  dragCaptureIdRef.current = null;
                }}
                onDragEnd={() => {
                  dragCaptureIdRef.current = null;
                }}
              >
                <canvas
                  aria-label={`Board capture ${capture.captureId}`}
                  ref={(canvas) => {
                    if (!canvas) {
                      return;
                    }

                    canvas.width = capture.image.width;
                    canvas.height = capture.image.height;
                    const context = canvas.getContext('2d');
                    context?.clearRect(0, 0, canvas.width, canvas.height);
                    context?.drawImage(capture.image, 0, 0);
                  }}
                />
                <p className="board-card-label">{capture.captureId}</p>
              </article>
            ))}
          </div>
          <div className="editor-meta">
            <p aria-label="Editor status">{statusMessage}</p>
            <p aria-label="Annotation count">{boardCaptureIds.length}</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="editor-shell">
      <section className="editor-hero">
        <div>
          <p className="eyebrow">SnapVault Editor</p>
          <h1>Annotate the capture before it leaves the extension.</h1>
        </div>
        <div className="editor-actions">
          <button
            type="button"
            className="tool-button"
            onClick={handleRunDomRedaction}
            disabled={busyRedaction || sourceTabId === null}
          >
            {busyRedaction ? 'Scanning...' : 'Run DOM Redaction'}
          </button>
          <button
            type="button"
            className="tool-button"
            onClick={handleConfirmRedactions}
            disabled={suggestedRedactions.length === 0}
          >
            Confirm redactions
          </button>
          <button
            type="button"
            className="tool-button"
            onClick={handleOpenBoard}
            disabled={busyBoardOpen || !captureId}
          >
            {busyBoardOpen ? 'Opening board...' : 'Open board'}
          </button>
          <button
            type="button"
            className="export-button"
            onClick={handleExport}
            disabled={busyExport || !captureId}
          >
            {busyExport ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </section>

      <AnnotationToolbar activeTool={activeTool} setActiveTool={setActiveTool} />

      <section className="editor-panel">
        <div className="section-header">
          <p className="eyebrow">Canvas</p>
          <h2>Capture workspace</h2>
        </div>
        <div className="editor-stage">
          <canvas
            aria-label="Editor canvas"
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onClick={handleCanvasClick}
          />
          {pendingText ? (
            <textarea
              aria-label="Annotation text editor"
              ref={textareaRef}
              className="annotation-textarea"
              style={{
                left: `${pendingText.x}px`,
                top: `${pendingText.y}px`,
              }}
              value={pendingText.content}
              onInput={(event) =>
                setPendingText({
                  ...pendingText,
                  content: event.currentTarget.value,
                })
              }
              onBlur={commitPendingText}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  commitPendingText();
                }
              }}
            />
          ) : null}
        </div>
        <div className="editor-meta">
          <p aria-label="Editor status">{statusMessage}</p>
          <p aria-label="Annotation count">{annotations.length}</p>
          <p aria-label="Pending redaction count">{suggestedRedactions.length}</p>
        </div>
      </section>
    </main>
  );
}
