# SKILLS.md
# SnapVault — Coding Agent Skills Reference
# Version: 1.0.0 | Last Updated: 2026-03-16
#
# This document tells the agent which rules file to consult before generating
# code in each area of the codebase. Reading the wrong rules (or none) is the
# primary cause of AI slop and scope drift.

---

## How to use this file

Before writing any code, look up the file you are about to touch in the table
below. Open the listed `.cursor/rules/*.mdc` file. Follow it. Then write code.

If a file is not listed, apply `core.mdc` only.

---

## Rules routing table

| What you're building | Rules to read (in order) |
|----------------------|--------------------------|
| Any file — always | `core.mdc` |
| `src/offscreen/**` | `core.mdc` → `offscreen.mdc` → `security.mdc` |
| `src/shared/stitch.ts` | `core.mdc` → `offscreen.mdc` → `testing.mdc` |
| `src/shared/encode.ts` | `core.mdc` → `offscreen.mdc` → `testing.mdc` |
| `src/shared/pdf.ts` | `core.mdc` → `offscreen.mdc` → `testing.mdc` |
| `src/shared/redact.ts` | `core.mdc` → `offscreen.mdc` → `security.mdc` |
| `src/shared/feasibility.ts` | `core.mdc` → `testing.mdc` |
| `src/shared/dpi.ts` | `core.mdc` → `testing.mdc` |
| `src/shared/assert-no-pixel-payload.ts` | `core.mdc` → `security.mdc` → `testing.mdc` |
| `src/shared/offscreen-adapter.ts` | `core.mdc` → `offscreen.mdc` → `extension-arch.mdc` |
| `src/shared/browser.ts` | `core.mdc` → `extension-arch.mdc` |
| `src/background/**` | `core.mdc` → `extension-arch.mdc` → `security.mdc` |
| `src/content/**` | `core.mdc` → `extension-arch.mdc` → `security.mdc` |
| `src/popup/**` | `core.mdc` → `components.mdc` → `UI_DESIGN_SYSTEM.md` |
| `src/options/**` | `core.mdc` → `components.mdc` → `UI_DESIGN_SYSTEM.md` |
| `src/editor/**` | `core.mdc` → `components.mdc` → `UI_DESIGN_SYSTEM.md` |
| `src/ads_sandbox/**` | `core.mdc` → `security.mdc` |
| `wxt.config.ts` | `core.mdc` → `extension-arch.mdc` |
| `tests/**` | `core.mdc` → `testing.mdc` |
| `e2e/**` | `core.mdc` → `testing.mdc` → `security.mdc` |
| `services/licensing/**` | `core.mdc` → `security.mdc` |
| Any new CSS/styles | `UI_DESIGN_SYSTEM.md` |

---

## Skill: TypeScript strict + functional patterns
**Rules file:** `core.mdc`
**Key skills required:**
- Discriminated unions. If you don't know what these are, read the TypeScript handbook
  section on "Narrowing" before touching any message handler.
- `Result<T>` pattern for fallible async operations.
- `unknown` + narrowing instead of `any`.
- Early returns. Happy path last.
- Named exports. No default exports. No exceptions.

**Common mistakes this skill prevents:**
- `catch(e: any) { return e.message }` — `e` is `unknown`, not `any`.
- `return undefined` implicitly from async functions.
- Deeply nested `if/else` trees that a reviewer can't parse at a glance.

---

## Skill: Chrome Extension MV3 + WXT
**Rules file:** `extension-arch.mdc`
**Key skills required:**
- SW lifecycle: Chrome terminates SWs after 30s. Never assume persistent SW memory.
- Message passing: async, `Result<T>` on both sides, correlation IDs for offscreen.
- `chrome.storage.local` namespaced keys.
- Content script injection vs manifest `matches`.
- `SNAPVAULT_E2E=1` guard for `<all_urls>`.
- WXT entrypoints: file-based, auto-manifest, cross-browser with two-line config.

**Common mistakes this skill prevents:**
- Storing capture blobs in SW memory across messages (SW can be killed).
- Using `chrome.storage.sync` (size limit is too small; we use `local`).
- Adding `<all_urls>` to production manifest.
- Writing `manifest_version: 3` in multiple places instead of trusting WXT.

---

