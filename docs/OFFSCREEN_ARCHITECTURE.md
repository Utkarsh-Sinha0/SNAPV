# OFFSCREEN_ARCHITECTURE.md
# SnapVault — Offscreen Document Architecture
# Version: 3.1.0 | Last Updated: 2026-03-17

This document is the canonical reference for SnapVault's heavy-worker architecture.
On Chromium targets, heavy work runs in the offscreen document. On Firefox, the same
shared core runs behind the background-page shell.

---

## 1) Why offscreen documents are non-negotiable (2026)

Chrome MV3 service workers:
- Cannot call `canvas.getContext('2d')` — canvas exists but drawing operations are silently
  dropped or throw.
- Cannot instantiate `OffscreenCanvas` reliably for WASM workloads.
- Are terminated after ~30 s of inactivity, interrupting long encode loops.
- Do not have a DOM, so `DOMParser` and WASM with DOM dependencies fail.

`chrome.offscreen.createDocument` (Chrome 116+) solves all of these by providing a real
document context that is invisible to the user and isolated from extension pages.

Firefox equivalent: background page (MV2). Both paths use the same shared processor in
`src/shared/heavy-worker-service.ts`.

---

## 2) Creating and managing the offscreen document

### Create (idempotent)
```ts
// src/background/offscreen-manager.ts
const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

export async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument?.() ?? false;
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [
      chrome.offscreen.Reason.DOM_PARSING,
      chrome.offscreen.Reason.BLOBS,
    ],
    justification:
      'Canvas stitching, JPEG encoding, PDF assembly, and ONNX inference require ' +
      'a document context unavailable in MV3 service workers.',
  });
}
```

### Auto-close after idle
```ts
const IDLE_TIMEOUT_MS = 30_000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

export function resetOffscreenIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    chrome.offscreen.closeDocument().catch(() => {});
    idleTimer = null;
  }, IDLE_TIMEOUT_MS);
}
```

### Force-close on "Nuke everything"
```ts
// Handler for OFFSCREEN_CLEAR_MEMORY message
export async function nukeOffscreenMemory(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  try { await chrome.offscreen.closeDocument(); } catch {}
}
```

---

## 3) Message protocol (offscreen ↔ service worker)

All messages follow the standard SnapVault typed message contract.
The offscreen document listens via `chrome.runtime.onMessage` and replies via
`chrome.runtime.sendMessage` (or the resolved promise pattern).

### Heavy-worker message types (subset — full list in API_SPECIFICATIONS.md §5)

| Message | Direction | Payload |
|---------|-----------|---------|
| `OFFSCREEN_STITCH` | SW → heavy worker | `{ id: string, segments: string[], metadata: CaptureMetadata, spec: ExportSpec }` |
| `OFFSCREEN_ENCODE` | SW → heavy worker | `{ id: string, dataUrl: string, spec: ExportSpec }` |
| `OFFSCREEN_BUILD_PDF` | SW → heavy worker | `{ id: string, pages: string[], spec: ExportSpec }` |
| `OFFSCREEN_RUN_ML_REDACTION` | SW → heavy worker | `{ id: string, dataUrl: string }` |
| `OFFSCREEN_CLEAR_MEMORY` | SW → heavy worker | `{ id: string }` |
| `OFFSCREEN_RESULT` | heavy worker → SW | `{ id: string, ok: boolean, data?: unknown, error?: string }` |

---

## 4) Chromium offscreen runtime structure

```ts
// src/offscreen/runtime.chromium.ts
import { processHeavyWorkerMessage } from '../shared/heavy-worker-service.lazy';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  return routeToSharedHeavyWorkerCore(msg, sendResponse);
});
```

The listener stays in the Chromium runtime shell, but the actual stitch/encode/PDF/ML
implementation lives in `src/shared/heavy-worker-service.ts` and
`src/shared/heavy-worker-service.lazy.ts` so Chromium offscreen and Firefox background
shells execute the same neutral core.

---

## 5) Stitch algorithm (full-page)

```
Input: string[] of dataURL segments, CaptureMetadata (devicePixelRatio, cssWidth)

For each adjacent pair (A, B):
  1. Load both as ImageBitmap (createImageBitmap — available in offscreen context).
  2. If light mode OFF: compute overlap row-hash similarity to find exact stitch line.
     If light mode ON: use nominal scroll-step overlap (skip hash comparison).
  3. Draw A[0..stitchLine] then B[stitchLine..end] onto accumulator OffscreenCanvas.

Output: OffscreenCanvas → canvas.convertToBlob({ type, quality }) → dataURL
```

### Light mode flag
Passed in `CaptureMetadata.lightMode`. When `true`:
- Skip the `row-hash overlap correction` step.
- Use `viewportHeight * (1 - OVERLAP_FRACTION)` directly as step size.
- Saves ~40–60% CPU on a 10k-pixel full-page stitch.
- May leave a 1–2 px seam on pages with animated content — acceptable trade-off.
- Feasibility engine proactively suggests light mode when `estimatedCpuSeconds > 5`.

---

## 6) Firefox compatibility path

Firefox 115+ does not have `chrome.offscreen`. The adapter handles this:

```ts
// src/shared/offscreen-adapter.ts
import { isFirefox } from './browser';

export async function sendToHeavyWorker<T>(msg: OffscreenMessage): Promise<T> {
  if (isFirefox()) {
    // Firefox: send to background page which has a full DOM context (MV2)
    return chrome.runtime.sendMessage({ ...msg, _target: 'background-heavy' });
  }
  // Chrome / Edge: ensure offscreen doc exists, then send
  await ensureOffscreenDocument();
  resetOffscreenIdleTimer();
  return chrome.runtime.sendMessage({ ...msg, _target: 'offscreen' });
}
```

Background page (`background/background-page.ts`) mirrors the same message handlers
for Firefox by calling the same shared heavy-worker core. Same TypeScript modules;
no logic duplication.

---

## 7) Security constraints for offscreen document

- Offscreen document is NEVER shown to the user (no UI context).
- It must NOT receive or store screenshot data beyond the lifetime of one message.
- `assertNoPixelPayload` is called before any `fetch` inside the heavy-worker path — even though
  offscreen should never make network calls, this is a belt-and-suspenders guard.
- ONNX model loaded from `chrome.runtime.getURL('assets/ml/...')` — local only, never CDN.
- Offscreen page has the same strict MV3 CSP as all other extension pages: `script-src 'self'`.

---

## 8) Testing offscreen documents

Playwright cannot directly inspect offscreen document internals. Test strategy:

1. **Unit tests (Vitest):** test `stitch`, `encode`, `buildPdf`, `applyRedactAnnotations`
   and `runMlRedaction` as pure functions — they take/return buffers, not extension messages.

2. **Integration tests (Playwright extension harness):**
   - Trigger a full-page capture via the extension popup.
   - Assert final downloaded file dimensions match expected spec.
   - Assert no outbound network during the operation (network intercept).

3. **Offscreen lifecycle test:**
   - Assert document is created on first heavy operation.
   - Assert document is closed after `OFFSCREEN_IDLE_TIMEOUT_MS` + 1 s.
   - Assert "Nuke everything" closes document immediately (check via `chrome.offscreen.hasDocument`).

See `TESTING_QA.md` §4 for full offscreen test plan.
