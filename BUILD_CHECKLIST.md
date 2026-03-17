# BUILD_CHECKLIST.md
# SnapVault — Skills Inventory + Micromanaged Build Plan
# Version: 1.0.0 | Last Updated: 2026-03-16
#
# RULES FOR USING THIS CHECKLIST
# ─────────────────────────────────────────────────────────────────────
# 1. Work top-to-bottom. Never skip a layer.
# 2. Each checkbox = ONE function or ONE behavior. Nothing more.
# 3. Do not mark an item done until its test passes and you can read
#    the green output. No exceptions.
# 4. If an item feels too large to test in isolation → split it further.
# 5. No item may import from a layer below it in this file.
# 6. "Scope creep" definition for this project: anything not in PRD.md.
#    If you think of something new → add it to the backlog at the bottom,
#    not inline with the checklist.
# ─────────────────────────────────────────────────────────────────────

---

# PART 0 — SKILLS INVENTORY
# What you (or your agent) must understand before writing a single line.

## Core (must know well)
- [ ] **TypeScript strict mode** — `noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes`.
      If you don't understand why `string | undefined` ≠ `string`, learn this first.
- [ ] **Chrome Extension MV3 mental model** — service worker lifecycle, message passing,
      `chrome.tabs`, `chrome.storage`, `chrome.scripting`. Read the MV3 migration guide.
- [ ] **WXT 0.20.19** — file-based entrypoints, `wxt.config.ts`, cross-browser build flags,
      `browser.*` abstraction layer. Read the WXT docs intro + cross-browser guide.
- [ ] **Canvas API in an offscreen context** — `OffscreenCanvas`, `createImageBitmap`,
      `canvas.convertToBlob`, `ctx.drawImage`. Know that these work in offscreen docs
      but NOT in service workers.
- [ ] **`chrome.offscreen` API** — `createDocument`, `hasDocument`, `closeDocument`, reason
      flags (`DOM_PARSING`, `BLOBS`). Read the Chrome offscreen API reference page.
- [ ] **Vitest** — `describe`, `it`, `expect`, `vi.mock`, `beforeEach`. Know how to run a
      single test file and read coverage output.
- [ ] **Playwright extension testing** — loading an unpacked extension in Playwright,
      `page.context()`, `serviceWorker`, network interception. Read the Playwright docs for
      browser extensions.

## Needed for specific features (learn when you reach that layer)
- [ ] **Transformers.js 3.x** — `pipeline()`, `env.localModelPath`, `env.allowRemoteModels`,
      WASM/ONNX backend setup. Read the Transformers.js "use in browser extension" guide.
- [ ] **pdf-lib** — `PDFDocument.create()`, `addPage()`, `embedPng()/embedJpg()`,
      `save()`. Read the pdf-lib README examples.
- [ ] **webextension-polyfill** — why you need it for Firefox MV2 compat, how WXT wraps it.
- [ ] **WebGPU basics** — `navigator.gpu.requestAdapter()`, null-check fallback pattern.
      You only need to know how to detect availability and fall back gracefully.
- [ ] **Stripe Checkout (server-side only)** — `stripe.checkout.sessions.create()`,
      webhook verification with `stripe.webhooks.constructEvent()`. No SDK goes in extension.
- [ ] **JPEG iterative quality search** — binary search or step-down loop on
      `canvas.toBlob({ type: 'image/jpeg', quality })`. Understand why it's a loop.