## Skill: Offscreen Document + Canvas
**Rules file:** `offscreen.mdc`
**Key skills required:**
- `chrome.offscreen.createDocument` with correct reason flags.
- `OffscreenCanvas` vs `HTMLCanvasElement` (use OffscreenCanvas).
- `canvas.convertToBlob()` is async — always await.
- `ImageBitmap.close()` after use — mandatory to prevent memory leaks.
- Correlation ID pattern for concurrent messages.
- Firefox fallback via `offscreen-adapter.ts`.

**Common mistakes this skill prevents:**
- Canvas code in the service worker (silently fails on some Chrome versions).
- `canvas.toDataURL()` (synchronous, blocks thread, doesn't work in workers).
- Forgetting `return true` in message listeners for async responses.
- Memory leak from unclosed ImageBitmaps.

---

## Skill: Privacy + Security (pixel payload)
**Rules file:** `security.mdc`
**Key skills required:**
- `assertNoPixelPayload` before every network call — no exceptions.
- What counts as pixel data vs safe metadata (see security.mdc).
- Pro gate: `assertProLicense(state)` as first line of every Pro handler.
- Nuke order: offscreen → storage → in-memory Map.
- `env.allowRemoteModels = false` in Transformers.js.

**Common mistakes this skill prevents:**
- Accidentally serialising a `dataURL` into a licensing payload.
- Skipping the Pro gate because "the UI already checks it."
- Nuke deleting storage before closing offscreen (race condition).
- Transformers.js fetching model weights from CDN on first inference.

---

## Skill: Preact + Extension UI
**Rules file:** `components.mdc` + `UI_DESIGN_SYSTEM.md`
**Key skills required:**
- Preact is React-compatible but NOT React. No `ReactNode`, no `React.FC`.
  Use `ComponentChildren` and `() => JSX.Element`.
- Popup opens in < 150ms: never block first paint with async.
- All design values are CSS custom properties — never inline hex or px.
- CSS modules, not Tailwind, not styled-components.
- Shadow DOM for content script injections.
- Typography: DM Mono (primary), DM Sans (options prose only).
- Accessibility: `aria-label`, visible focus rings, 4.5:1 contrast.

**Common mistakes this skill prevents:**
- `useEffect` that fires before first render, blocking paint.
- Inline `style={{ color: '#6366f1' }}` that diverges from design tokens.
- `border-radius: 12px` on buttons (not the design system).
- Missing `aria-label` on icon buttons (Chrome Web Store review failure).
- Importing all of `lucide-preact` instead of tree-shaking.

---

## Skill: Vitest + Playwright Testing
**Rules file:** `testing.mdc`
**Key skills required:**
- Write failing test first. Always.
- `vi.mock('chrome')` for all browser API tests.
- `vi.useFakeTimers()` for offscreen idle timer tests.
- Network intercept in Playwright to assert zero outbound requests.
- `chrome.offscreen.hasDocument()` via SW evaluation for lifecycle tests.
- Median not best-case for perf budget assertions.

**Common mistakes this skill prevents:**
- Tests that only test the mock (never testing real behaviour).
- `expect(x).toBeTruthy()` — always be specific.
- Sleeping in tests instead of using fake timers.
- Playwright perf tests that pass because they measured the best-of-1 run.
- Tests with no `expect` that always pass vacuously.

---

## What skills do NOT exist here (and why)

| You might want... | Why it's not a skill here |
|-------------------|--------------------------|
| React / Vue rules | Not in the stack. SnapVault uses Preact. |
| Tailwind / shadcn rules | Not in the stack. See UI_DESIGN_SYSTEM.md. |
| Next.js / SSR rules | Extension-only. No server-side rendering. |
| Database / ORM rules | No database in the extension. Licensing backend uses a simple JSON store. |
| GraphQL rules | Not used. Plain `fetch` + Stripe REST only. |
| Docker / deployment rules | Licensing backend deploys as a single Node.js file. No container orchestration. |
| Redux / Zustand rules | State is Preact `useState` + `chrome.storage.local`. No global state library. |

---

## Agent behaviour rules (from CODEX_PROMPT.md, repeated here for proximity)

1. If a task conflicts with `docs/INVARIANTS.md` → stop and explain the conflict.
2. Do not generate placeholder code (`// TODO`, stubs that return `undefined`).
3. Write the failing test before the implementation.
4. Do not modify a file without reading its current state first.
5. After each build phase, append a lesson to `docs/AGENTS.md → Lessons Learned`.
6. Prefer the simpler interpretation. Ask once if genuinely blocked.
7. Docs are the source of truth. Never invent requirements.
