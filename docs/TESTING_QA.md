# TESTING_QA.md
# SnapVault — Testing & QA Plan
# Version: 3.1.0 | Last Updated: 2026-03-17

---

## 1) Quality gates (CI must pass all of these)

| Gate | Target | Test type |
|------|--------|-----------|
| Service worker cold-start | < 1200 ms median | Playwright perf-budget |
| Popup load | < 150 ms median | Playwright perf-budget |
| Visible capture → export | < 1 s median (typical pages) | Playwright perf-budget |
| Full-page: no silent corruption | 100% correctness | Playwright golden-page |
| No pixel buffers in network calls | Zero outbound during capture/export | Playwright network intercept |
| No remote scripts in extension pages | Zero remote script tags | Static audit |
| Ads only in sandbox iframe | Verified in DOM | Playwright extension |
| Offscreen doc created + closed correctly | Lifecycle assertions | Playwright extension |
| ML model: no network call during inference | Zero outbound | Playwright network intercept |
| `assertNoPixelPayload` rejects pixel data | Throws as expected | Vitest unit |
| "Nuke everything" clears storage + offscreen | Both cleared within 500 ms | Playwright extension |
| Capture expiry purge | Entries > 7 days deleted on SW startup | Vitest + integration |
| Chrome build passes | Zero TS errors | CI build |
| Firefox build passes | Zero TS errors | CI build |
| Light mode stitch output | Correct image, no overlap hash step | Vitest unit |
| DPR=2: info banner shown in Tier 1 | Banner visible in popup; export proceeds at device pixels | Playwright extension |
| DPR=2: True 1× export (Pro) | css1x export dimensions = physical ÷ DPR | Vitest unit |

---

## 2) Test layers

### Unit tests (Vitest — `tests/`)

| Module | What to test |
|--------|-------------|
| `feasibility.ts` | All blocking + warning conditions; DPR-adjusted estimates; light-mode suggestion threshold; CPU-seconds calculation |
| `export-spec.ts` | Preset schema validation; import/export round-trip; breaking-change migration shim |
| `dpi.ts` | Device-pixel passthrough (Tier 1 — no normalization); css1x normalization for DPR=1, 1.5, 2, 3 (Pro path); screenLeft/Top offset recorded correctly |
| `stitch.ts` | Segment stitching with overlap correction (light mode OFF); nominal step stitching (light mode ON); no seam artifacts on synthetic segments |
| `encode.ts` | JPEG target-size loop converges; PNG encode is lossless; CPU fallback triggers when WebGPU unavailable |
| `redact.ts` | Blur applied to correct rect; DOM-text detections for email, phone, CC, API key, SSN; Luhn check |
| `assert-no-pixel-payload.ts` | Throws on ImageData / canvas Blob / dataURL payload; passes on metadata-only payload |
| `offscreen-adapter.ts` | Routes to offscreen on Chrome; routes to background page on Firefox (mock `isFirefox()`) |
| Capture expiry | `PURGE_EXPIRED_CAPTURES` deletes entries older than `captureExpiryDays`; leaves valid entries |
| License binding | `installationId` generated once; not regenerated on SW restart |

---

### Integration tests (Playwright page-level — `playwright.config.ts`)

Runs against synthetic `test_pages/` without loading the extension. Tests the shared
modules' behavior on real browser DOM.

| Test | test_page |
|------|-----------|
| Full-page stitch — infinite scroll | `test_pages/infinite-scroll.html` |
| Full-page stitch — sticky header + overlays | `test_pages/sticky-header-overlay.html` |
| Full-page stitch — light mode (no overlap correction) | Same pages + `lightMode: true` flag |
| Scrollable container capture | `test_pages/scrollable-container.html` |
| HiDPI simulation (DPR=2) | `test_pages/hidpi.html` (viewport scaled 2×) |
| Multi-monitor offset | `test_pages/hidpi.html` with non-zero `screenLeft` |
| Clean Capture CSS injection | `test_pages/sticky-header-overlay.html` (assert overlays hidden) |
| Element isolation canvas output | `test_pages/element-isolation.html` |
| Redaction annotation rendering | `test_pages/redaction/pii-sample.html` |

---

### Extension E2E tests (`playwright.extension.config.ts`)

Loads the full built extension in a real browser context.

#### Chromium extension harness (`npm run test:e2e:extension:chromium`)

| Test | Asserts |
|------|---------|
| Full capture → download flow | Downloaded file dimensions match Export Spec |
| Popup opens in < 150 ms | Perf budget |
| Feasibility warning shown | Warning visible for upscale spec on small image |
| Light mode toggle end-to-end | Toggle in settings; stitch uses nominal step |
| Offscreen doc created on capture | `chrome.offscreen.hasDocument()` returns true after capture |
| Offscreen doc closes after idle | Closed after 31 s inactivity |
| "Nuke everything" | Storage cleared + `chrome.offscreen.hasDocument()` returns false |
| Zero network during capture | Playwright network intercept: no outbound requests during stitch/encode |
| Pro ML redaction | Model loads locally; no network; annotation overlays appear; user confirm applies blur |
| Preset import/export | Export `.json`; re-import; preset appears in list |
| License checkout trigger | Opens Stripe checkout URL; no pixel data in request |
| Carbon/sponsor slot in editor only | Sandbox iframe present in editor; absent in popup DOM |
| HiDPI info banner (Tier 1) | DPR=2 viewport → non-blocking banner shown; export proceeds at device pixels |
| True 1× export — Pro gated | DPR=2 + Pro license → css1x export has half physical dimensions; same spec on Tier 1 → banner, no normalization |