## You do NOT need to learn
- React, Vue, Angular (you're using Preact — it's the same mental model, smaller)
- Any bundler internals (WXT handles it)
- IndexedDB (you're using `chrome.storage.local` only)
- WebSockets (not used anywhere in this product)
- Any cloud/server-side rendering (backend is one small Node.js file)

---

# PART 1 — SCAFFOLD
# Goal: a WXT project that builds and loads in Chrome and Firefox with
# correct manifests, correct permissions, and correct file structure.
# No features yet. No logic. Structure only.

- [ ] **1.01** `npm create wxt@latest` — initialise project with TypeScript template.
      TEST: `npm run typecheck` exits 0 with zero errors.

- [ ] **1.02** Pin WXT to `0.20.19` in `package.json`. Add `engines: { node: ">=20" }`.
      TEST: `node -e "require('./package.json').devDependencies.wxt"` prints `0.20.19`.

- [ ] **1.03** Create `wxt.config.ts` with `browser` and `manifestVersion` cross-browser
      switching based on `TARGET_BROWSER` env var. Default = `chrome`.
      TEST: `TARGET_BROWSER=firefox npm run build` produces a `dist/firefox/manifest.json`
      with `manifest_version: 2`.

- [ ] **1.04** Add all required permissions to `wxt.config.ts`:
      `activeTab, storage, downloads, clipboardWrite, scripting, offscreen`.
      Firefox manifest: omit `offscreen` (conditional on `TARGET_BROWSER !== 'firefox'`).
      TEST: `dist/chrome/manifest.json` contains `"offscreen"`.
            `dist/firefox/manifest.json` does NOT contain `"offscreen"`.

- [ ] **1.05** Create empty entrypoints so WXT registers them:
      `src/popup/index.html`, `src/options/index.html`, `src/editor/index.html`,
      `src/offscreen/offscreen.html`, `src/ads_sandbox/ads_sandbox.html`.
      Each file: minimal valid HTML, no logic.
      TEST: `npm run build:chrome` exits 0. All 5 HTML files appear in `dist/chrome/`.

- [ ] **1.06** Add `src/background/index.ts` as WXT background entrypoint.
      Contents: single `console.log('SW started')`. No logic.
      TEST: Load unpacked extension in Chrome. Open `chrome://extensions` → SW logs message.

- [ ] **1.07** Add `ads_sandbox.html` to `manifest.sandbox.pages` in `wxt.config.ts`.
      TEST: `dist/chrome/manifest.json` has `"sandbox": { "pages": ["ads_sandbox.html"] }`.

- [ ] **1.08** Create `src/content/index.ts` as a WXT content script entrypoint with
      `matches: ['<all_urls>']` gated behind `SNAPVAULT_E2E=1` build flag. In production
      build the content script has NO `matches` (injected programmatically via `scripting`).
      TEST: Production `dist/chrome/manifest.json` content script entry has no `matches`.
            E2E build `manifest.json` entry has `"<all_urls>"` in `matches`.

- [ ] **1.09** Scaffold all `src/shared/` module files as empty exports:
      `types.ts`, `dpi.ts`, `feasibility.ts`, `export-spec.ts`, `stitch.ts`,
      `encode.ts`, `pdf.ts`, `redact.ts`, `browser.ts`, `offscreen-adapter.ts`,
      `assert-no-pixel-payload.ts`.
      TEST: `npm run typecheck` still exits 0 after adding empty exports.

- [ ] **1.10** Create `src/assets/sponsor.json` with placeholder sponsor data.
      TEST: File is valid JSON. `npm run build:chrome` copies it to `dist/chrome/assets/`.

---

# PART 2 — SHARED PURE UTILITIES
# Goal: every function in src/shared/ works correctly in isolation.
# These are pure functions. No browser APIs. No messages. No side effects.
# Each one has a Vitest test file before any implementation.

## 2A — Types (`src/shared/types.ts`)

- [ ] **2.01** Define `ExportSpec` interface with all fields from API_SPECIFICATIONS.md §1.
      TEST: TypeScript compiles. A valid `ExportSpec` object satisfies the type.
            An object missing `format` causes a TS error.

- [ ] **2.02** Define `CaptureMetadata` interface (cssWidth, cssHeight, devicePixelRatio,
      screenLeft, screenTop, lightMode, capturedAt).
      TEST: TypeScript compiles. An object with wrong field type causes a TS error.

- [ ] **2.03** Define `FeasibilityResult` interface.
      TEST: TypeScript compiles.

- [ ] **2.04** Define `RedactAnnotation` interface and `RedactAnnotationType` union.
      TEST: TypeScript compiles. `'face' | 'email' | ...` covers all PRD-listed types.

- [ ] **2.05** Define `ExportSpecPreset` interface with `snapvault_preset: '1.0'` sentinel.
      TEST: TypeScript compiles. An object with `snapvault_preset: '2.0'` causes a TS error.

- [ ] **2.06** Define `LicenseState` interface
      (`status: 'free' | 'pro' | 'expired'`, `plan`, `expiresAt`, `installationId`).
      TEST: TypeScript compiles.

## 2B — assertNoPixelPayload (`src/shared/assert-no-pixel-payload.ts`)
# This is the most critical security function. Test it exhaustively.

- [ ] **2.07** `assertNoPixelPayload(payload: unknown): void` — throws `Error` if payload
      contains a `dataURL` field (string starting with `data:`).
      TEST: `assertNoPixelPayload({ dataUrl: 'data:image/png;base64,...' })` throws.

- [ ] **2.08** `assertNoPixelPayload` throws if payload contains an `ImageData` instance.
      TEST: `assertNoPixelPayload({ img: new ImageData(1,1) })` throws.

- [ ] **2.09** `assertNoPixelPayload` throws if payload is an `ArrayBuffer`.
      TEST: `assertNoPixelPayload(new ArrayBuffer(8))` throws.

- [ ] **2.10** `assertNoPixelPayload` does NOT throw for licensing metadata payloads.
      TEST: `assertNoPixelPayload({ installationId: 'abc', plan: 'pro' })` does not throw.

- [ ] **2.11** `assertNoPixelPayload` does NOT throw for empty objects or primitives.
      TEST: `assertNoPixelPayload({})` and `assertNoPixelPayload('hello')` do not throw.

- [ ] **2.12** `assertNoPixelPayload` throws if payload contains a nested `dataUrl`.
      TEST: `assertNoPixelPayload({ meta: { dataUrl: 'data:...' } })` throws.

## 2C — DPI utilities (`src/shared/dpi.ts`)

- [ ] **2.13** `toDevicePixels(cssValue: number, dpr: number): number` — returns
      `cssValue * dpr`.
      TEST: `toDevicePixels(100, 2)` === 200. `toDevicePixels(100, 1)` === 100.

- [ ] **2.14** `toCssPixels(physicalValue: number, dpr: number): number` — returns
      `physicalValue / dpr`.
      TEST: `toCssPixels(200, 2)` === 100. `toCssPixels(150, 1.5)` === 100.

- [ ] **2.15** `applyDpiPolicy(width: number, height: number, dpr: number,
      policy: 'css1x' | 'device'): { width: number, height: number }`.
      TEST: policy `css1x`, dpr=2, 200×200 → `{ width: 100, height: 100 }`.
            policy `device`, dpr=2, 200×200 → `{ width: 200, height: 200 }`.

- [ ] **2.16** `isHiDpi(dpr: number): boolean` — returns true when `dpr > 1`.
      TEST: `isHiDpi(2)` true. `isHiDpi(1)` false. `isHiDpi(1.5)` true.

## 2D — Export Spec validation (`src/shared/export-spec.ts`)

- [ ] **2.17** `validateExportSpec(spec: unknown): ExportSpec` — returns a typed
      `ExportSpec` or throws a descriptive `Error` listing the invalid field.
      TEST: Valid spec object returns typed value.
            `format: 'bmp'` throws `"Invalid format: bmp"`.
            Missing `format` field throws.

- [ ] **2.18** `validateExportSpecPreset(raw: unknown): ExportSpecPreset` — validates
      the community preset wrapper, including `snapvault_preset: '1.0'` sentinel.
      TEST: Wrong sentinel version throws `"Unsupported preset schema version"`.
            Valid preset round-trips correctly.

- [ ] **2.19** `getDefaultExportSpec(): ExportSpec` — returns a hardcoded safe default
      (PNG, no resize, css1x, simple filename template).
      TEST: Return value passes `validateExportSpec`.

- [ ] **2.20** `DEFAULT_PRESETS: ExportSpecPreset[]` — array of built-in presets
      (1080p, A4, social, device breakpoints).
      TEST: Every entry passes `validateExportSpecPreset`. No duplicate `name` values.

## 2E — Feasibility engine (`src/shared/feasibility.ts`)
# Pure function. No browser APIs. Takes spec + metadata, returns result.

- [ ] **2.21** `checkFeasibility(spec: ExportSpec, metadata: CaptureMetadata):
      FeasibilityResult` — skeleton returns `{ ok: true, blockingReasons: [],
      warnings: [] }`. All subsequent tests build on this function.
      TEST: Returns `ok: true` for a trivially valid input.

- [ ] **2.22** Upscale ratio check — blocking. If requested output width > source
      `cssWidth * 3`, add `"Upscale ratio too high"` to `blockingReasons`.
      TEST: Source 400px wide, spec requests 2000px → blocking reason present, `ok: false`.
            Source 400px, spec requests 800px → no blocking reason.

- [ ] **2.23** Estimated bytes check — blocking. Estimate PNG bytes as
      `width * height * 4`. If estimate > 50 MB, block.
      TEST: 4000×4000 → blocked. 1920×1080 → not blocked.
            `estimatedBytesRange` is populated in result.

- [ ] **2.24** PDF page crop risk warning. If format is `pdf` and requested height
      > A4 equivalent at the given DPI, add to `warnings`.
      TEST: format=pdf, height=20000 at 96dpi → warning present.

- [ ] **2.25** CPU-seconds estimate — warning. Estimate as
      `(outputWidthPx * outputHeightPx) / 4_000_000` seconds (rough proxy for a
      mid-range 2024 CPU). If > 5s, add warning and set `suggestLightMode: true`.
      TEST: 8000×6000 output → `suggestLightMode: true`, warning present.
            1920×1080 → `suggestLightMode: false`, no warning.

- [ ] **2.26** HiDPI info flag (Tier 1 only). If `metadata.devicePixelRatio > 1` AND
      `spec.dpiPolicy === 'device'`, set `hiDpiWarning: true` in result.
      This is data only — the UI renders the upgrade banner from this flag.
      TEST: DPR=2, dpiPolicy='device' → `hiDpiWarning: true`.
            DPR=1 → `hiDpiWarning: false`.
            DPR=2, dpiPolicy='css1x' → `hiDpiWarning: false` (Pro path, no banner needed).

- [ ] **2.27** Light mode already active note. If `metadata.lightMode === true`, suppress
      the CPU-seconds warning (user already accepted the trade-off).
      TEST: Same 8000×6000 input with `lightMode: true` → no CPU warning.

- [ ] **2.28** `estimatedBytesRange` is always populated as `[min, max]` regardless of
      blocking status (editor uses it to show "~X MB" estimate).
      TEST: Any valid input → result has `estimatedBytesRange` as a two-element number array.

## 2F — Stitch algorithm (`src/shared/stitch.ts`)
# Pure function. Takes array of ImageData or OffscreenCanvas + metadata.
# Returns a single OffscreenCanvas.

- [ ] **2.29** `stitchSegments(segments: ImageBitmap[], stepPx: number,
      overlapPx: number, lightMode: boolean): OffscreenCanvas` skeleton.
      TEST: Single-segment input → output dimensions equal segment dimensions.

- [ ] **2.30** Two-segment stitch without overlap correction (lightMode=true).
      Uses `stepPx` as-is; draws segA then segB positioned at `y = stepPx`.
      TEST: Two 100×200 segments, stepPx=180, lightMode=true →
            output height = 200 + (200 - 20) = 380px. Pixel at y=0 matches segA.
            Pixel at y=180 matches segB.

- [ ] **2.31** Two-segment stitch WITH overlap correction (lightMode=false).
      Finds the row where row-hash of segA bottom matches segB top → adjusts stitch line.
      TEST: Synthetic segments with known overlap of exactly 20px →
            output has no duplicated rows at seam.

- [ ] **2.32** N-segment stitch — applies stitch pairwise accumulating into one canvas.
      TEST: 5 segments of 100×200, stepPx=180, lightMode=true →
            output height = 200 + (4 × 180) = 920px.

- [ ] **2.33** `computeRowHash(canvas: OffscreenCanvas, y: number): number` —
      XOR of all pixel bytes in a single row. Used by overlap correction.
      TEST: Same row data → same hash. Different row data → different hash (any sample).

## 2G — JPEG encode + target-size loop (`src/shared/encode.ts`)
# Uses OffscreenCanvas.convertToBlob — runs in offscreen context.
# Unit tests mock convertToBlob.

- [ ] **2.34** `encodePng(canvas: OffscreenCanvas): Promise<Blob>` — wraps
      `canvas.convertToBlob({ type: 'image/png' })`.
      TEST (mock): `convertToBlob` called with correct type. Returns a Blob.

- [ ] **2.35** `encodeJpegAtQuality(canvas: OffscreenCanvas, quality: number):
      Promise<Blob>` — wraps `canvas.convertToBlob({ type: 'image/jpeg', quality })`.
      TEST (mock): quality=0.8 → correct options passed.

- [ ] **2.36** `encodeJpegTargetSize(canvas: OffscreenCanvas, targetBytes: number,
      toleranceBytes: number): Promise<Blob>` — step-down loop from quality=0.95,
      step -0.05, until blob.size <= targetBytes + toleranceBytes or quality < 0.05.
      Returns lowest-quality blob that meets the target.
      TEST (mock): mock returns sizes [500k, 400k, 200k] at qualities [0.95, 0.9, 0.85].
                   target=250k → returns the 200k blob at quality=0.85.

- [ ] **2.37** `encodeJpegTargetSize` returns the smallest result achieved even if
      target is never fully met (quality floor reached).
      TEST: All mock sizes > target → returns the last (smallest) blob with no throw.

## 2H — PDF assembly (`src/shared/pdf.ts`)

- [ ] **2.38** `buildPdf(pages: Blob[], spec: ExportSpec): Promise<Uint8Array>` —
      creates a `PDFDocument`, adds one page per blob, returns `save()` bytes.
      TEST: Single PNG blob → output is a valid PDF (first 4 bytes are `%PDF`).

- [ ] **2.39** Multi-page PDF — each blob becomes its own page at A4 or spec dimensions.
      TEST: 3 blobs → PDF has 3 pages.

## 2I — Redact apply (`src/shared/redact.ts`)

- [ ] **2.40** `applyRedactAnnotations(canvas: OffscreenCanvas,
      annotations: RedactAnnotation[]): OffscreenCanvas` — for each confirmed annotation
      (`userReviewed: true`), draws a gaussian-blur rectangle over that region.
      Returns the same canvas (mutated).
      TEST: Canvas with known pixel color; annotation covers that pixel;
            after apply, that pixel is NOT the original color (blur changed it).

- [ ] **2.41** Annotations where `userReviewed: false` are NOT applied.
      TEST: Unreviewed annotation → pixel unchanged after `applyRedactAnnotations`.

## 2J — DOM-text redaction detection (`src/shared/dom-redact.ts`)

- [ ] **2.42** `detectEmail(text: string): boolean` — regex match.
      TEST: `'user@example.com'` → true. `'notanemail'` → false. `'a@b'` → false.

- [ ] **2.43** `detectPhone(text: string): boolean` — E.164 + common national formats.
      TEST: `'+1-800-555-0100'` → true. `'hello'` → false.

- [ ] **2.44** `detectCreditCard(text: string): boolean` — regex + Luhn algorithm.
      TEST: `'4532015112830366'` → true (valid Luhn). `'1234567890123456'` → false (invalid Luhn).

- [ ] **2.45** `luhnCheck(digits: string): boolean` — standalone Luhn implementation.
      TEST: Known valid cards → true. Tampered digits → false.

- [ ] **2.46** `detectApiKey(text: string): boolean` — heuristic: length ≥ 20,
      alphanumeric + `-_`, Shannon entropy ≥ 3.5 bits/char.
      TEST: A real-looking API key string → true. A normal English word → false.

- [ ] **2.47** `detectSsn(text: string): boolean` — regex `\d{3}-\d{2}-\d{4}`.
      TEST: `'123-45-6789'` → true. `'123-456-789'` → false.

- [ ] **2.48** `scanTextNode(text: string): RedactAnnotationType[]` — runs all detectors,
      returns list of matching types (may be empty).
      TEST: `'Send to user@example.com'` → `['email']`.
            `'Card: 4532015112830366'` → `['credit-card']`.
            `'Hello world'` → `[]`.

---

# PART 3 — OFFSCREEN INFRASTRUCTURE
# Goal: offscreen document is created, receives messages, processes them,
# and closes correctly. No capture logic yet — just the plumbing.

- [ ] **3.01** `ensureOffscreenDocument(): Promise<void>` in
      `src/background/offscreen-manager.ts`. Uses `chrome.offscreen.createDocument`
      with reason `BLOBS` + `DOM_PARSING`. No-ops if document already exists.
      TEST (mock chrome.offscreen): called once even if invoked twice concurrently.

- [ ] **3.02** `closeOffscreenDocument(): Promise<void>` — calls
      `chrome.offscreen.closeDocument()`. Catches and ignores "no document" errors.
      TEST (mock): `closeDocument` called exactly once.

- [ ] **3.03** Idle timer: after each offscreen operation, a 30s timeout schedules
      `closeOffscreenDocument`. Resetting the timer cancels the previous one.
      TEST (fake timers): Two operations 5s apart → only one close call at 30s after
      the second operation.

- [ ] **3.04** `nukeOffscreenMemory(): Promise<void>` — cancels idle timer, calls
      `closeOffscreenDocument` immediately.
      TEST (mock + fake timer): pending timer is cancelled; close called immediately.

- [ ] **3.05** `offscreen-adapter.ts` — `sendToHeavyWorker<T>(msg): Promise<T>`:
      - On Chrome: calls `ensureOffscreenDocument`, resets idle timer, sends message.
      - On Firefox: sends directly to background page handler.
      TEST (mock `isFirefox()`): Chrome path → `ensureOffscreenDocument` called.
                                  Firefox path → `ensureOffscreenDocument` NOT called.

- [ ] **3.06** `src/offscreen/offscreen.ts` message listener — receives
      `OFFSCREEN_CLEAR_MEMORY`, clears any held image references, sends `{ ok: true }`.
      TEST (jsdom): Send `OFFSCREEN_CLEAR_MEMORY` → listener responds `{ ok: true }`.

- [ ] **3.07** Correlation IDs — every offscreen request includes a unique `id` (UUID).
      The offscreen handler echoes the `id` in the response. SW resolves the correct
      pending Promise by matching `id`.
      TEST: Two concurrent `OFFSCREEN_ENCODE` messages with different `id`s → each
      caller receives the response with its own `id`.

---

# PART 4 — CAPTURE PIPELINE
# Goal: all four capture modes produce a raw dataURL in the SW capture cache.
# No export/encode yet. Raw capture only.

- [ ] **4.01** `generateInstallationId(): string` — generates a random UUID v4, stores
      it in `chrome.storage.local` under key `installationId`, returns it.
      Second call returns the same stored ID without generating a new one.
      TEST (mock storage): First call → UUID stored + returned.
                           Second call → same UUID returned; `set` NOT called again.

- [ ] **4.02** `CAPTURE_VISIBLE` handler in SW — calls `chrome.tabs.captureVisibleTab`,
      stores result via `STORE_CAPTURE_DATA_URL`, returns `captureId`.
      TEST (mock captureVisibleTab): dataURL stored with correct `captureId`.

- [ ] **4.03** `STORE_CAPTURE_DATA_URL` handler — stores `{ dataUrl, metadata }` in
      `chrome.storage.local` under key `capture:{captureId}` only if
      `privacySettings.storeCaptures === true`. Always keeps it in in-memory Map
      regardless (for current session use).
      TEST: storeCaptures=false → `storage.set` NOT called; in-memory Map updated.
            storeCaptures=true → `storage.set` called.

- [ ] **4.04** `GET_CAPTURE_DATA_URL` handler — returns from in-memory Map first,
      falls back to `chrome.storage.local`.
      TEST (mock): In-memory hit → storage NOT queried.
                   Cache miss → storage queried.

- [ ] **4.05** `DELETE_CAPTURE` handler — removes from both in-memory Map and
      `chrome.storage.local`.
      TEST (mock): Both removal paths called.

- [ ] **4.06** `PURGE_EXPIRED_CAPTURES` handler — lists all `capture:*` keys in
      `chrome.storage.local`, reads `metadata.capturedAt` for each, deletes entries
      older than `captureExpiryDays` days.
      TEST (mock storage with 3 entries: 1 fresh, 2 stale, expiryDays=7):
      Only the 2 stale entries are deleted.

- [ ] **4.07** SW calls `PURGE_EXPIRED_CAPTURES` once at startup.
      TEST (mock): handler invoked within 1 tick of SW `install` event.

- [ ] **4.08** `CAPTURE_REGION` handler — receives `rect: DOMRect`, passes it to
      content script to confirm the selection, then calls `captureVisibleTab` and
      crops the result to `rect` in offscreen doc via `OFFSCREEN_ENCODE`.
      TEST (mock): `sendToHeavyWorker` called with correct crop coordinates.

- [ ] **4.09** `CAPTURE_FULLPAGE` handler — orchestrates scroll steps:
      a) inject content script to measure `document.body.scrollHeight`
      b) scroll page to each step position
      c) `captureVisibleTab` at each step
      d) collect segments as array of dataURLs
      e) send `OFFSCREEN_STITCH` with segments + metadata
      f) store result via `STORE_CAPTURE_DATA_URL`
      TEST (mock with 3 scroll steps): exactly 3 `captureVisibleTab` calls; one
      `OFFSCREEN_STITCH` call with 3 segments.

