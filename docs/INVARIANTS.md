# INVARIANTS.md
# SnapVault — Immutable Product Laws
# Version: 3.0.0 | Last Updated: 2026-03-16

These rules **cannot** be overridden by later tasks, features, or architectural changes.
If any requirement conflicts with these laws, the requirement must change — not these.

---

## LAW-01: Screenshot pixels never leave the device

No screenshot pixel data (ImageData / canvas / Blob / ArrayBuffer / dataURL / objectURL
derived from a capture) may be transmitted to any network destination.

Allowed network activity is strictly limited to:
- **Ads (free tier only)** inside an **isolated sandbox iframe** — no access to extension
  APIs; no access to screenshot pixels.
- **Payments / licensing** metadata only (install ID, plan, payment status — no page
  content, no screenshot pixels).
- **Optional analytics** (OFF by default; anonymous; no URLs; no page content).

Implementation mandate: `assertNoPixelPayload(payload)` MUST be called before every
`fetch`, `XMLHttpRequest`, or `WebSocket.send` in the codebase — including inside the
offscreen document and any future background workers.

---

## LAW-02: No remotely hosted executable code in extension pages (MV3)

- No `<script src="https://...">` in extension pages (popup / options / editor / offscreen).
- No `eval()`, `new Function()`, string-based `setTimeout`/`setInterval`.
- All JS and WASM must be bundled with the extension.
- **ML model weights** (`public/assets/ml/`) must be served from
    `chrome.runtime.getURL(...)` — never fetched from a CDN.
- `env.allowRemoteModels = false` (Transformers.js) is a required config invariant.
  A CI test must assert this is set and that no network call occurs during inference.

Exception: sandboxed pages (`ads_sandbox.html`) may load their own scripts and run under
their own CSP — they are isolated from extension APIs by design.

---

## LAW-03: Minimal permissions

- Start with the smallest permission set possible.
- Prefer `activeTab` over broad host permissions.
- Avoid `webRequest` / `webRequestBlocking`, `history`, `cookies`.
- `offscreen` permission (Chrome) required for the offscreen document — add it.
- Test-only: `<all_urls>` gated behind `SNAPVAULT_E2E=1` build flag; never in production.

---

## LAW-04: Explicit user intent

- Captures happen **only** on explicit user action (click / keyboard shortcut).
- No background, timed, or auto-triggered screenshot collection.
- Auto-redaction (ML scan) is a Pro feature that runs **only when the user explicitly
  triggers it** — never automatically on every capture.
- Recent captures cache is OFF by default; the user must opt in.

---

## LAW-05: Performance-first UI

- Popup opens in < 150 ms on typical machines. Never blocks on network calls.
- Heavy modules (ML model, WASM, advanced redaction) must be lazy-loaded and opt-in.
- Offscreen document must be closed after `OFFSCREEN_IDLE_TIMEOUT_MS` (30 s default).
- "Nuke everything" must complete in < 500 ms (delete storage + close offscreen doc).

---

## LAW-06: Honest privacy messaging

The product copy, store listing, and privacy policy must match reality:
- Explain ads clearly (free tier) and what data the ad provider may collect.
- Explain exactly what is stored locally and how to delete it.
- State clearly: "Your screenshots never leave your device."
- State that the ML redaction model runs 100% locally, with no cloud component.

---

## LAW-07: All canvas / WASM / heavy DOM work runs in the Offscreen Document

Service workers in MV3 cannot reliably access canvas. Any code that creates a
`CanvasRenderingContext2D`, uses `OffscreenCanvas` for encode, runs WASM, or uses
`DOMParser` for non-trivial input MUST be routed through:
- `offscreen.html` on Chrome / Edge.
- Background page on Firefox (via `offscreen-adapter.ts`).

Violation: attempting canvas drawing in the service worker will silently corrupt output
on some Chrome versions. This is a correctness invariant, not just a best practice.

---

## LAW-08: 7-day capture expiry is the maximum default retention

When "store recent captures" is enabled:
- Captures older than 7 days (user-configurable from 1–30 days) MUST be purged.
- Purge runs at SW startup and every 24 hours.
- "Nuke everything" must purge all captures regardless of age.
- Offscreen document memory associated with a capture is cleared when the capture is deleted.
- No capture data may persist beyond `captureExpiryDays` without explicit user action.

---

## LAW-09: Cross-browser parity is a launch requirement

Firefox and Edge support is not optional or deferred. WXT cross-browser build is the
implementation vehicle. Feature contracts must not diverge between Chrome, Firefox, and Edge.
If a feature cannot be implemented equivalently on all three browsers, it is either:
- Gracefully degraded (with visible explanation to the user), or
- Moved to a later version.

Safari support may be deferred to v1.1 with explicit documentation of the delay.
