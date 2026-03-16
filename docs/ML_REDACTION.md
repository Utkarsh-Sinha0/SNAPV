# ML_REDACTION.md
# SnapVault — Local ML Redaction (Transformers.js ONNX)
# Version: 1.0.0 | Last Updated: 2026-03-16

This document specifies the offline auto-redaction system for SnapVault Pro (Tier 2).
All inference runs locally inside the Offscreen Document. Zero data leaves the device.

---

## 1) Two-layer detection strategy

| Layer | When | What it catches | Where it runs |
|-------|------|----------------|---------------|
| DOM-text (V1.0) | Always (Pro) | Emails, phones, CC numbers (Luhn), API keys, tokens | Content script → background |
| ML / ONNX (V1.1) | On demand (Pro, lazy-load) | Faces, logos, sensitive text blocks (layout-aware) | offscreen.ts |

Both layers produce a `RedactAnnotation[]` list (bounding boxes + type). The editor
renders these as blur overlays for user review before export. Nothing is auto-applied
without user confirmation.

---

## 2) ML model selection criteria (2026)

Requirements:
- Must run as ONNX model via Transformers.js 3.x WASM backend.
- Bundle size: < 5 MB compressed (gzip/brotli) — hard limit.
- Latency: < 3 s for a 1920×1080 screenshot on a mid-range 2023 laptop.
- Offline: weights bundled with extension; no CDN fetch ever.
- Detects: PII text blocks, faces, and recognizable logos.

**Recommended starting model:** `Xenova/detr-resnet-50` (object detection, ONNX-quantized)
or a custom fine-tuned `LayoutLM`-family model at int8 precision.
Run your own accuracy benchmark on the test images in `/test_pages/redaction/` before
shipping — model accuracy is a product invariant.

Model file location in repo: `src/assets/ml/redaction.onnx` (git-LFS or bundled).

---

## 3) Integration point: offscreen.ts

```ts
// src/offscreen/ml-redaction.ts  (lazy-loaded)
import { pipeline, env } from '@xenova/transformers';

// Point Transformers.js to local ONNX weights — never CDN
env.localModelPath = chrome.runtime.getURL('assets/ml/');
env.allowRemoteModels = false;   // HARD BLOCK — no network fetch
env.allowLocalModels = true;

let detector: ReturnType<typeof pipeline> | null = null;

export async function runMlRedaction(
  msg: { dataUrl: string }
): Promise<{ annotations: RedactAnnotation[] }> {
  if (!detector) {
    // First call: load model (< 3 s on warm WASM runtime)
    detector = await pipeline('object-detection', 'redaction', {
      backend: 'wasm',
      quantized: true,
    });
  }

  const bitmap = await createImageBitmap(await dataUrlToBlob(msg.dataUrl));
  const results = await (await detector)(bitmap, { threshold: 0.75 });

  return {
    annotations: results.map(r => ({
      type: r.label as RedactAnnotationType,
      rect: { x: r.box.xmin, y: r.box.ymin,
              w: r.box.xmax - r.box.xmin, h: r.box.ymax - r.box.ymin },
      confidence: r.score,
      source: 'ml',
    })),
  };
}
```

---

## 4) DOM-text layer (V1.0 — content script)

Run in content script before capture (Pro only). Walks visible text nodes and applies:

| Pattern | Detection method |
|---------|-----------------|
| Email address | Regex `[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}` |
| Phone number | E.164 + common national formats regex |
| Credit card number | Regex + Luhn algorithm check |
| API key / token | Heuristic: 20+ char alphanumeric string with entropy > 3.5 bits/char |
| SSN (US) | Regex `\d{3}-\d{2}-\d{4}` |

Each detection returns a bounding rect (via `Range.getBoundingClientRect()`). Rects are
stored in background capture cache sidecar — ephemeral, never persisted.

---

## 5) Annotation data model

```ts
type RedactAnnotationType =
  | 'face' | 'logo' | 'email' | 'phone' | 'credit-card'
  | 'api-key' | 'ssn' | 'custom' | 'text-block';

interface RedactAnnotation {
  id: string;                   // random UUID, session-only
  type: RedactAnnotationType;
  rect: { x: number; y: number; w: number; h: number };  // in CSS pixels
  confidence: number;           // 0–1
  source: 'dom' | 'ml';
  userReviewed: boolean;        // false until user accepts/dismisses in editor
}
```

---

## 6) Editor review UX

1. After redaction detection, editor shows "Review Redactions" panel.
2. Each annotation is shown as a semi-transparent blur overlay on the canvas.
3. User can: **Accept** (keep blur), **Dismiss** (remove overlay), or **Resize** (drag handles).
4. "Apply All" button confirms accepted annotations permanently onto the export canvas.
5. Dismissed annotations are not re-detected in the same session.
6. **Nothing is applied to the export image until the user explicitly confirms.**

---

## 7) Privacy guarantees

| Guarantee | Implementation |
|-----------|---------------|
| Model never fetches from network | `env.allowRemoteModels = false` + `assertNoPixelPayload` guard |
| Detections are ephemeral | Stored only in offscreen document memory; cleared on `OFFSCREEN_CLEAR_MEMORY` |
| Annotation rects never transmitted | Same `assertNoPixelPayload` guard as pixel buffers |
| Model weights are local | Bundled in extension package; `env.localModelPath` points to `chrome.runtime.getURL` |
| User must confirm before applying | UX gate; export pipeline checks `userReviewed === true` |

---

## 8) Performance budget

| Metric | Target |
|--------|--------|
| Model first-load (WASM warm) | < 3 s |
| Inference on 1920×1080 | < 2 s |
| Inference on 3840×2160 (4K) | < 6 s (warn user before starting) |
| Memory during inference | < 300 MB peak (offscreen doc, released on clear) |
| Model bundle size (gzip) | < 5 MB |

Progress indicator required in editor UI during model load and inference.
If inference takes > 1 s, show a progress spinner with "Analyzing screenshot…".

---

## 9) Testing

- `/test_pages/redaction/` contains synthetic screenshots with known PII and faces.
- Unit test: `runMlRedaction()` on reference images → assert minimum recall ≥ 90%.
- Unit test: `env.allowRemoteModels = false` is verified — no network calls during inference.
- Integration: Playwright extension test triggers `RUN_AUTO_REDACTION`, asserts editor
  shows annotation overlays and no outbound network requests occur.
- Privacy regression: `assertNoPixelPayload` called in mock of any network API — asserts it
  throws when passed an annotation-containing payload.
