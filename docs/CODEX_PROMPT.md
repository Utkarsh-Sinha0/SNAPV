# CODEX_PROMPT.md
# SnapVault — Autonomous Build Prompt
# Version: 3.0.0 | Last Updated: 2026-03-16

You are building **SnapVault**: a privacy-first screenshot extension whose moat is
**deterministic exports via Export Specs + Feasibility Engine**, plus Pro-grade privacy
and pixel tools including local ML redaction.

---

## 0) NON-NEGOTIABLES (read these first, follow them always)

1. Screenshot pixels **never leave the device**.
   `assertNoPixelPayload(payload)` wraps every `fetch`/`XHR`/`WebSocket.send`.

2. **No remote scripts** in extension pages. MV3 CSP = `script-src 'self'`.
   WASM and ML model weights are bundled locally; no CDN fetch ever.

3. **All canvas / WASM / heavy DOM work runs in `offscreen.html`** (Chrome/Edge) or
   background page (Firefox) — never in the service worker.
   See `docs/OFFSCREEN_ARCHITECTURE.md`.

4. **Captures only on explicit user action.** No stealth, no background, no auto-capture.

5. **Cross-browser from launch day:** Chrome + Firefox + Edge via WXT cross-browser build.
   `offscreen-adapter.ts` handles the Chrome/Firefox routing difference transparently.

6. ML model (`src/assets/ml/redaction.onnx`) is local-only.
   `env.allowRemoteModels = false` is mandatory and CI-tested.

7. Ads (Carbon or `sponsor.json` card) are allowed **only** via sandboxed iframe in
   Options/Editor (never popup). Sandbox page has no access to extension APIs or pixels.

8. If any task conflicts with `docs/INVARIANTS.md`, the task must change — not the invariants.

---

## 1) READ THESE DOCS FIRST (in order)

1. `docs/INVARIANTS.md`
2. `docs/PRD.md`
3. `docs/SECURITY_PRIVACY.md`
4. `docs/TECHNICAL_ARCHITECTURE.md`
5. `docs/OFFSCREEN_ARCHITECTURE.md`
6. `docs/ML_REDACTION.md`
7. `docs/API_SPECIFICATIONS.md`
8. `docs/MONETIZATION_STRATEGY.md`
9. `docs/TESTING_QA.md`
10. `docs/DEPLOYMENT.md`
11. `docs/AGENTS.md`

---

## 2) STACK (pinned)

| Concern | Choice | Version |
|---------|--------|---------|
| Build | WXT | 0.20.19 |
| UI | Preact | 10.x |
| Language | TypeScript strict | 5.x |
| Canvas pipeline | Canvas API in offscreen.html | Web standard |
| PDF | pdf-lib | pinned |
| Local ML | Transformers.js (ONNX/WASM) | 3.x |
| Unit tests | Vitest | pinned |
| E2E | Playwright | pinned |

Avoid heavy dependencies. Prefer stdlib. Pin all versions.

---

## 3) REPO LAYOUT

```
src/
  popup/           options/         editor/
  background/      offscreen/       content/
  ads_sandbox/
  shared/          (pure TS — types, feasibility, dpi, stitch, encode, pdf, redact,
                   browser adapter, offscreen-adapter, assertNoPixelPayload)
  assets/ml/       (ONNX model weights — local, bundled)
tests/             e2e/             test_pages/
services/licensing/
docs/
```

---

## 4) PERMISSIONS

```json
{
  "permissions": ["activeTab", "storage", "downloads", "clipboardWrite",
                  "scripting", "offscreen"],
  "sandbox": { "pages": ["ads_sandbox.html"] }
}
```

Firefox manifest: omit `offscreen` (not supported; handled by background page via
`offscreen-adapter.ts`).

Test-only: `<all_urls>` gated behind `SNAPVAULT_E2E=1` — never in production manifest.

---

## 5) REQUIRED FEATURES (Tier 1 + Tier 2)

### Tier 1 (Free)
- Capture: visible, region, full-page (scroll+stitch via offscreen), scrollable container.
- **HiDPI detection:** `devicePixelRatio` recorded in `CaptureMetadata` for feasibility
  engine accuracy. When DPR > 1 is detected, show a non-blocking info banner prompting
  Pro upgrade. Tier 1 exports at native device pixels — no normalization.
- Light mode: user toggle to disable stitch overlap correction (fast on low-end devices).
- Export Specs: presets + manual; PNG/JPEG/PDF; DPI policy; feasibility engine.
- Feasibility engine: blocking reasons + warnings; DPR-aware byte estimates; CPU-seconds
  estimate; light-mode suggestion; HiDPI info banner (non-blocking, Tier 1 only).