- [ ] **4.10** `CAPTURE_FULLPAGE` sends `lightMode` from current settings in
      `CaptureMetadata`.
      TEST (mock, lightMode=true): metadata.lightMode === true in OFFSCREEN_STITCH payload.

- [ ] **4.11** `CAPTURE_SCROLL_CONTAINER` handler — receives `selector` string,
      injects content script that scrolls target element, captures segments.
      TEST (mock): content script receives correct `selector`; segments collected.

- [ ] **4.12** `NUKE_ALL_CAPTURES` handler — calls `nukeOffscreenMemory()`, then
      clears all `capture:*` keys from `chrome.storage.local`, then clears in-memory Map.
      Nuke runs in this exact order (offscreen cleared before storage).
      TEST (mock): `nukeOffscreenMemory` called BEFORE `storage.remove`.

---

# PART 5 — EXPORT PIPELINE
# Goal: given a captureId and ExportSpec, produce a downloaded or clipboard file.
# Builds on PART 4 (capture cache) and PART 2 (pure utils).

- [ ] **5.01** `APPLY_EXPORT_SPEC` handler — retrieves dataURL from cache, sends
      `OFFSCREEN_ENCODE` with spec, receives encoded Blob, returns it to caller.
      TEST (mock): correct captureId lookup; correct spec forwarded to offscreen.

