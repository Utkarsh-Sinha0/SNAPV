# DEPLOYMENT.md
# SnapVault — Store Launch + Positioning
# Version: 3.1.0 | Last Updated: 2026-03-17

---

## 1) Positioning

**Headline:** Deterministic screenshot exports. Works everywhere. Stays private.

You win on three axes that no major competitor covers simultaneously:
1. **Predictability** — exact dimensions, correct DPI, size targets, feasibility warnings.
2. **Privacy** — screenshots never leave the device; ML redaction runs 100% locally.
3. **Portability** — same experience on Chrome, Firefox, and Edge from day one.

Demo hook: *"Never resize or re-crop again."*
Viral hook: *"Share your export preset as a JSON file — no account, no server."*

---

## 2) Browser store listings

### Chrome Web Store
**Title:** SnapVault — Deterministic Screenshot Export (PNG/JPG/PDF)

**Short description:**
Pixel-perfect exports with presets, DPI normalization, and feasibility warnings.
Privacy-first. No cloud. Runs on Chrome, Firefox, and Edge.

**Screenshots (in order):**
1. Export Spec picker + feasibility warning banner (Tier 1 core UX).
2. True 1× export comparison — HiDPI before/after (Pro).
3. Clean Capture in action — overlay-free before/after (Pro).
4. DOM Element Isolation with background toggle buttons (Pro).
5. ML Auto-Redaction review panel — blur overlays before confirm (Pro).
6. Preset import/export JSON panel (Tier 1 + 2, viral feature).

### Firefox AMO
Same listing, adapted for AMO character limits.
- Emphasize Firefox-native privacy stance: "No cloud. Works offline."
- Tag: `privacy`, `screenshots`, `productivity`, `developer-tools`.
- AMO submission uses WXT `npm run build:firefox` artifact.

### Edge Add-ons
- Uses the same Chrome build artifact (Chromium base).
- Submit via Microsoft Partner Center.
- No extra review code needed; WXT handles the packaging.

---

## 3) WXT cross-browser build commands

```bash
# Chrome (MV3)
npm run build:chrome          # TARGET_BROWSER=chrome

# Firefox (MV2 compatible)
npm run build:firefox         # TARGET_BROWSER=firefox

# Edge (Chromium, MV3 — same as Chrome artifact)
npm run build:edge            # TARGET_BROWSER=edge

# All three in CI
npm run build:all
```

WXT 0.20.19 handles:
- Manifest v2 / v3 switching.
- `browser.*` vs `chrome.*` API normalization.
- Cross-browser HMR during development.

`offscreen-adapter.ts` routes heavy work to offscreen doc (Chrome/Edge) or background
page (Firefox). Zero feature delta for the user.

---

## 4) Pre-launch checklist

**Backend (must be live before Chrome Web Store launch):**
- [ ] Deploy `services/licensing/server.mjs` behind HTTPS.
- [ ] Configure Stripe webhook endpoint + secret.
- [ ] Test full checkout → webhook → license sync flow end-to-end.
- [ ] `POST /v1/licensing/checkout` returns valid Stripe Checkout URL.

**Extension (release-ready as of 2026-03-17):**
- [x] `npm run build:chrome` passes with zero TypeScript errors.
- [x] `npm run build:edge` passes with zero TypeScript errors.
- [x] `npm run build:firefox` passes with zero TypeScript errors.
- [x] `npm run test:perf:extension:chromium` passes.
- [x] `npm run test:perf:extension:edge` passes.
- [x] Playwright extension e2e passes on Chromium and Edge.
- [x] Firefox package validation (`npm run test:firefox:package`) passes.
- [x] `assertNoPixelPayload` static audit clean.
- [x] ML payload under `public/assets/ml/` is bundled; no CDN call in test.
- [x] Offscreen idle-close test passes.
- [x] "Nuke everything" test passes (storage + offscreen cleared).
- [x] Light mode stitch test passes (no overlap correction, correct output).
- [x] Multi-monitor DPR test: DPR=2 capture produces correct CSS-pixel output.
- [x] Preset import/export round-trip test passes.

**Store listing:**
- [ ] All 6 screenshots prepared.
- [ ] Privacy policy published (matches SECURITY_PRIVACY.md exactly).
- [ ] Store listing copy reviewed for accuracy.

---

## 5) Launch sequence

1. **Soft launch — Chrome Web Store** (private listing → share link to beta testers)
   - Fix top 5 issues from beta feedback.
   - Verify crash-free sessions ≥ 99.5%.

2. **Public launch — Chrome** → **simultaneous Firefox AMO + Edge Add-ons submission**
   - WXT cross-browser artifacts ready from the same build run.
   - Post on: r/webdev, r/QA, r/firefox, ProductHunt, HN "Show HN".
   - Demo GIF: shows "spec → feasibility warning → perfect export" in 15 seconds.
   - Preset JSON sharing post: "Here are 10 SnapVault presets for designers/devs."

3. **Week 2+:** Respond to reviews, ship patch releases, track conversion.

4. **Month 2:** Evaluate sponsor slot — switch Carbon ↔ `sponsor.json` based on RPM data.

---

## 6) Community & growth

- Primary channels: Reddit r/webdev, r/QA, r/firefox, Designer News, ProductHunt.
- Unique angle per channel:
  - r/webdev: "deterministic exports for bug reports / responsive testing"
  - r/QA: "exact-spec screenshots that match your test assertions"
  - r/firefox: "privacy-first, full Firefox support day one"
  - ProductHunt: "the screenshot tool that warns you before you waste time"
- Preset JSON community: seed with 5–10 presets on GitHub before launch day.
  Link from Options page preset importer.
Firefox submission readiness is gated by `npm run test:firefox:package`, not a manual `web-ext lint` invocation. That command verifies the packaged archive and checks the accepted Mozilla lint baseline described in [FIREFOX_LINT_BASELINE.md](/E:/SNAPV/docs/FIREFOX_LINT_BASELINE.md).
