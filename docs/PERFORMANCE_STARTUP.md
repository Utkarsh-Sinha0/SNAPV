# PERFORMANCE_STARTUP.md
# SnapVault — Startup Performance Strategy
# Version: 1.0.0 | Last Updated: 2026-03-17

This document captures the current startup-performance policy for SnapVault and the
highest-value cold-start optimization work already landed in the repo.

---

## 1) Product decision: model delivery

**Decision:** ship the Pro redaction model bundled in v1.0.

Why:
- The model is a Pro-only feature, but it is also core to SnapVault's offline/privacy claim.
- Bundling keeps installation, review, support, and privacy semantics simple.
- Chrome Web Store and Firefox AMO can accept a legitimate ONNX payload after review.
- The product risk right now is redaction usefulness, not model transport architecture.

**Deferred to v1.1:** optional model delivery after install, gated by real-world evidence.

We only revisit that if one or more of these become true:
- first-run activation feels meaningfully slower on low-end hardware,
- uninstall or abandon rates correlate with package size,
- the bundled model is not accurate enough to justify shipping it to every Pro install,
- store-review friction materially increases because of ML assets.

---

## 2) Perf benchmark coverage

Startup budgets now live in the real extension harness:
- `e2e/performance.spec.ts`
- `npm run test:perf:extension:chromium`
- `npm run test:perf:extension:edge`
- `npm run test:perf:extension`

Tracked budgets:
- Service worker cold-start median: `< 1200 ms`
- Popup `DOMContentLoaded` median: `< 150 ms`
- Visible capture → download median: `< 1000 ms`

The service-worker benchmark launches a fresh persistent browser context, waits for the
extension worker to come up, and verifies that the runtime is responsive before recording
the timing. This is intentionally a cold-start check, not a warm-cache benchmark.

---

## 3) Landed cold-start wins

### A. Offscreen heavy worker is now split by behavior

`src/shared/heavy-worker-service.ts` now holds the shared heavy-work core without eagerly
loading every expensive dependency.

Landed:
- `pdf-lib` is lazy-loaded only for PDF export requests.
- `ml-redaction.ts` is lazy-loaded only for ML redaction requests.

Observed effect in the current Chrome build:
- `chunks/offscreen-*.js` is now a small bootstrap chunk.
- `chunks/pdf-*.js` is isolated as its own lazy chunk.
- `chunks/ml-redaction-*.js` is isolated as its own lazy chunk.

### B. Packaged ML runtime now ships the smaller WASM pair

The local ONNX runtime uses:
- `assets/ml/wasm/ort-wasm-simd-threaded.mjs`
- `assets/ml/wasm/ort-wasm-simd-threaded.wasm`

This keeps the runtime smaller without changing the bundled-model strategy.

### C. Artifact validation now enforces the slim payload

`scripts/validate-build-artifacts.mjs` requires the shipped runtime pair and rejects the
deprecated `jsep` artifacts, so package creep is caught in CI instead of by hand.

### D. Browser-specific shells now compile from one shared repo

The background runtime is now split into shared core plus browser-specific shells:
- `src/background/background-shell.chromium.ts`
- `src/background/background-shell.firefox.ts`
- `src/shared/heavy-worker-client.chromium.ts`
- `src/shared/heavy-worker-client.firefox.ts`
- compile-time shell selection in `src/background/background-shell.ts`,
  `src/shared/offscreen-adapter.ts`, and `src/offscreen/runtime.ts`

`npm run sync:browser-shells` runs automatically for dev, typecheck, test, build, and zip
commands so the repo stays single-source while each target gets its own shell wiring.

---

## 4) Current audit findings

### Finding 1: the service worker still carries too much shared code

Even after lazy-loading the offscreen PDF/ML helpers, `background.js` remains much larger
than ideal for a cold-start-sensitive extension.

The browser-shell split is now landed and verified:
- Chromium keeps the offscreen orchestration path.
- Firefox routes heavy work through the `background-heavy` listener shell.
- Firefox's packaged `background.js` is now slightly smaller than Chromium's
  (`1,416,405` bytes vs `1,417,854` bytes in the current build), which confirms the
  graphs are no longer identical.

The remaining cost is mostly shared background services, not the browser bridge itself.

### Finding 2: non-ML UI bundles are already relatively healthy

Current non-ML page chunks are small:
- popup chunk: ~11 KB
- options chunk: ~5 KB
- editor chunk: ~13 KB
- shared hooks chunk: ~13 KB

That means popup/editor/options are not the main cold-start problem right now.

### Finding 3: PDF was a real non-ML startup tax

`pdf-lib` is still valuable, but it should not be parsed on PNG/JPEG-only workflows.
That split is now landed and should stay lazy.

---

## 5) Next-step recommendations

Priority order:

1. **Keep startup work minimal before the first user action.**
   Background startup should register handlers and schedule light cleanup only. Avoid
   eager imports for Pro workflows, licensing helpers, or heavy worker logic.

2. **Keep carving heavy shared paths away from the background entry.**
   The next likely wins are inside shared capture/export/background services that still
   reference heavy-worker flows before the first user action.

3. **Measure on low-end hardware before changing model delivery.**
   If the new startup benchmark stays healthy on representative Chromebooks, keep the
   bundled-model strategy for v1.0 and avoid premature delivery complexity.

4. **Treat model delivery as a product decision, not a build trick.**
   Optional delivery is a v1.1 candidate only if real user data says the bundled model is
   hurting activation more than it helps adoption.