- [ ] **5.02** `OFFSCREEN_ENCODE` handler in offscreen.ts — applies DPI policy via
      `applyDpiPolicy`, resizes OffscreenCanvas if needed, routes to
      `encodePng` / `encodeJpegAtQuality` / `encodeJpegTargetSize` based on spec.
      Returns dataURL result.
      TEST: spec `format=png` → `encodePng` called.
            spec `format=jpeg, mode=quality` → `encodeJpegAtQuality` called.
            spec `format=jpeg, mode=targetSize` → `encodeJpegTargetSize` called.

- [ ] **5.03** `OFFSCREEN_ENCODE` — DPI normalization gated. If `dpiPolicy='css1x'`
      AND `licenseStatus !== 'pro'` → return error `'HiDPI normalization requires Pro'`.
      TEST: free tier + css1x spec → error returned, no encoding performed.
            pro tier + css1x spec → encoding proceeds.

- [ ] **5.04** `OFFSCREEN_BUILD_PDF` handler — calls `buildPdf(pages, spec)`, returns
      result as base64 or Blob.
      TEST: 2-page input → PDF Uint8Array with 2 pages (mock pdf-lib).

- [ ] **5.05** `EXPORT_DOWNLOAD` handler — receives encoded Blob/dataURL from
      `APPLY_EXPORT_SPEC`, resolves filename from `spec.filenameTemplate`, calls
      `chrome.downloads.download`.
      TEST (mock): `chrome.downloads.download` called with correct filename.
                   `assertNoPixelPayload` NOT violated (downloads is local, not network).

