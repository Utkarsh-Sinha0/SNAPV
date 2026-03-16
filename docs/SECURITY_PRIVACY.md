# SECURITY_PRIVACY.md
# SnapVault — Privacy-Centric Security Model
# Version: 3.0.0 | Last Updated: 2026-03-16

---

## 1) Threat model (screenshot extensions are high-trust)

### Primary threats
- Hidden / automatic screenshot capture (without user intent).
- Screenshot data exfiltration via network, postMessage, or clipboard.
- Over-broad permissions exposing unintended capabilities.
- Third-party code (ads / scripts) accessing screenshot pixels.
- Supply-chain dependency attacks (especially relevant for ML model loading).
- Offscreen document misuse (data leaking from heavy-processing context).
- ML model inadvertently fetching from a remote CDN (violates LAW-01 + LAW-02).
- Stale local captures exposing sensitive data beyond user expectation.

---

## 2) Data handling rules

| Data | Handling |
|------|---------|
| Screenshot pixels | In-memory only during capture → offscreen pipeline → export. Never written to disk by the extension (only by user-triggered download). |
| Capture cache | Optional; OFF by default. Auto-expires in ≤ 7 days. "Nuke everything" deletes all instantly. |
| Offscreen document memory | Released on idle timeout (30 s) or explicit `OFFSCREEN_CLEAR_MEMORY`. |
| ML redaction detections | Ephemeral — stored only in offscreen memory; never in `chrome.storage`, never transmitted. |
| Export Spec presets | Stored in `chrome.storage.local`. User-owned. Exportable as local JSON. |
| Licensing metadata | `licenseStatus`, `plan`, `expiresAt`, `installationId` — no content. |
| URLs / page content | Never collected by default. |
| Analytics | OFF by default; opt-in; anonymous event names + install ID only. |

---

## 3) Allowed network calls (v3)

| Call | What is sent | When |
|------|-------------|------|
| Carbon Ads (sandbox iframe only) | Ad request from sandbox — no pixels, no extension state | Free tier, Options/Editor open |
| `sponsor.json` static card | No network call — file is bundled | Free tier alternative |
| Stripe checkout / webhook / sync | `installationId`, plan, payment status | User-triggered license flow |
| Optional analytics | Event name + `installationId` | Opt-in only, anonymous |

All calls are wrapped by `assertNoPixelPayload`. No exceptions.

---

## 4) Permissions (minimum viable, v3)

**Required:**
- `activeTab` — capture current tab on user action.
- `storage` — preferences, presets, license metadata.
- `downloads` — local save flow.
- `clipboardWrite` — copy to clipboard (gated behind user action).
- `scripting` — on-demand content script injection for overlays.
- `offscreen` — Chrome/Edge only; create offscreen document for canvas/WASM work.

**Avoid (never add without documented justification):**
- `<all_urls>` — test-only via `SNAPVAULT_E2E=1` build flag.
- `webRequest` / `webRequestBlocking`.
- `history`, `cookies`, `tabs` (broad).

---

## 5) CSP and sandbox rules

### Extension pages (popup / options / editor / offscreen)
- MV3 enforced policy: `script-src 'self'`.
- No inline scripts. No remote scripts. All JS bundled.
- `offscreen.html` follows same CSP — WASM loaded from `chrome.runtime.getURL(...)`.

### Ads sandbox (`ads_sandbox.html`)
- Listed in `manifest.sandbox.pages`.
- Runs without extension APIs — isolated by browser.
- Runs its own CSP; can load Carbon script.
- No `postMessage` bridge that passes pixels or capture data into the sandbox.
- **Alternative:** `sponsor.json` static card in `ads_sandbox.html` with no external scripts.

---

## 6) Offscreen document security

The offscreen document is the most security-sensitive surface because it processes raw
pixel data. Rules:

- `assertNoPixelPayload` called before any `fetch` inside `offscreen.ts`.
- Image data received via message is processed and immediately released (set to `null`).
- No `IndexedDB` or `localStorage` writes inside offscreen document.
- Offscreen document is not a persistent background — it is created per-operation and
  closed after idle. This minimizes the window during which pixel data is in memory.
- ML inference (`runMlRedaction`) receives a dataURL, processes it, returns annotations
  (bounding boxes only — no pixel data), then releases the image reference.

---

## 7) ML model security (Transformers.js ONNX)

| Risk | Mitigation |
|------|-----------|
| Model fetches from CDN | `env.allowRemoteModels = false` — mandatory config; CI-tested |
| Model is tampered in supply chain | Pin exact npm version of `@xenova/transformers`; review in security audit |
| Model outputs sensitive data exfiltration | Model outputs are `RedactAnnotation[]` (rects + labels) — no pixel content, no text reconstruction |
| WASM escape / sandbox break | WASM runs inside Chrome's existing renderer sandbox; no additional risk beyond web standard |

---

## 8) Pro feature safety

| Feature | Safety requirement |
|---------|--------------------|
| Clean Capture | CSS injection must be reversible; page state restored after capture |
| Element isolation | DOM/text not leaked externally; transparent bg computed locally in offscreen |
| Auto-redaction (DOM) | Detections in memory only; never persist detected strings |
| Auto-redaction (ML) | Model local only; detections ephemeral; user must confirm before applying to export |
| Hybrid background button | Canvas filter applied in offscreen doc; result returned as pixel blob — subject to LAW-01 |

---

## 9) User controls

| Control | Location | Default |
|---------|----------|---------|
| "Store recent captures locally" toggle | Options → Privacy | OFF |
| Capture expiry (1–30 days) | Options → Privacy | 7 days |
| "Nuke everything" button | Options → Privacy | — |
| "Enable ML redaction" toggle | Options → Pro / Editor | OFF (lazy-load on first use) |
| Analytics opt-in | Options → Privacy | OFF |

---

## 10) Pre-release security checklist

- [ ] No pixel buffers ever reach `fetch` / `XHR` / `WebSocket` (static `assertNoPixelPayload` audit + runtime test).
- [ ] Ads run only in sandbox page (`ads_sandbox.html`).
- [ ] Capture requires explicit user gesture.
- [ ] Minimal permissions — no extras in manifest.
- [ ] No remote scripts in extension pages (popup / options / editor / offscreen).
- [ ] `env.allowRemoteModels = false` in Transformers.js config — CI-verified.
- [ ] No network calls during ML inference (Playwright network intercept test).
- [ ] Offscreen document closes after idle timeout — verified in integration test.
- [ ] "Nuke everything" clears all storage + offscreen memory — verified in integration test.
- [ ] Capture expiry purge runs at SW startup — verified in unit test.
- [ ] `SNAPVAULT_E2E=1` flag does not affect production manifest permissions.
- [ ] Firefox build has no `offscreen` permission in manifest (not supported, not needed).
