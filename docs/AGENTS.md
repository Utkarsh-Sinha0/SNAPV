# AGENTS.md
# SnapVault — Living Project Brain
# Version: 3.0.0 | Last Updated: 2026-03-16

---

## Product Identity
**SnapVault** is a privacy-first screenshot extension whose moat is **deterministic exports**:
users define an **Export Spec** (format, dimensions, DPI policy, size target), and the export
matches the spec with feasibility warnings. Presets are shareable as local JSON — no server.

---

## Stack (current, pinned)
- **Build:** WXT 0.20.19 (March 2026 — better HMR, cross-browser publishing)
- **UI:** Preact 10.x
- **Language:** TypeScript strict 5.x
- **Canvas pipeline:** runs inside `offscreen.html` (Offscreen Document — MV3 mandatory)
- **Local ML:** Transformers.js 3.x, WASM/ONNX backend, model bundled locally
- **PDF:** pdf-lib (lighter than jsPDF)
- **Tests:** Vitest (unit) + Playwright (e2e)
- **Target browsers:** Chrome 120+ / Firefox 115+ / Edge 120+ (launch day)

---

## Tier Strategy
- **Tier 1 (Free):** core capture + Export Specs + feasibility engine + HiDPI + light mode.
  Monetized with Carbon Ads (sandbox iframe on non-popup pages) OR local `sponsor.json` card.
- **Tier 2 (Pro):** ad-free + moat features (Clean Capture, True 1× export, DOM element
  isolation with hybrid background toggle, local ML auto-redaction via Transformers.js ONNX).
- **Tier 3 (Native App):** macOS app later — out of scope now.

---

## Constraints / Non-negotiables
- Pixels never leave the device. (`assertNoPixelPayload` guards all network calls.)
- Remote scripts never execute in extension pages (MV3 CSP: `script-src 'self'`).
- Ads must be sandbox-isolated and never receive screenshot data.
- All canvas / WASM / heavy DOM work routes through `offscreen.html` (Chrome/Edge) or
  background page (Firefox) — never directly in the service worker.
- ML model weights (`src/assets/ml/`) are bundled locally; `env.allowRemoteModels = false`.
- **Cross-browser from launch day:** Chrome + Firefox + Edge via WXT cross-browser build.
  Two-line config in `wxt.config.ts`; no feature-contract changes required.
- Recent captures auto-expire after 7 days (default). "Nuke everything" clears captures
  AND offscreen document memory in one action.
- ExportSpec JSON schema is public (local, bundled); users share preset files freely.

---

## Lessons Learned (append-only)

✅ [SUCCESSFUL PATTERN — Keep all Export Spec math in shared modules (`src/shared/*`) and
   use the same contracts in popup/options/editor/background to avoid drift.]

✅ [SUCCESSFUL PATTERN — Stage edited images via background capture cache
   (`STORE_CAPTURE_DATA_URL`) so export/download/clipboard all use the same deterministic
   pipeline.]

📌 [NEW RULE — Guard all network payloads with `assertNoPixelPayload` for licensing,
   analytics, and any future network calls.]

✅ [SUCCESSFUL PATTERN — Capture metadata (`cssWidth/cssHeight/devicePixelRatio/screenLeft`)
   enables stable True 1× export normalization and multi-monitor HiDPI without browser forks.]

✅ [SUCCESSFUL PATTERN — Keep complex pro workflows editor-driven and route heavy operations
   through background messages → offscreen document.]

✅ [SUCCESSFUL PATTERN — Enforce Pro-only features in background runtime handlers and mirror
   gating in popup/editor UI to avoid policy drift.]

✅ [SUCCESSFUL PATTERN — Keep DPI normalization in `src/shared/dpi.ts` with unit coverage
   to prevent export behavior regressions across DPR values.]

✅ [SUCCESSFUL PATTERN — Treat all golden test pages as Chromium e2e checks to catch
   capture/stitch regressions early.]

✅ [SUCCESSFUL PATTERN — Store Clean Capture custom selectors in local settings and compile
   them into sanitized CSS in content script for reversible overlay suppression.]