- [ ] **5.06** Filename template resolution — `{date}` → `YYYY-MM-DD`,
      `{time}` → `HH-MM-SS`, `{format}` → file extension.
      TEST: `"screenshot-{date}-{time}.{format}"` with known date/time →
            `"screenshot-2026-03-16-14-30-00.png"`.

- [ ] **5.07** `EXPORT_CLIPBOARD` handler — encodes to PNG Blob, writes to clipboard
      via `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`.
      TEST (mock clipboard): `ClipboardItem` created with correct mime type.

- [ ] **5.08** `CHECK_FEASIBILITY` handler — calls `checkFeasibility(spec, metadata)`,
      returns `FeasibilityResult`. No side effects.
      TEST: returns the direct output of `checkFeasibility` (pure delegation).

---

# PART 6 — POPUP UI
# Goal: functional popup. Opens in < 150ms. No network calls.
# Preact components. Each component is independently testable.

- [ ] **6.01** `<CaptureButtons>` component — renders three buttons:
      "Capture Visible", "Capture Region", "Capture Full Page".
      Each sends the correct message type to SW on click.
      TEST (Preact testing-library): button click fires correct message type.

- [ ] **6.02** `<ExportSpecPicker>` component — renders format selector (PNG/JPEG/PDF),
      dimension preset dropdown, DPI policy selector. Controlled component; takes
      `spec` prop and `onChange` callback.
      TEST: Changing format fires `onChange` with updated spec.
            Selecting "Manual" reveals width/height inputs.

- [ ] **6.03** `<FeasibilityBanner>` component — takes `FeasibilityResult` prop.
      - Renders nothing when `ok: true` and no warnings.
      - Renders blocking reasons in red when `ok: false`.
      - Renders warnings in yellow when present.
      - Renders HiDPI upgrade banner when `hiDpiWarning: true`.
      TEST: Each case renders the correct UI element.

- [ ] **6.04** `<HiDpiBanner>` sub-component — renders non-blocking info strip with
      upgrade CTA when `hiDpiWarning` is true.
      TEST: Renders with correct text. Does NOT render when `hiDpiWarning: false`.

- [ ] **6.05** Popup root — on mount, sends `CHECK_FEASIBILITY` with stored spec +
      current tab metadata. Renders `<FeasibilityBanner>` with result.
      Must complete within 150ms budget (no async blocking before first paint).
      TEST: Component mounts; `CHECK_FEASIBILITY` message sent in `useEffect`.
            Initial render does NOT await the feasibility response.

