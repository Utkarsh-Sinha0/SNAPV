# TECHNICAL_ARCHITECTURE.md
# SnapVault — Architecture (Tier 1 & 2, Cross-Browser)
# Version: 3.1.0 | Last Updated: 2026-03-17

---

## 1) Component map

```
┌─────────────────────────────────────────────────────────────────────┐
│  popup/          Capture controls + Export Spec picker              │
│                  Must open in < 150 ms. No network. No canvas.      │
├─────────────────────────────────────────────────────────────────────┤
│  background/     Service Worker (MV3) — orchestration ONLY          │
│  (service        Sends messages; holds lightweight state.           │
│   worker)        Does NOT touch canvas, DOM, or WASM.               │
├─────────────────────────────────────────────────────────────────────┤
│  offscreen/      Chromium offscreen runtime shell                    │
│                  All heavy work routes into the shared processor.    │
│                  Created on-demand; closed after idle.               │
├─────────────────────────────────────────────────────────────────────┤
│  content/        On-demand injection: region select overlay,         │
│                  element picker, clean-capture CSS injector,         │
│                  action bar, scroll orchestration.                   │
├─────────────────────────────────────────────────────────────────────┤
│  editor/         Canvas-based annotation + export pipeline.          │
│                  Delegates encode/PDF steps to offscreen via SW.     │
├─────────────────────────────────────────────────────────────────────┤
│  options/        Export presets + privacy toggles + sponsor.         │
│                  Embeds ads_sandbox.html via <iframe>.               │
├─────────────────────────────────────────────────────────────────────┤
│  ads_sandbox/    Sandboxed iframe page. Carbon OR sponsor.json card. │
│                  No extension API access. No pixel access.           │
├─────────────────────────────────────────────────────────────────────┤
│  shared/         Pure TS: ExportSpec types, feasibility engine,      │
│                  DPI utilities, browser adapter, assertNoPixelPayload│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2) Offscreen Document (mandatory for MV3 canvas work)

Chrome MV3 service workers cannot reliably access `canvas`, `DOMParser`, or run WASM
at full performance. The 2026 solution is `chrome.offscreen.createDocument`.

### Why it's non-negotiable
- Canvas API is unavailable in service workers → stitching, encoding, and PDF building all
  fail silently or crash without offscreen.
- WASM (Transformers.js ONNX) requires a real document context for peak performance.
- Offscreen provides a `DOM_PARSING` + `BLOBS` environment with no visible UI.

### Lifecycle
```
SW receives capture trigger
  └─> chrome.offscreen.createDocument({ url: 'offscreen.html',
        reasons: ['DOM_PARSING', 'BLOBS'], justification: '...' })
        (no-op if already open)
  └─> SW sends OFFSCREEN_* message with image data
  └─> Chromium runtime shell invokes shared heavy-worker core → returns result via chrome.runtime.sendMessage
  └─> SW auto-closes document after OFFSCREEN_IDLE_TIMEOUT_MS (default 30 000)
  └─> "Nuke everything" sends OFFSCREEN_CLEAR_MEMORY → force-closes immediately
```

### What runs in the Chromium offscreen runtime
| Task | Reason flag |
|------|-------------|
| Full-page segment stitch | `BLOBS` |
| JPEG encode / target-size loop | `BLOBS` |
| pdf-lib PDF assembly | `BLOBS` |
| Transformers.js ONNX inference (redaction) | `DOM_PARSING` + `BLOBS` |
| DOMParser for clean-capture selector validation | `DOM_PARSING` |

Full offscreen message API in `API_SPECIFICATIONS.md` §5.
Full implementation guide in `OFFSCREEN_ARCHITECTURE.md`.
Shared heavy-work implementation lives in `src/shared/heavy-worker-service.ts`.

### Firefox / Edge compat
`chrome.offscreen` is Chrome 116+. Firefox does not implement it yet.
- Firefox path: route the same work through a hidden **background page** (MV2 compatible)
  using WXT's `browser` abstraction.
- `src/shared/offscreen-adapter.ts` exposes a single `sendToHeavyWorker(msg)` function that
  resolves to offscreen on Chrome/Edge and to background-page on Firefox.
- Browser-family routing is compile-time selected through `__SNAPVAULT_TARGET_FAMILY__`,
  so Chrome/Edge and Firefox do not share the same shell bootstrap path.
- No feature-contract changes; same message shapes.

---

## 3) Stack (pinned)

| Concern | Choice | Version |
|---------|--------|---------|
| Build tool / manifest | WXT | 0.20.19 (March 2026) |
| UI framework | Preact | 10.x |
| Language | TypeScript strict | 5.x |
| Canvas pipeline | Canvas API (offscreen context) | Web standard |
| PDF | pdf-lib | latest pinned |
| Local ML / redaction | Transformers.js | 3.x (ONNX/WASM backend) |
| Unit tests | Vitest | latest pinned |
| E2E tests | Playwright | latest pinned |
| Payments | Stripe (backend only; no SDK in extension) | — |

**WXT cross-browser config** (two lines in `wxt.config.ts`):
```ts
browser: process.env.TARGET_BROWSER ?? 'chrome',  // chrome | firefox | edge
manifestVersion: process.env.TARGET_BROWSER === 'firefox' ? 2 : 3,
```
All builds share the same `src/`; WXT handles manifest generation per target, and the
browser family is injected at build time so shell routing stays in source rather than
tracked generated files.

---

## 4) Capture → export pipeline (updated)

```
User trigger (popup / shortcut)
  │
  ▼