✅ [SUCCESSFUL PATTERN — Convert DOM redaction detections into local blur annotations in the
   editor so users get immediate manual-reviewable masking without network calls.]

✅ [SUCCESSFUL PATTERN — Keep page-level and extension-runtime harness e2e suites separate
   (`playwright.config.ts` vs `playwright.extension.config.ts`).]

📌 [NEW RULE — Use test-only build flag (`SNAPVAULT_E2E=1`) to grant temporary `<all_urls>`
   for runtime harness tests while keeping production manifests minimal.]

✅ [SUCCESSFUL PATTERN — Enforce PRD performance budgets via automated Playwright checks
   (`perf-budget.spec.ts`) and fail CI on regression.]

✅ [SUCCESSFUL PATTERN — Keep post-capture UX action-bar-first; open editor only on explicit
   action; fallback to editor if content messaging is unavailable.]

✅ [SUCCESSFUL PATTERN — Store live-page link annotations in volatile background memory
   sidecar; inject PDF links only on opt-in export.]

✅ [SUCCESSFUL PATTERN — Bind licenses to `installationId` and support both webhook-driven
   and client-poll (`SYNC_LICENSE`) activation for resilience across browser restarts.]

📌 [NEW RULE — All canvas / WASM / heavy DOM work MUST route through `offscreen.html`
   (Chrome/Edge) or background page (Firefox). Service worker canvas calls fail silently in
   MV3 — do not attempt them. See `OFFSCREEN_ARCHITECTURE.md`.]

📌 [NEW RULE — `env.allowRemoteModels = false` in Transformers.js config is REQUIRED and
   must be tested in CI. An accidental CDN fetch during redaction would violate LAW-01.]

📌 [NEW RULE — Capture `devicePixelRatio` at trigger time and store in `CaptureMetadata`
   for ALL tiers (needed by the feasibility engine). DPI normalization (True 1× / css1x
   export policy) is PRO-ONLY. Tier 1 shows a non-blocking HiDPI info banner and exports
   at native device pixels. Never silently normalize DPR in Tier 1.]

📌 [NEW RULE — Multi-capture board (combine 3+ shots into one export) is PRO-ONLY. Do not
   expose multi-capture board UI or messages to free-tier users. Gate at the background
   message handler level and mirror the gate in the editor UI.]

📌 [NEW RULE — Light mode flag (`lightMode: true` in CaptureMetadata) disables stitch
   overlap correction. Feasibility engine MUST suggest it when `estimatedCpuSeconds > 5`.
   Never silently enable or disable it — always follow explicit user setting.]

📌 [NEW RULE — "Nuke everything" must send `OFFSCREEN_CLEAR_MEMORY` BEFORE deleting
   `chrome.storage.local` captures. If offscreen doc is closed first, in-flight operations
   may attempt to write to already-deleted cache entries.]

✅ [SUCCESSFUL PATTERN — ExportSpec JSON schema is the shareable unit of value. Keep it
   stable and versioned (`snapvault_preset: "1.0"`). Breaking changes require a migration
   shim in the import validator.]

📌 [NEW RULE — WXT cross-browser target (`TARGET_BROWSER`) must be set in all build and
   CI commands. Default to `chrome` if unset. Firefox uses MV2 manifest; Chrome/Edge use
   MV3. Same source code; WXT handles manifest delta.]

---

## Known issues / watch areas
- `chrome.offscreen` not available in Firefox — `offscreen-adapter.ts` bridges this.
  Verify bridge in Firefox CI on every PR that touches offscreen or capture pipeline.
- Transformers.js WASM startup is slow on first load (< 3 s target). If regressed, profile
  in offscreen context and consider splitting the model into two smaller ONNX shards.
- WebGPU encode loop: `gpu.requestAdapter()` returns `null` on some Linux/VM configs.
  CPU fallback MUST be tested in CI (run with `--disable-gpu` Chromium flag).
- Carbon Ads RPM has been flat in 2025–2026 for dev-audience extensions. Consider replacing
  with `sponsor.json` static card if RPM < $0.50 for 30 days post-launch.