- [ ] **6.06** `<ActionBar>` component — shown after a capture is available.
      Buttons: "Copy", "Download", "Open Editor", "Re-capture".
      Each fires the correct message.
      TEST: Each button click → correct message type dispatched.

- [ ] **6.07** `<ExportReceipt>` component — shown briefly after successful download.
      Displays filename + "Saved". Auto-dismisses after 3s.
      TEST: Renders filename. After 3s (fake timer) → unmounts.

---

# PART 7 — EDITOR PAGE
# Goal: canvas-based annotation. Sends work to SW/offscreen. No inline encoding.

- [x] **7.01** Editor receives `captureId` from URL param or message. Requests
      `GET_CAPTURE_DATA_URL` from SW, loads image onto canvas.
      TEST (mock SW): correct captureId requested; image drawn onto canvas element.

- [x] **7.02** `<AnnotationToolbar>` — buttons for Arrow, Text, Highlight, Blur (manual).
      Active tool highlighted. Fires `setActiveTool` on click.
      TEST: Click "Blur" → active tool state = 'blur'.

- [x] **7.03** Arrow tool — mousedown+mousemove+mouseup on canvas draws an arrow.
      Arrow stored as an annotation object `{ type: 'arrow', startX, startY, endX, endY }`.
      TEST (simulated mouse events): annotation object created with correct coordinates.

- [x] **7.04** Text tool — click on canvas opens an inline `<textarea>` at click coords.
      On blur/Enter, stores `{ type: 'text', x, y, content }` annotation.
      TEST: Click at (50, 80) → textarea visible at those coords.
            On blur → annotation stored with `x=50, y=80`.

- [x] **7.05** Highlight tool — drag to create a semi-transparent rect annotation.
      TEST: drag (10,10)→(60,60) → annotation `{ type: 'highlight', rect: {x:10,y:10,w:50,h:50} }`.

- [x] **7.06** Manual blur tool — drag to create a `{ type: 'blur', rect }` annotation.
      Rendered as a blurred region on canvas.
      TEST: annotation created; canvas pixel in the region differs from original after render.

- [x] **7.07** Undo stack — each annotation push is undoable with Ctrl+Z.
      TEST: Add 3 annotations; Ctrl+Z × 2 → 1 annotation remains.

- [x] **7.08** "Export" button in editor — sends `APPLY_EXPORT_SPEC` with current spec,
      then `EXPORT_DOWNLOAD`. Editor does NOT encode inline.
      TEST (mock SW): `APPLY_EXPORT_SPEC` followed by `EXPORT_DOWNLOAD` sent.

---

# PART 8 — OPTIONS PAGE

- [x] **8.01** `<PrivacySettings>` component — renders "Store recent captures" toggle
      (default OFF), expiry slider (1–30 days, default 7), "Nuke everything" button.
      TEST: Toggle fires storage write with `privacySettings.storeCaptures`.
            Slider updates `captureExpiryDays`.

- [x] **8.02** "Nuke everything" button — sends `NUKE_ALL_CAPTURES` to SW, shows
      a confirmation dialog first ("This will delete X captures. Continue?").
      TEST: Without confirm dialog answer, message NOT sent.
            After confirming, message sent.

- [x] **8.03** `<PresetManager>` component — lists presets from storage. "Export" button
      downloads the preset as a `.json` file. "Import" button opens file picker.
      TEST: Export → `URL.createObjectURL` called with JSON blob containing preset data.
            Import with valid JSON → preset added to list.

- [x] **8.04** Preset import validation — runs `validateExportSpecPreset` on imported JSON.
      Invalid file shows error message; does NOT add to list.
      TEST: Invalid JSON → error message shown; `presets.length` unchanged.

- [x] **8.05** `<SponsorSlot>` component — renders `<iframe>` pointing to
      `ads_sandbox.html` with `sandbox="allow-scripts allow-popups"`.
      NOT rendered when license is Pro.
      TEST: Free tier → iframe present. Pro tier → iframe absent.

---

# PART 9 — CONTENT SCRIPT
# One script injected on-demand. Three independent behaviours.

- [x] **9.01** Region select overlay — on `CAPTURE_REGION` trigger, injects a full-screen
      semi-transparent `<div>` overlay. User drags to select rect. On mouseup, sends
      selection rect back to SW and removes overlay.
      TEST (jsdom): Overlay added to DOM on trigger. Dragging produces correct rect.
                    Overlay removed after selection.

- [x] **9.02** Element picker — on `PICK_DOM_ELEMENT`, highlights hovered elements with
      an outline as mouse moves. On click, sends element's `getBoundingClientRect()` and
      a unique CSS selector back to SW.
      TEST (jsdom): Hover → outline applied. Click → correct rect + selector sent.

- [x] **9.03** Action bar injection — after a visible/region capture, injects a small
      floating `<div>` action bar at bottom of viewport with Copy/Download/Editor/Re-capture.
      Action bar is removed on any click or after 8s.
      TEST (jsdom): Bar rendered with 4 buttons. Click → correct message + bar removed.
                    After 8s (fake timer) → bar removed.

---

# PART 10 — PRO MOATS (Tier 2)
# Gate everything at the background message handler AND the UI.

- [x] **10.01** Pro gate utility: `assertProLicense(state: LicenseState): void` — throws
      `ProRequiredError` if `state.status !== 'pro'`.
      TEST: free status → throws. pro status → does not throw.

- [x] **10.02** All pro-only message handlers call `assertProLicense` as first line.
      TEST: Send `TOGGLE_CLEAN_CAPTURE` with free license → error response returned;
            handler logic NOT executed.

## Clean Capture

- [x] **10.03** `buildCleanCaptureCSS(selectors: string[]): string` — generates a CSS
      string that sets `visibility: hidden !important` on each selector plus a default
      list of known overlay patterns (cookie banners etc).
      TEST: Input `['.my-banner']` → output CSS contains `.my-banner { visibility: hidden !important }`.

- [x] **10.04** `validateCssSelector(selector: string): boolean` — safely tests if a
      string is a valid CSS selector using `document.querySelector` in a try/catch.
      TEST: `.valid-class` → true. `{{invalid}}` → false.