- JPEG target-size loop (WebGPU if available; CPU fallback always present).
- Preset community: ExportSpec JSON import/export (local, no server).
- Captures cache: 7-day auto-expiry + "Nuke everything" (clears storage + offscreen memory).
- Basic annotations, action bar, export receipt.
- Sponsor slot (Carbon or `sponsor.json`) in Options/Editor only via sandbox iframe.

### Tier 2 (Pro)
**Must-have moat:**
1. Clean Capture (hide banners/overlays before capture; CSS reversible).
2. **True 1× export / HiDPI normalization (Pro-only):** applies `css1x` DPR normalization
   so exports match logical CSS pixels regardless of screen density. WebGPU encode loop;
   CPU fallback. Resolves the Tier 1 HiDPI info banner.
3. DOM Element Isolation:
   - Captures selected element cleanly.
   - Background toggle button in toolbar: Transparent / Remove shadow (auto filter) / Solid fill.
4. Offline Auto-Redaction:
   - V1.0: DOM-text detection (email, phone, CC/Luhn, API key, SSN) + manual review UI.
   - V1.1: Transformers.js ONNX model (bundled) for faces, logos, layout-aware text.
   - User confirms all annotations before export applies blur. Never auto-applied.

**Pro workflows:** responsive multi-capture pack, **multi-capture board (3+ shots →
one export — Pro-only)**, diff/compare slider, pin capture, measure + color picker,
preset library + naming templates.

---

## 6) BUILD PHASES (TDD — write failing test first, then implement)

| Phase | Goal |
|-------|------|
| 1 Scaffold | WXT project, all entrypoints, manifest, offscreen.html registered |
| 2 Offscreen infra | offscreen-adapter, message protocol, lifecycle (create/close/nuke) |
| 3 Export Spec + Feasibility | Types, shared modules, feasibility engine with all checks |
| 4 Capture modes | Visible, region, full-page stitch (light + normal), container; golden pages |
| 5 Editor + export pipeline | Canvas annotation, encode, PDF, JPEG target-size loop |
| 6 Pro moats | Clean Capture, True 1×, Element Isolation (bg toggle), Auto-Redaction (DOM + ML) |
| 7 Preset community | ExportSpec JSON import/export + schema validation |
| 8 Ads sandbox + licensing | sponsor.json/Carbon iframe, Stripe backend, license gating |
| 9 Cross-browser polish | Firefox build, offscreen-adapter Firefox path, AMO submission |
| 10 Performance + security audit | Perf budgets, pixel payload static audit, ML network test |

---

## 7) PERFORMANCE BUDGETS

| Metric | Budget |
|--------|--------|
| Popup open | < 150 ms |
| Visible capture → export | < 1 s |
| ML model first-load | < 3 s |
| "Nuke everything" | < 500 ms |
| Idle extension memory | < 20 MB |

---

## 8) DONE CHECKLIST

- [ ] All Vitest tests pass.
- [ ] All Playwright e2e tests pass (Chromium + Firefox).
- [ ] `npm run build:chrome` passes, zero TS errors.
- [ ] `npm run build:firefox` passes, zero TS errors.
- [ ] No pixel data over network (static audit + runtime Playwright intercept).
- [ ] `env.allowRemoteModels = false` verified in CI.
- [ ] Ads/sponsor only in sandbox iframe.
- [ ] Offscreen doc lifecycle tests pass.
- [ ] "Nuke everything" clears storage + offscreen.
- [ ] Light mode stitch test passes.
- [ ] HiDPI info banner shown in Tier 1 on DPR > 1 screen; export proceeds without normalization.
- [ ] True 1× export (DPR normalization) gated behind Pro license — rejected for free tier.
- [ ] Preset JSON import/export round-trip test passes.
- [ ] Tier 1 + Tier 2 features work on Chrome, Firefox, and Edge.
- [ ] Privacy policy in store listing matches `SECURITY_PRIVACY.md`.

---

## 9) AGENT BEHAVIOR RULES

**Before generating any code:**
- Re-read `INVARIANTS.md`. If the task conflicts with any law → stop and explain the conflict.
- Do not generate placeholder code (`// TODO`, `// implement here`, `...`).
- Write the failing test before the implementation.
- Do not modify a file without reading its current state first.

**After each phase:**
- Append a concise lesson to `docs/AGENTS.md → Lessons Learned`.
- Surface any new constraint to the human before proceeding to the next phase.

**On ambiguity:**
- Prefer the simpler interpretation. Ask once if genuinely blocked.
- Do not invent requirements. Docs are the source of truth.

**Context hygiene:**
- Load only the domain-relevant docs for the current phase.
- Do not re-read all docs on every step — that wastes context.
- When context feels stale, re-read `AGENTS.md` first.
