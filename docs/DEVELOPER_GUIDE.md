# DEVELOPER_GUIDE.md
# SnapVault — Repo Setup & Dev Workflow
# Version: 3.0.0 | Last Updated: 2026-03-16

---

## 1) Docs-first workflow

All product truth lives in `/docs/*.md`. Read them in this order before generating code:
1. `INVARIANTS.md`
2. `PRD.md`
3. `SECURITY_PRIVACY.md`
4. `TECHNICAL_ARCHITECTURE.md`
5. `OFFSCREEN_ARCHITECTURE.md`
6. `ML_REDACTION.md`
7. `API_SPECIFICATIONS.md`
8. `MONETIZATION_STRATEGY.md`
9. `TESTING_QA.md`
10. `DEPLOYMENT.md`
11. `AGENTS.md`

---

## 2) Prerequisites

- **Node.js 20+** (LTS)
- **WXT 0.20.19** (installed via `npm install` — pinned in `package.json`)
- TypeScript strict 5.x (bundled via WXT)
- A Chromium-based browser for dev (Chrome 120+ or Edge 120+)
- Firefox 115+ for cross-browser dev/testing

Do not upgrade WXT without reviewing the changelog for HMR, manifest-gen, or
cross-browser publishing regressions. Pin the exact version.

---

## 3) Non-negotiable dev rules

- No remote scripts in extension pages. MV3 CSP = `script-src 'self'`.
- All canvas / WASM work in `src/offscreen/`. Never in service worker.
- `env.allowRemoteModels = false` in any Transformers.js usage.
- `assertNoPixelPayload` wraps every `fetch` / `XHR` in the codebase.
- Tests for: Export Spec math, feasibility engine, DPI normalization, offscreen
  lifecycle, ML redaction (unit), capture expiry purge.
- CI must pass on both Chrome and Firefox builds before merge.

---

## 4) Core commands

```bash
# Development (Chrome, hot reload via WXT 0.20.19 HMR)
npm run dev                         # TARGET_BROWSER=chrome (default)
npm run dev:firefox                 # TARGET_BROWSER=firefox

# Builds
npm run build:chrome                # Produces dist/chrome/
npm run build:firefox               # Produces dist/firefox/ (MV2)
npm run build:edge                  # Produces dist/edge/ (same as chrome)
npm run build:all                   # All three targets

# Type checking
npm run typecheck

# Unit tests (Vitest)
npm test

# E2E — page-level tests (no extension)
npm run test:e2e

# E2E — Chromium extension harness
npm run test:e2e:extension:chromium

# E2E — Firefox extension harness
npm run test:e2e:extension:firefox

# Both extension harnesses (CI)
npm run test:e2e:extension

# Licensing backend (local Stripe dev)
npm run licensing:dev
```

---

## 5) WXT cross-browser config (`wxt.config.ts`)

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  // Two lines for cross-browser:
  browser: (process.env.TARGET_BROWSER as any) ?? 'chrome',
  manifestVersion: process.env.TARGET_BROWSER === 'firefox' ? 2 : 3,

  manifest: {
    name: 'SnapVault',
    permissions: [
      'activeTab', 'storage', 'downloads', 'clipboardWrite', 'scripting',
      // offscreen permission only for MV3 (Chrome/Edge)
      ...(process.env.TARGET_BROWSER !== 'firefox' ? ['offscreen'] : []),
    ],
    sandbox: {
      pages: ['ads_sandbox.html'],
    },
  },
});
```

---

## 6) Offscreen document development notes

- `src/offscreen/offscreen.html` is a WXT entrypoint — WXT registers it automatically.
- `src/offscreen/offscreen.ts` is the message handler module — do NOT import this from
  anywhere other than `offscreen.html`.
- During development, WXT hot-reload does NOT re-create the offscreen document. You must
  manually reload the extension (`chrome://extensions → reload`) to pick up offscreen changes.
- To debug offscreen: open `chrome://extensions`, click "Service Worker" → In DevTools,
  go to Sources → find `offscreen.html` page worker.
- Firefox: offscreen uses `background.html` (background page). Debug via `about:debugging`.

---

## 7) ML model setup (first time)

```bash
# Download and convert model to ONNX int8 (one-time setup)
npm run ml:setup         # runs scripts/setup-ml-model.mjs
```

`scripts/setup-ml-model.mjs`:
1. Downloads base model weights (one-time, developer machine only — NOT at runtime).
2. Converts to ONNX int8 quantized format.
3. Copies to `src/assets/ml/redaction.onnx`.

This file is bundled into the extension build. Users never download it — it ships with
the extension package. Size budget: < 5 MB compressed.

**CI:** `src/assets/ml/redaction.onnx` must be committed or available via Git LFS.
If missing, `npm run build:chrome` will fail with a clear error message.

---

## 8) Repo layout

```
src/
  popup/                  Capture controls + Export Spec picker
  options/                Presets + privacy toggles + sponsor slot
  editor/                 Canvas annotation + export
  background/             Service worker (orchestration only)
  offscreen/              offscreen.html + offscreen.ts (canvas/WASM)
  content/                Region select, element picker, clean capture, action bar
  ads_sandbox/            Sandboxed iframe — Carbon or sponsor.json card
  shared/
    types.ts              All shared TypeScript types
    dpi.ts                DPI normalization utilities
    feasibility.ts        Feasibility engine (pure function)
    export-spec.ts        ExportSpec validation + preset schema
    stitch.ts             Segment stitching algorithm (called from offscreen)
    encode.ts             JPEG/PNG encode (called from offscreen)
    pdf.ts                PDF assembly via pdf-lib (called from offscreen)
    redact.ts             Apply redact annotations to canvas (called from offscreen)
    browser.ts            chrome.* / browser.* adapter (webextension-polyfill)
    offscreen-adapter.ts  Routes heavy work: offscreen (Chrome) / bg page (Firefox)
    assert-no-pixel-payload.ts
  assets/
    ml/
      redaction.onnx      Bundled ONNX model weights (Pro, lazy-loaded)
    sponsor.json          Optional static sponsor card data

tests/                    Vitest unit tests
e2e/                      Playwright tests
  playwright.config.ts         Page-level tests
  playwright.extension.config.ts   Extension harness (Chromium + Firefox)
test_pages/               Synthetic pages for capture regression testing
services/
  licensing/
    server.mjs            Stripe licensing backend
docs/                     All product documentation (source of truth)
```

---

## 9) Environment variables

| Variable | Values | Default | Used in |
|----------|--------|---------|---------|
| `TARGET_BROWSER` | `chrome` / `firefox` / `edge` | `chrome` | WXT build + CI |
| `SNAPVAULT_E2E` | `1` / unset | unset | Grants `<all_urls>` for e2e harness only |
| `STRIPE_SECRET_KEY` | Stripe key | — | `services/licensing/` only; never bundled in extension |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | — | `services/licensing/` only |

**STRIPE_* keys are NEVER bundled into extension code.** Backend only.

---

## 10) Performance budget verification

```bash
npm run test:perf        # runs perf-budget.spec.ts
```

Budgets (fail CI if exceeded):
- Popup open: 150 ms median.
- Visible capture → export: 1 s median.
- Idle extension memory: 20 MB.
- ML model first-load: 3 s.
- "Nuke everything" completion: 500 ms.