- [x] **10.05** Content script `applyCleanCapture(css: string): () => void` — injects a
      `<style>` tag with the CSS, returns a cleanup function that removes it.
      TEST (jsdom): Style tag injected. Cleanup removes it. No tag left after cleanup.

- [x] **10.06** `TOGGLE_CLEAN_CAPTURE` handler — validates custom selectors with
      `validateCssSelector`, stores validated selectors, sends CSS to content script.
      TEST (mock): Invalid selector filtered out before storage write.

## True 1× export (already gated in 5.03 — this adds the UI)

- [x] **10.07** Pro badge on DPI policy selector in ExportSpecPicker — when user is
      free tier and selects `css1x`, show a "Pro" badge and a tooltip explaining the
      feature. Do not block the selection; the gate fires at export time.
      TEST: Free tier + select css1x → badge visible. Pro tier → no badge.

## DOM Element Isolation

- [x] **10.08** Element isolation capture — after element picker returns a rect,
      capture a screenshot cropped to that rect (via `CAPTURE_REGION`).
      TEST (mock): correct rect forwarded to `CAPTURE_REGION`.

- [x] **10.09** `<BackgroundToggle>` component — three-way button in isolation toolbar:
      "Transparent" / "Remove shadow" / "Solid fill".
      TEST: Click each → fires `setBackgroundMode(mode)` with correct value.

- [x] **10.10** `applyBackgroundMode(canvas: OffscreenCanvas, mode: 'transparent'
      | 'remove-shadow' | 'solid', fillColor?: string): OffscreenCanvas`:
      - `transparent`: noop (canvas already has correct alpha from isolation).
      - `remove-shadow`: applies `ctx.filter = 'drop-shadow(0 0 0 transparent)'` pass.
      - `solid`: fills background with `fillColor`.
      TEST: `solid` mode with `#ffffff` → corner pixel is white.
            `transparent` mode → corner pixel alpha is 0 (for a known transparent-bg canvas).

## Auto-Redaction — DOM text layer

- [x] **10.11** `RUN_DOM_REDACTION` handler — injects content script that walks visible
      text nodes, calls `scanTextNode` on each, converts detections to
      `RedactAnnotation[]` using `Range.getBoundingClientRect()`.
      Returns annotation array to caller.
      TEST (mock content script response): 2 text nodes with known PII →
            2 annotations with correct types and non-zero rects.

## Auto-Redaction — ML layer (Transformers.js)

- [x] **10.12** `src/offscreen/ml-redaction.ts` — sets `env.allowRemoteModels = false`
      and `env.localModelPath = chrome.runtime.getURL('assets/ml/')` on module load.
      TEST: After `import './ml-redaction'`, `env.allowRemoteModels === false`.

- [x] **10.13** `runMlRedaction(dataUrl: string): Promise<{ annotations: RedactAnnotation[] }>`
      — lazy-loads `pipeline('object-detection', 'redaction')`, runs inference,
      maps results to `RedactAnnotation[]` with `source: 'ml'`.
      TEST (mock pipeline): mock returns 2 detections → 2 annotations returned.
                            No `fetch` call made during execution (mock network).

- [x] **10.14** `OFFSCREEN_RUN_ML_REDACTION` handler — calls `runMlRedaction`,
      returns result. If model loading throws, returns `{ ok: false, error: '...' }`.
      TEST: Successful path → annotations in response.
            Model-load error → error response without throw.

## Multi-capture board (Pro-only)

- [x] **10.15** `OPEN_CAPTURE_BOARD` message handler — Pro-gated. Opens editor in
      "board mode" URL param. Accepts array of `captureId`s.
      TEST: Free license → error. Pro license → editor opened with board param.

- [x] **10.16** Board editor — renders N captures in a drag-and-drop grid. "Export board"
      sends all canvases to `OFFSCREEN_STITCH` in vertical layout, then to
      `OFFSCREEN_ENCODE`.
      TEST (mock): 3 captures → `OFFSCREEN_STITCH` called with 3 segments.

---

# PART 11 — LICENSING + MONETIZATION

- [ ] **11.01** `generateInstallationId` (already done in 4.01) — confirm it's used as
      the ID in all licensing calls.
      TEST: `START_LICENSE_CHECKOUT` payload contains the stored `installationId`.

- [ ] **11.02** `START_LICENSE_CHECKOUT` handler — sends
      `POST /v1/licensing/checkout` with `{ installationId, plan, country }`.
      Calls `assertNoPixelPayload` on the payload before fetch.
      TEST (mock fetch): `assertNoPixelPayload` called; fetch called with correct body.
                         Response URL opened in new tab.

- [ ] **11.03** `SYNC_LICENSE` handler — sends `POST /v1/licensing/sync`,
      stores returned `LicenseState` in `chrome.storage.local`.
      TEST (mock fetch): response stored; `licenseStatus` updated.

- [ ] **11.04** `GET_LICENSE_STATE` handler — returns current `LicenseState` from
      storage without a network call.
      TEST: Returns stored state immediately.

- [ ] **11.05** License sync on popup open — popup sends `SYNC_LICENSE` once per day
      (checks `lastSyncedAt` timestamp in storage; skips if < 24h ago).
      TEST (mock): Called on first open. NOT called if `lastSyncedAt` was 1h ago.

- [ ] **11.06** Licensing backend `POST /v1/licensing/checkout` — creates Stripe
      Checkout Session, returns `{ url }`. Uses `country` for price-ID selection.
      TEST (mock Stripe): correct price ID selected for India vs US. Returns URL.

- [ ] **11.07** Licensing backend webhook handler — verifies Stripe signature,
      handles `checkout.session.completed`, marks license active in DB.
      TEST (mock Stripe.webhooks): invalid signature → 400. Valid → license updated.

- [ ] **11.08** `ads_sandbox.html` renders `sponsor.json` card when no Carbon script
      is configured. Reads `chrome.runtime.getURL('assets/sponsor.json')` via fetch
      (allowed inside sandbox). Renders name, tagline, CTA.
      TEST (mock fetch in sandbox context): card renders with sponsor name.

---

# PART 12 — CROSS-BROWSER (Firefox)

