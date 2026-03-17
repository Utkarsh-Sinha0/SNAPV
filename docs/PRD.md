# PRD.md
# SnapVault — Deterministic Screenshot Exports
# Version: 3.0.0 | Last Updated: 2026-03-16
# Target: Chrome + Firefox + Edge (launch day); Safari (v1.1 candidate)

## 1) One-line pitch
**SnapVault guarantees your screenshot exports match a spec** — format, size, dimensions, DPI
policy — with warnings before you waste time. 100% offline. Zero cloud. Works on every major
browser from day one.

---

## 2) Vision & Moat (2026 updated)

### Moat pillars
1. **Export Specs + Feasibility Engine** — predictable, deterministic outputs. ExportSpec JSON
   presets are shareable locally (import/export with one click; no server). Users share bundles
   on GitHub/Discord; free viral growth.
2. **Offscreen-Document Capture Pipeline** — all heavy canvas/DOM/stitch work runs in a
   dedicated `offscreen.html` (see `OFFSCREEN_ARCHITECTURE.md`). 2–3× more stable than
   service-worker-only approaches; no workarounds for canvas limitations.
3. **Pro privacy tools (100% offline)** — Clean Capture, DOM element isolation, True 1× export
   (WebGPU-accelerated), and ML-based auto-redaction via bundled Transformers.js ONNX model.
   No cloud, no API key, works on a plane.
4. **Multi-monitor + HiDPI correctness from Tier 1** — devicePixelRatio-aware per-monitor.
   Feasibility engine warns on low-end CPU budget before a heavy export begins.

---

## 3) Target users
- **Developers / QA:** responsive screenshots, exact sizes, compare/diff, bug-report workflows.
- **Designers / PMs:** crisp retina-safe exports, clean captures without overlays, preset sharing.
- **Privacy-conscious professionals:** offline redaction, no surprise uploads, GDPR-proof cache.

---

## 4) Three-tier system

### Tier 1 — Free (with sponsor/ads, privacy-safe)
**Goal:** fastest, most reliable daily screenshot tool with deterministic exports across
Chrome, Firefox, and Edge on launch day.

#### Capture
- Visible viewport, region select, full-page (scroll+stitch via Offscreen Document).
- **Scrollable container capture (v1.1):** click-select a scrollable element and capture it.
- **HiDPI detection (Tier 1):** `devicePixelRatio` is captured at trigger time and stored
  in `CaptureMetadata` so the feasibility engine can produce accurate size estimates.
  However, DPI normalization and True 1× export are **Pro-only**. On a HiDPI screen (DPR > 1),
  Tier 1 shows a non-blocking warning banner: *"HiDPI screen detected — exports will be at
  device pixels. Upgrade to Pro for normalized 1× exports."* The export still proceeds at
  native device resolution; the warning is informational, not a blocker.
- **Light Mode capture:** user toggle in settings to disable stitch overlap-correction.
  Faster full-page on low-end devices (sub-8 GB RAM Chromebooks). Clearly labeled;
  recommended automatically when feasibility engine detects high CPU-second estimate.

#### Export
- Formats: PNG, JPG/JPEG, PDF.
- **Export Spec presets:** 1080p, A4, social, device breakpoints + manual dimensions.
- **Feasibility engine (blocking + warnings):**
  - Blocks: upscale too high, estimated file too large, PDF page-crop risk.
  - Warns: estimated CPU seconds exceeds threshold for current device class; light-mode suggestion.
  - Info banner (non-blocking): HiDPI screen detected (DPR > 1) — prompts Pro upgrade for
    normalized exports. Export still proceeds at native device pixels in Tier 1.
- **JPEG target-size mode:** iterative quality search. Uses WebGPU encode loop where
  `gpu.requestAdapter()` resolves (Chrome 2026); falls back to CPU encode unconditionally.
- **Preset community:** ExportSpec JSON import/export. One-click share; no server involved.

#### Annotations & UX
- Basic annotate: arrow, text, highlight, blur (manual).
- Instant Action Bar: Copy / Download / Open Editor / Re-capture.
- Export Receipt: "Saved to …" + quick actions.

#### Captures cache
- "Store recent captures locally" toggle — default **OFF**.
- When enabled: auto-expires after **7 days** (configurable 1–30 days in settings).
- **"Nuke everything" button:** deletes all cached captures from `chrome.storage.local`,
  clears offscreen document memory (sends `OFFSCREEN_CLEAR_MEMORY` message before
  closing document), and resets editor state. One action; instant; GDPR-proof.

#### Monetization (Tier 1)
- Carbon Ads shown ONLY in Options/Editor via sandbox iframe — never in popup.
- **Alternative (recommended for indie launch):** local `sponsor.json` rendered as a static
  "Sponsor" card — no external script, no SDK, no RPM dependency. Swap to Carbon when
  installs justify it.

---

### Tier 2 — Pro Extension (ad-free, moat features)
**Goal:** indispensable professional tool; premium value obvious in one click.

#### Moat features (must-have)
1. **Clean Capture (Auto):** hide cookie banners, chat widgets, sticky overlays before
   capture. User toggles + custom CSS selectors. State restored after capture.