#### Dedicated startup/perf runs

- `npm run test:perf:extension:chromium`
- `npm run test:perf:extension:edge`
- `npm run test:perf:extension`

These runs execute only `e2e/performance.spec.ts`, which now includes:
- service worker cold-start median budget
- popup `DOMContentLoaded` median budget
- visible capture → download median budget

#### Edge extension harness (`npm run test:e2e:extension:edge`)

Same Playwright suite as Chromium, but loaded from `dist/edge/` and launched through the
real Edge channel.

#### Firefox package/runtime contract (`npm run test:firefox:package`)

Firefox is covered by:
- `npm run build:firefox`
- `node scripts/validate-build-artifacts.mjs firefox`
- `npm run lint:firefox:baseline`
- Vitest coverage for `background-page` and `offscreen-adapter` Firefox paths

---

## 3) Golden test pages (`test_pages/`)

| File | Purpose |
|------|---------|
| `infinite-scroll.html` | Endless DOM for full-page stitch regression |
| `sticky-header-overlay.html` | Cookie banner + chat bubble + sticky nav |
| `scrollable-container.html` | Overflow-y scroll div, nested |
| `hidpi.html` | `devicePixelRatio` simulation (CSS `zoom: 2`) |
| `element-isolation.html` | Various elements with shadows, transparent bg, gradients |
| `redaction/pii-sample.html` | Synthetic PII: emails, phones, CC numbers, mock face images |
| `light-mode-long-page.html` | 20k px tall page for light mode stitch timing test |

---

## 4) Offscreen document test plan

The offscreen document cannot be introspected directly by Playwright. Test strategy:

**Unit (Vitest):** test `stitch`, `encode`, `buildPdf`, `applyRedactAnnotations`,
`runMlRedaction` as pure functions. They accept/return buffers. No message layer needed.

**Integration (Playwright extension):**
- Trigger a full-page capture. Assert final file matches expected spec.
- Assert no outbound network during operation (network intercept).

**Lifecycle (Playwright extension):**
```
1. Load extension. Assert hasDocument = false.
2. Trigger capture. Assert hasDocument = true within 2 s.
3. Wait 31 s idle. Assert hasDocument = false.
4. Trigger capture. Assert hasDocument = true.
5. Click "Nuke everything". Assert hasDocument = false within 500 ms.
```

**Firefox background-page mirror:**
- Verify same message shapes work via background page handler.
- Assert offscreen-adapter routes to `background-heavy` on Firefox.

---

## 5) ML redaction test plan

| Test | How |
|------|-----|
| `env.allowRemoteModels = false` is set | Unit: inspect Transformers.js env config after import |
| No network call during inference | Playwright network intercept: zero requests during `RUN_ML_REDACTION` |
| DOM-text detects email | Unit: synthetic DOM with `user@example.com` → annotation.type = 'email' |
| DOM-text detects CC (Luhn) | Unit: `4532015112830366` passes Luhn → annotation |
| ONNX model loads from local URL | Unit: mock `chrome.runtime.getURL` → assert model path is local |
| ML inference returns bounding boxes | Unit: reference screenshot → assert ≥ 1 annotation with valid rect |
| ML recall on reference images | Unit: PII-sample set → recall ≥ 90% (faces + logos + text blocks) |
| User must confirm before export applies | Playwright: trigger redaction → assert export without confirm has no blur |
| "Nuke everything" clears detections | Integration: redact → nuke → re-open editor → no annotations present |

---

## 6) Security regression tests

- Static audit: grep for `fetch(`, `XMLHttpRequest(`, `WebSocket(` — every hit must have
  `assertNoPixelPayload` call in the same code path. CI fails if any hit is missing it.
- Runtime: Playwright network intercept during capture, export, and ML redaction
  operations — assert zero outbound requests.
- Ads: assert `ads_sandbox.html` iframe is present in editor DOM (free tier only) and
  absent from popup DOM. Assert no `postMessage` from sandbox contains pixel data.
- ONNX: assert `env.allowRemoteModels === false` after module import in test environment.

---

## 7) CI matrix

| Job | Trigger |
|-----|---------|
| `typecheck + unit tests` | Every PR (all browsers) |
| `build:chrome` | Every PR |
| `build:edge` | Every PR |
| `build:firefox` | Every PR |
| `e2e:extension:chromium` | Every PR |
| `e2e:extension:edge` | Every PR |
| `test:firefox:package` | Every PR |
| `perf-budget` | Every PR (fail on regression) |
| `security-audit` (pixel payload static) | Every PR |
| `ml-recall` (reference image set) | Weekly + before release |
Firefox release validation is intentionally stricter than a raw `web-ext lint` pass. Run `npm run test:firefox:package`; it packages Firefox, validates artifacts, and then enforces the approved warning baseline documented in [FIREFOX_LINT_BASELINE.md](/E:/SNAPV/docs/FIREFOX_LINT_BASELINE.md).
