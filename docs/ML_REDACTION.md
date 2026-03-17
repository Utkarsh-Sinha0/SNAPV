# ML_REDACTION.md
# SnapVault — Local ML Redaction (Transformers.js ONNX)
# Version: 3.1.0 | Last Updated: 2026-03-17

This document specifies the offline auto-redaction system for SnapVault Pro (Tier 2).
All inference runs locally inside the shared heavy-worker core. On Chromium that means
the offscreen document; on Firefox it means the background-page shell. Zero data leaves
the device.

---

## 1) Two-layer detection strategy

| Layer | When | What it catches | Where it runs |
|-------|------|----------------|---------------|
| DOM-text (V1.0) | Always (Pro) | Emails, phones, CC numbers (Luhn), API keys, tokens | Content script → background |
| ML / ONNX (V1.1) | On demand (Pro, lazy-load) | Offline object detection mapped into reviewable redaction boxes | offscreen document |

Both layers produce a `RedactAnnotation[]` list (bounding boxes + type). The editor
renders these as blur overlays for user review before export. Nothing is auto-applied
without user confirmation.

---

## 2) ML model selection criteria (2026)

Requirements:
- Must run as ONNX model via Transformers.js 3.x WASM backend.
- Latency: < 3 s for a 1920×1080 screenshot on a mid-range 2023 laptop.
- Offline: weights bundled with extension; no CDN fetch ever.
- Detects: reviewable object regions without any network dependency.

**Current bundled model:** `Xenova/yolos-tiny` quantized ONNX weights, loaded from the
extension package via the local `redaction/` model id. The current shipping asset set is:
- `public/assets/ml/redaction/config.json`
- `public/assets/ml/redaction/preprocessor_config.json`
- `public/assets/ml/redaction/onnx/model_quantized.onnx`
- `public/assets/ml/wasm/ort-wasm-simd-threaded.{mjs,wasm}`

Run your own accuracy benchmark on the test images in `/test_pages/redaction/` before
shipping — model accuracy is still a product invariant.

---

## 3) Delivery decision (v1.0 / v1.1)

**v1.0 decision:** ship the local ONNX model bundled with the extension package.

Rationale:
- The feature is Pro-only, but fully local inference is a core product promise.
- Bundling keeps privacy semantics simple: no post-install fetch, no CDN, no account gate.
- Store review is simpler than introducing a second delivery system before we have usage data.

**v1.1 candidate:** optional model delivery after install, only if startup/install data
shows the bundled payload is materially hurting activation on low-end devices.

Until then, the optimization strategy is:
- keep the model bundled,
- keep startup-critical code lazy,
- measure service-worker cold start directly in the extension harness.

---

## 4) Integration point: shared heavy-worker core

```ts
// src/offscreen/ml-redaction.ts  (lazy-loaded)
import { pipeline, env } from '@huggingface/transformers';

// Point Transformers.js to local ONNX weights — never CDN
env.localModelPath = chrome.runtime.getURL('assets/ml/');
env.allowRemoteModels = false;   // HARD BLOCK — no network fetch
env.allowLocalModels = true;
env.backends.onnx.wasm.wasmPaths = {
  mjs: chrome.runtime.getURL('assets/ml/wasm/ort-wasm-simd-threaded.mjs'),
  wasm: chrome.runtime.getURL('assets/ml/wasm/ort-wasm-simd-threaded.wasm'),
};

let detector: ReturnType<typeof pipeline> | null = null;

export async function runMlRedaction(
  msg: { dataUrl: string }
): Promise<{ annotations: RedactAnnotation[] }> {
  if (!detector) {
    // First call: load model (< 3 s on warm WASM runtime)
    detector = await pipeline('object-detection', 'redaction', {
      device: 'wasm',
      dtype: 'q8',
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

## 5) DOM-text layer (V1.0 — content script)

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

## 6) Annotation data model

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

## 7) Editor review UX

1. After redaction detection, editor shows "Review Redactions" panel.
2. Each annotation is shown as a semi-transparent blur overlay on the canvas.
3. User can: **Accept** (keep blur), **Dismiss** (remove overlay), or **Resize** (drag handles).
4. "Apply All" button confirms accepted annotations permanently onto the export canvas.
5. Dismissed annotations are not re-detected in the same session.
6. **Nothing is applied to the export image until the user explicitly confirms.**

---

## 8) Privacy guarantees

| Guarantee | Implementation |
|-----------|---------------|
| Model never fetches from network | `env.allowRemoteModels = false` + `assertNoPixelPayload` guard |
| Detections are ephemeral | Stored only in offscreen document memory; cleared on `OFFSCREEN_CLEAR_MEMORY` |
| Annotation rects never transmitted | Same `assertNoPixelPayload` guard as pixel buffers |
| Model weights + WASM runtime are local | Bundled in extension package; `env.localModelPath` and `env.backends.onnx.wasm.wasmPaths` point to `chrome.runtime.getURL` |
| User must confirm before applying | UX gate; export pipeline checks `userReviewed === true` |

---

## 9) Performance budget

| Metric | Target |
|--------|--------|
| Model first-load (WASM warm) | < 3 s |
| Inference on 1920×1080 | < 2 s |
| Inference on 3840×2160 (4K) | < 6 s (warn user before starting) |
| Memory during inference | < 300 MB peak (offscreen doc, released on clear) |
| Current local ML payload | `model_quantized.onnx` 9.66 MB + ORT WASM 11.13 MB |

Progress indicator required in editor UI during model load and inference.
If inference takes > 1 s, show a progress spinner with "Analyzing screenshot…".

---

## 10) Testing

- `/test_pages/redaction/` contains synthetic screenshots with known PII and faces.
- Unit test: `runMlRedaction()` on reference images → assert minimum recall ≥ 90%.
- Unit test: `env.allowRemoteModels = false` is verified — no network calls during inference.
- Integration: Playwright extension test triggers `RUN_ML_REDACTION`, asserts editor
  shows annotation overlays and no outbound network requests occur.
- Privacy regression: `assertNoPixelPayload` called in mock of any network API — asserts it
  throws when passed an annotation-containing payload.