2. **True 1× Export / HiDPI normalization (Pro-only):** CSS-pixel-consistent exports across
   all devices and monitors. Normalizes `devicePixelRatio` so a HiDPI capture exports at
   the correct logical size, not the inflated physical-pixel size. WebGPU-accelerated
   encode/resize where available; CPU fallback guaranteed. Tier 1 users on HiDPI screens
   see a non-blocking upgrade prompt; this feature resolves it.
3. **DOM Element Isolation:**
   - Click an element → capture it cleanly.
   - **Background handling — Hybrid (user button):** default transparent. Toolbar shows
     three-way toggle: **"Transparent"** / **"Remove shadow"** (one canvas filter, auto) /
     **"Solid fill"** (color picker). No hidden magic; user decides per capture.
4. **Offline Auto-Redaction (local ML + DOM text):**
   - V1.0: DOM-text detection — emails, phones, tokens, CC numbers (Luhn), API keys via
     regex patterns — displayed as local blur annotations for manual review.
   - **V1.1 (Pro launch feature):** Transformers.js ONNX model bundled with extension.
     Detects faces, logos, layout-aware sensitive text blocks, ~95% accuracy, 100% offline.
     Model is lazy-loaded on first use (WASM/ONNX, bundled locally with the extension).
     Product decision: keep the model bundled in v1.0 for a simple offline/privacy story;
     evaluate optional post-install delivery in v1.1 only if startup/install data proves the
     bundled payload is materially hurting activation on low-end devices.
     See `ML_REDACTION.md` for full spec.
   - Detections are ephemeral: never persisted, never sent anywhere.

#### Pro workflows
- Responsive multi-capture pack (mobile / tablet / desktop set in one click).
- **Multi-capture board (Pro-only):** combine 3+ separate shots into a single export image.
  Drag-and-drop layout, optional labels, exported as one PNG/JPEG/PDF.
- Diff/Compare overlay slider.
- Pin capture (floating in-browser overlay).
- Measure tool + color picker.
- Export preset library + naming templates.
- **Preset community:** export/import ExportSpec bundles as JSON, shareable on
  GitHub/Discord. No server. Turns power users into evangelists.

---

### Tier 3 — Native App (macOS, later — out of scope now)
System-wide capture, video/GIF, faster native redaction, deep integrations.

---

## 5) Non-functional requirements (v3)
| Metric | Target |
|--------|--------|
| Popup open | < 150 ms median |
| Visible capture → export | < 1 s median (typical pages) |
| Full-page capture | Correctness > speed; clear progress UX mandatory |
| Idle memory (extension) | < 20 MB |
| Offscreen doc memory | Cleared on nuke; auto-released after 30 s idle |
| ML model load (first use) | < 3 s on typical machine; progress indicator required |
| No background capture | Enforced — captures only on explicit user gesture |
| No URL / content collection | Enforced by INVARIANTS |

---

## 6) Browser support (launch day)
| Browser | Build | Store |
|---------|-------|-------|
| Chrome 120+ | WXT chrome build | Chrome Web Store |
| Firefox 115+ (MV2 compat) | WXT firefox build | Firefox AMO |
| Edge 120+ | WXT chrome build (repackaged) | Edge Add-ons |
| Safari | Deferred to v1.1 | — |

WXT cross-browser config is two lines in `wxt.config.ts`. No feature-contract changes needed.
Browser-specific differences isolated in `src/shared/browser.ts` adapter.

---

## 7) Success metrics

**First 90 days**
- 5,000+ installs (Chrome + Firefox + Edge combined).
- Rating 4.6+ Chrome; 4.5+ Firefox AMO.
- Free → Pro conversion 1.5–3%.
- Editor opens / day / active user ≥ 1.2.
- Crash-free sessions ≥ 99.5%.

**First year**
- 50k+ installs.
- 1k+ Pro users.
- Monthly churn < 3% (subscription).
- Preset JSON shared organically on GitHub/Discord (measure via referral traffic, zero cost).

---

## 8) Scope boundaries

**IN SCOPE (Tier 1 + 2, all browsers)**
- Offscreen Document architecture (all capture/stitch/redaction).
- HiDPI detection + info banner in Tier 1 (`devicePixelRatio` in CaptureMetadata).
- True 1× export / HiDPI normalization gated behind Pro (Tier 2).
- Multi-capture board gated behind Pro (Tier 2).
- Light Mode toggle (Tier 1).
- 7-day cache expiry + nuke button (Tier 1).
- Preset JSON community sharing (Tier 1 + 2).
- Hybrid background removal button (Tier 2 element isolation).
- Transformers.js ONNX redaction model (Tier 2 Pro).
- WebGPU encode loop with CPU fallback (Tier 2 True 1×).
- Chrome + Firefox + Edge parity (launch day).

**OUT OF SCOPE (now)**
- Tier 3 native app.
- Cloud sharing / storage.
- Enterprise admin dashboard.
- Safari extension (v1.1 candidate).
- Video / GIF capture.