- [ ] **12.01** `src/shared/browser.ts` — exports `isFirefox(): boolean` based on
      `navigator.userAgent` or `typeof browser !== 'undefined'`.
      TEST: in Chrome user-agent context → false. Firefox UA string → true.

- [ ] **12.02** Firefox background page (`src/background/background-page.ts`) —
      mirrors all `OFFSCREEN_*` message handlers (stitch, encode, pdf, redact, ml).
      Shares the same module imports from `src/shared/`.
      TEST: Send `OFFSCREEN_ENCODE` to Firefox background page handler → correct
            result returned (same test as offscreen handler, different entry point).

- [ ] **12.03** `offscreen-adapter` Firefox path — `sendToHeavyWorker` routes to
      `background-page` handler when `isFirefox()` is true.
      TEST (mock isFirefox=true): background-page message sent; offscreen NOT created.

- [ ] **12.04** `npm run build:firefox` — zero TypeScript errors; zero WXT warnings.
      Manifest has `manifest_version: 2`; no `offscreen` permission.
      TEST: build exits 0; `dist/firefox/manifest.json` checked programmatically.

- [ ] **12.05** Firefox extension E2E — full capture → download flow passes in
      Playwright Firefox extension harness.
      TEST: Playwright test `test:e2e:extension:firefox` passes for visible capture.

---

# PART 13 — SECURITY AUDIT + PERFORMANCE

- [ ] **13.01** Static pixel payload audit — script that greps for `fetch(`, `XHR`,
      `WebSocket.send` in `src/` and asserts every hit has `assertNoPixelPayload`
      in the same function scope. Fails CI if any hit is missing it.
      TEST: Introduce a bare `fetch()` call → script exits non-zero.

- [ ] **13.02** Network intercept test — Playwright test that intercepts all network
      requests during a full-page capture + export. Asserts zero requests to non-
      licensing, non-analytics domains.
      TEST: Playwright intercept; capture + export; assert request log is empty
            (except any licensing mock endpoint).

- [ ] **13.03** ML network intercept test — Playwright test during `RUN_AUTO_REDACTION`.
      Assert zero network requests.
      TEST: No fetch to any URL during ML inference.

- [ ] **13.04** `env.allowRemoteModels === false` assertion — Vitest test that imports
      `ml-redaction.ts` and checks the env value after import.
      TEST: Value is `false` after module load.

- [ ] **13.05** Offscreen lifecycle integration — Playwright extension test:
      1. Assert `hasDocument` = false at start.
      2. Trigger capture. Assert `hasDocument` = true within 2s.
      3. Wait 31s. Assert `hasDocument` = false.
      TEST: All three assertions pass in sequence.

- [ ] **13.06** "Nuke everything" integration — Playwright:
      1. Enable capture storage. Perform a capture.
      2. Verify capture exists in storage.
      3. Click "Nuke everything". Confirm dialog.
      4. Assert storage has zero `capture:*` keys.
      5. Assert `hasDocument` = false.
      TEST: All assertions pass within 500ms of button click.

- [ ] **13.07** Popup performance budget — Playwright perf test:
      `page.goto(popupUrl)`. Measure time to `DOMContentLoaded`. Assert < 150ms.
      TEST: Median of 5 runs < 150ms. CI fails if exceeded.

- [ ] **13.08** Visible capture → export budget — Playwright:
      Measure time from "Capture Visible" click to `chrome.downloads.download` called.
      Assert < 1000ms median.
      TEST: Median of 5 runs < 1000ms.

- [ ] **13.09** Idle memory check — Playwright: load extension, do nothing for 10s,
      measure `performance.memory.usedJSHeapSize`. Assert < 20 MB.
      TEST: Heap < 20 MB with no captures in progress.

- [ ] **13.10** Ads isolation verification — Playwright: inspect Options page DOM.
      Assert `ads_sandbox.html` is inside an `<iframe sandbox="...">`.
      Assert popup DOM does NOT contain any iframe pointing to ads_sandbox.
      TEST: Both assertions pass.

---

# PART 14 — FINAL INTEGRATION

- [ ] **14.01** Full Tier 1 flow — Playwright e2e:
      Capture visible → open editor → add text annotation → export as PNG →
      verify downloaded file dimensions match spec.
      TEST: File exists; dimensions correct; no network calls.

- [ ] **14.02** Full Tier 2 flow — Playwright e2e (Pro license mocked):
      Full-page capture → open editor → run DOM redaction → confirm annotations →
      export as JPEG target-size → verify file size within tolerance.
      TEST: Annotations applied; file size within ±10% of target.

- [ ] **14.03** Preset share flow — Playwright e2e:
      Export a preset from Options → re-import the same file → verify preset appears
      in list with correct name and spec values.
      TEST: Round-trip preserves all ExportSpec fields exactly.

- [ ] **14.04** HiDPI info banner flow — Playwright e2e:
      Load extension in DPR=2 viewport (Playwright `deviceScaleFactor: 2`).
      Open popup with `dpiPolicy: 'device'`.
      Assert `<HiDpiBanner>` is rendered.
      Export proceeds without normalization.
      Assert downloaded file is at device pixels (2× the CSS size).
      TEST: Banner visible; file dimensions 2× CSS dimensions.

- [ ] **14.05** Multi-capture board gate — Playwright e2e (free tier):
      Attempt to open board. Assert error state shown. Assert no captures processed.
      TEST: Error message contains "Pro" or "upgrade".

- [ ] **14.06** `npm run build:chrome` + `npm run build:firefox` both produce valid
      extension ZIPs with no extraneous files (no source maps in production,
      no `.ts` files, no `node_modules`).
      TEST: Check dist/ contents; assert expected files present; assert forbidden
            extensions absent.

---

# BACKLOG (do not add to checklist until a tier decision is made)
# Anything that occurs to you mid-build goes here, NOT inline above.
#
# - Safari extension support (v1.1)
# - Video / GIF capture (Tier 3)
# - Responsive multi-capture pack (part of Pro workflows — add to Part 10 when ready)
# - Diff/compare overlay slider (Pro workflow)
# - Pin capture floating overlay (Pro workflow)
# - Measure tool + color picker (Pro workflow)
# - Enterprise admin dashboard (out of scope)
# - Cloud sharing (out of scope)