Content Script (on-demand)
  ├─ Region: draws overlay, returns bounding rect
  ├─ Full-page: orchestrates scroll steps, collects raw segment data URLs
  │   └─ Light Mode flag: skips overlap-correction if enabled
  └─ Container: scrolls target element, collects segments

  ▼
Service Worker (orchestration)
  ├─ chrome.tabs.captureVisibleTab() for each step
  ├─ Stores raw segments in background capture cache
  └─ Sends OFFSCREEN_STITCH (or OFFSCREEN_ENCODE_ONLY for visible)

  ▼
Chromium offscreen runtime + shared heavy-worker core
  ├─ Stitch segments with overlap correction (unless light mode)
  ├─ Apply DPI normalization (devicePixelRatio from capture metadata)
  ├─ Apply ExportSpec: resize → encode PNG/JPEG/PDF
  ├─ JPEG target-size loop:
  │   └─ Try WebGPU imageBitmap path → fallback to OffscreenCanvas CPU
  └─ Return final Blob/dataURL to SW

  ▼
Service Worker
  └─ Stores result in capture cache (if "recent captures" enabled)
  └─ Delivers to editor or triggers download/clipboard
```

---

## 5) HiDPI handling

### Tier 1 — DPR capture only
`devicePixelRatio` is captured at trigger time and stored in `CaptureMetadata`:
```ts
interface CaptureMetadata {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;   // recorded for feasibility engine + Pro normalization
  screenLeft: number;
  screenTop: number;
  lightMode: boolean;
  capturedAt: number;
}
```
Tier 1 does **not** normalize DPR. It exports at native device pixels as captured.
When `devicePixelRatio > 1` is detected, the popup shows a non-blocking info banner:
> *"HiDPI screen detected. Exports will be at device pixels (2× size). Upgrade to Pro
> for correctly normalized 1× exports."*

The feasibility engine still uses `devicePixelRatio` to produce accurate `estimatedBytesRange`
so the size warning remains meaningful even without normalization.

### Tier 2 (Pro) — True 1× normalization
The `dpiPolicy: 'css1x'` export spec path divides physical dimensions by `devicePixelRatio`
before encoding, producing the correct logical-pixel output regardless of screen density.
WebGPU-accelerated resize where `gpu.requestAdapter()` resolves; CPU fallback guaranteed.

---

## 6) Feasibility engine (updated)

New checks added to `src/shared/feasibility.ts`:

| Check | Blocking? | Notes |
|-------|-----------|-------|
| Upscale ratio too high | Yes | — |
| Estimated file size > hard limit | Yes | — |
| PDF page crop risk | Yes | — |
| DPR-adjusted size estimate | Warn | Uses captured DPR for byte-range accuracy |
| CPU-seconds estimate on low-end device | Warn + suggest light mode | ✓ |
| Light mode already active | Info | Suppresses overlapping CPU warn |
| DPR > 1 detected (Tier 1 only) | Info banner (non-blocking) | Prompts Pro upgrade for True 1× |

CPU-seconds estimate: `estimatedMpx / deviceBenchmarkMpxPerSec`. `deviceBenchmarkMpxPerSec`
sampled once at popup open using a 1-frame canvas micro-benchmark (< 5 ms).

---

## 7) Export Spec + Preset community

ExportSpec JSON is the shareable unit of value:
```json
{
  "snapvault_preset": "1.0",
  "name": "Bug Report 1080p",
  "format": "png",
  "dimensions": { "mode": "preset", "presetId": "1080p" },
  "dpiPolicy": "css1x",
  "filenameTemplate": "bug-{date}-{url-slug}"
}
```

- Import: drag-drop JSON or file picker in Options → validates schema → adds to local preset list.
- Export: one-click download from Options preset manager.
- No server involved. Users share `.json` files on GitHub/Discord.
- Schema published at `docs/export-spec-schema.json` (local, bundled with extension).

---

## 8) Tier 2 modules (lazy-loaded)

| Module | Load trigger | Location |
|--------|-------------|----------|
| Transformers.js ONNX redaction | First `RUN_ML_REDACTION` | heavy-worker lazy import |
| DOM element isolation renderer | First `PICK_DOM_ELEMENT` | editor lazy chunk |
| Clean capture selector engine | First `TOGGLE_CLEAN_CAPTURE` | content lazy chunk |
| True 1× / HiDPI normalization | First `APPLY_EXPORT_SPEC` with `dpiPolicy: 'css1x'` (Pro) | offscreen encode path |
| Multi-capture board | First board workflow open (Pro) | editor lazy chunk |
| Responsive multi-capture pack | First pro workflow open | editor lazy chunk |

WASM/ONNX model weights are bundled in `public/assets/ml/` and referenced via local URLs
(no CDN fetch). The current local payload includes the quantized `redaction` model plus
the bundled ONNX Runtime WASM binary. Gated behind Pro license check before load.

---

## 9) Carbon / Sponsor ads isolation

MV3 blocks remote scripts in extension pages (CSP `script-src 'self'`).

Architecture:
- `options/editor` embeds `ads_sandbox.html` via `<iframe sandbox="allow-scripts allow-popups">`.
- `ads_sandbox.html` listed in `manifest.sandbox.pages` → runs own CSP, no extension APIs.
- Carbon script loaded only inside sandbox.
- **Alternative (recommended for solo launch):** replace Carbon with a static `sponsor.json`
  card rendered in `ads_sandbox.html` — zero external dependency, instant load.

No `postMessage` bridge that passes pixels. Sandbox page cannot reach `chrome.*` APIs.

---

## 10) Stripe licensing flow (unchanged from v2)

1. Extension generates/stores a `installationId` (random UUID, `chrome.storage.local`).
2. `START_LICENSE_CHECKOUT` → backend creates Stripe session → opens checkout URL in new tab.
3. Stripe webhook marks license active; binds to `installationId`.
4. Extension polls `SYNC_LICENSE` on next popup open; stores `licenseStatus`, `plan`, `expiresAt`.
5. `assertNoPixelPayload` guard wraps all licensing network calls.

---

## 11) Browser portability

```
src/shared/browser.ts       — wraps chrome.* / browser.* via webextension-polyfill
src/shared/offscreen-adapter.ts — stable heavy-worker client entrypoint
src/background/background-shell.chromium.ts — Chromium shell bootstrap
src/background/background-shell.firefox.ts  — Firefox shell bootstrap
src/offscreen/runtime.ts    — compile-time selected runtime shell entrypoint
```

- WXT handles manifest v2/v3 generation per build target.
- Shared logic stays in one repo, while browser-specific shells keep Chrome/Edge and
  Firefox bootstraps out of each other's entrypoints.
- Feature detection for `chrome.offscreen` remains in Chromium runtime code for offscreen
  lifecycle management and local fallback handling.
- Downloads-based save flow as universal baseline; Clipboard API gated behind detection.
- Chrome Android: not supported (extensions not available).

---

## 12) Repo layout

```
src/
  popup/
  options/
  editor/
  background/          service worker
  offscreen/           index.html + browser-specific runtime shell
  content/
  ads_sandbox/
  shared/
    dpi.ts
    feasibility.ts
    export-spec.ts
    browser.ts
    offscreen-adapter.ts
    heavy-worker-client.chromium.ts
    heavy-worker-client.firefox.ts
    assert-no-pixel-payload.ts
  assets/
    ml/               ONNX model weights (Pro, lazy)
    sponsor.json      (optional static sponsor card)
tests/
e2e/
test_pages/
docs/
```
