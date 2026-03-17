# DEVELOPER_GUIDE.md
# SnapVault — Repo Setup & Dev Workflow
# Version: 3.1.0 | Last Updated: 2026-03-17

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
10. `PERFORMANCE_STARTUP.md`
11. `DEPLOYMENT.md`
12. `AGENTS.md`

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
- All canvas / WASM work routes through the shared heavy-worker core. Chromium uses the
  offscreen runtime shell; Firefox uses the background-page shell.
- `env.allowRemoteModels = false` in any Transformers.js usage.
- `assertNoPixelPayload` wraps every `fetch` / `XHR` in the codebase.
- Tests for: Export Spec math, feasibility engine, DPI normalization, offscreen
  lifecycle, ML redaction (unit), capture expiry purge.
- CI must pass on both Chrome and Firefox builds before merge.

---

## 4) Core commands

```bash
# Browser shell sync (normally run automatically by dev/build/test commands)
npm run sync:browser-shells

# Development (Chrome, hot reload via WXT 0.20.19 HMR)
npm run dev                         # TARGET_BROWSER=chrome (default)
npm run dev:edge                    # TARGET_BROWSER=edge
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

# E2E — Chromium extension harness
npm run test:e2e:extension:chromium

# E2E — Edge extension harness
npm run test:e2e:extension:edge

# Dedicated startup/perf budgets
npm run test:perf:extension:chromium
npm run test:perf:extension:edge
npm run test:perf:extension

# Firefox packaging + runtime contract
npm run test:firefox:package

# Cross-browser matrix (Chromium + Edge e2e, Firefox package validation)
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

## 6) Heavy-worker development notes

- `src/offscreen/index.html` is the Chromium WXT entrypoint.
- `src/offscreen/runtime.chromium.ts` is the Chromium message-listener shell.
- `src/offscreen/runtime.firefox.ts` is a no-op shell so Firefox does not pull the
  Chromium offscreen runtime into its build graph.
- `src/shared/heavy-worker-service.ts` holds the browser-neutral stitch/encode/PDF/ML core.
- During development, WXT hot-reload does NOT re-create the offscreen document. You must
  manually reload the extension (`chrome://extensions → reload`) to pick up offscreen changes.
- To debug offscreen: open `chrome://extensions`, click "Service Worker" → In DevTools,
  go to Sources → find `offscreen.html` page worker.
- Firefox: offscreen uses `background.html` (background page). Debug via `about:debugging`.

---

## 7) ML model payload

The repo now ships the bundled local payload directly:
1. `public/assets/ml/redaction/config.json`
2. `public/assets/ml/redaction/preprocessor_config.json`
3. `public/assets/ml/redaction/onnx/model_quantized.onnx`
4. `public/assets/ml/wasm/ort-wasm-simd-threaded.{mjs,wasm}`

These files are copied into every extension artifact. No CDN fetch is allowed at runtime.

---

## 8) Repo layout

```
src/
  popup/                  Capture controls + Export Spec picker
  options/                Presets + privacy toggles + sponsor slot
  editor/                 Canvas annotation + export
  background/             Service worker (orchestration only)
  offscreen/              browser-specific runtime shells
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
    browser.ts            browser detection helpers
    offscreen-adapter.ts  Routes heavy work: offscreen (Chrome) / bg page (Firefox)
    assert-no-pixel-payload.ts
  assets/
    sponsor.json          Optional static sponsor card data

public/
  assets/
    ml/
      redaction/          Bundled local model config + ONNX weights
      wasm/               Bundled ONNX Runtime WASM payload

tests/                    Vitest unit tests
e2e/                      Playwright tests
  playwright.config.ts         Page-level tests
  playwright.extension.config.ts   Extension harness (Chromium + Edge)
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
| `SNAPVAULT_LICENSING_BASE_URL` | absolute `https://...` URL | unset | Injected into extension builds; also adds licensing host permissions |
| `STRIPE_SECRET_KEY` | Stripe key | — | `services/licensing/` only; never bundled in extension |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | — | `services/licensing/` only |

**STRIPE_* keys are NEVER bundled into extension code.** Backend only.
Use [`services/licensing/.env.example`](/E:/SNAPV/services/licensing/.env.example) as the backend env template.

---

## 10) Performance budget verification

```bash
npm run test:perf:extension
```

Budgets (fail CI if exceeded):
- Popup open: 150 ms median.
- Visible capture → export: 1 s median.
- Service worker cold-start: 1.2 s median.
- "Nuke everything" completion: 500 ms.
For Firefox packaging, use `npm run test:firefox:package` as the release-check command. It validates the build output and enforces the approved Mozilla lint baseline from [FIREFOX_LINT_BASELINE.md](/E:/SNAPV/docs/FIREFOX_LINT_BASELINE.md), so unexpected warnings fail fast in CI.
