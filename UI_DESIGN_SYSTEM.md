# UI_DESIGN_SYSTEM.md
# SnapVault — Design System & Frontend Rules
# Version: 1.0.0 | Last Updated: 2026-03-16
#
# This document is the single source of truth for all visual decisions.
# If you are generating a UI component and this doc conflicts with your
# instincts, this doc wins.

---

## 0) Anti-slop declaration

SnapVault is used by developers and designers who can instantly recognise
generic AI-generated UI. The following are BANNED:

- Purple gradients on white backgrounds
- Inter or Roboto as the primary typeface
- "Glassmorphism" blur cards stacked on blue gradients
- Cards with `border-radius: 16px` and `box-shadow: 0 8px 32px rgba(0,0,0,0.1)`
- Rounded pill buttons with gradient fills for primary actions
- Any hero section with floating 3D shapes
- `backdrop-filter: blur(20px)` used for decoration (permitted for the
  action bar overlay on the page — that's functional, not decorative)

The aesthetic direction for SnapVault is:
**Precise. Monochromatic-first. Utilitarian with intention.**
Think: Linear.app meets a professional image editor. Dark theme primary.
Dense but not cluttered. Every pixel earns its place.

---

## 1) Colour system

All colours are CSS custom properties. Never hardcode hex values in components.

```css
/* src/shared/styles/tokens.css */
:root {
  /* ── Neutrals (OKLCH for perceptual uniformity) ── */
  --color-bg-base:        oklch(12% 0 0);      /* near-black, popup bg */
  --color-bg-elevated:    oklch(17% 0 0);      /* card / panel bg */
  --color-bg-hover:       oklch(22% 0 0);      /* hover state */
  --color-bg-active:      oklch(25% 0 0);      /* pressed state */
  --color-border:         oklch(28% 0 0);      /* subtle borders */
  --color-border-strong:  oklch(38% 0 0);      /* prominent borders */

  /* ── Text ── */
  --color-text-primary:   oklch(95% 0 0);      /* headings, labels */
  --color-text-secondary: oklch(65% 0 0);      /* meta, descriptions */
  --color-text-disabled:  oklch(40% 0 0);      /* disabled controls */
  --color-text-inverse:   oklch(10% 0 0);      /* text on light bg */

  /* ── Brand accent — single, precise blue ── */
  --color-accent:         oklch(62% 0.2 250);  /* primary action */
  --color-accent-hover:   oklch(68% 0.2 250);  /* hover */
  --color-accent-muted:   oklch(62% 0.06 250); /* subtle tint bg */
  --color-accent-text:    oklch(82% 0.12 250); /* accent-coloured text */

  /* ── Semantic ── */
  --color-success:        oklch(72% 0.17 150);
  --color-warning:        oklch(78% 0.18 80);
  --color-error:          oklch(62% 0.22 25);
  --color-info:           oklch(70% 0.15 240);

  /* ── Pro tier indicator ── */
  --color-pro:            oklch(80% 0.15 55);  /* amber — rare, powerful */
  --color-pro-muted:      oklch(25% 0.06 55);  /* pro badge background */
}
```

**Why OKLCH:** Perceptually uniform — `oklch(62% 0.2 250)` hover to
`oklch(68% 0.2 250)` is a visually equal step regardless of hue.
No more "this blue looks washed out at this lightness" surprises.

---

## 2) Typography

**Primary typeface: `"DM Mono"` (monospaced, technical, distinctive)**
Rationale: SnapVault users are developers. A monospace primary typeface
signals precision and technical credibility. It is completely unlike
every competitor's extension UI. It is readable at 11–13px (critical
for a 360px popup). It is available on Google Fonts (local bundle for extension).

**Secondary: `"DM Sans"` (variable, clean, legible)**
Used for longer prose in Options page descriptions only.

```css
:root {
  --font-mono: "DM Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace;
  --font-sans: "DM Sans", system-ui, -apple-system, sans-serif;

  /* ── Type scale (popup-density-aware) ── */
  --text-xs:   11px;   /* meta labels, keyboard shortcuts */
  --text-sm:   12px;   /* secondary labels, descriptions */
  --text-base: 13px;   /* body, primary label text */
  --text-md:   15px;   /* section headers */
  --text-lg:   18px;   /* page titles (Options only) */

  /* ── Weight ── */
  --weight-regular: 400;
  --weight-medium:  500;  /* labels, button text */
  --weight-bold:    600;  /* nothing heavier than this */

  /* ── Line height ── */
  --leading-tight:  1.2;  /* headings */
  --leading-normal: 1.5;  /* body */
  --leading-loose:  1.8;  /* descriptions in Options */

  /* ── Letter spacing ── */
  --tracking-tight:  -0.01em;  /* headings */
  --tracking-normal:  0;
  --tracking-wide:    0.05em;  /* ALL-CAPS labels, keyboard shortcuts */
  --tracking-widest:  0.12em;  /* PRO badge text */
}
```

**Font loading:** Bundle `DM Mono` and `DM Sans` in `src/assets/fonts/`.
Do not load from Google Fonts CDN (violates LAW-02 — no remote scripts,
and a CDN font request from an extension page is an unnecessary privacy signal).

---

## 3) Spacing system

8-point base grid. All spacing values are multiples of 4px.

```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;

  /* ── Component-specific ── */
  --popup-width:       360px;
  --popup-max-height:  560px;
  --popup-padding:     var(--space-4);
  --button-height-sm:  28px;
  --button-height-md:  32px;
  --button-height-lg:  36px;
  --input-height:      32px;
  --radius-sm:          3px;  /* subtle, not bubbly */
  --radius-md:          5px;
  --radius-lg:          8px;  /* max used anywhere — reserved for modals */
}
```

**Border radius discipline:** `3px` for buttons and inputs. `5px` for cards.
`8px` only for modal overlays. Never `12px`, `16px`, or `50%` on rectangles.
The UI is precise, not friendly-rounded.

---

## 4) Component specifications

### Button

Three variants. All use `--font-mono`. Never `border-radius > var(--radius-sm)`.

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--button-height-md);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition: background 100ms, color 100ms, border-color 100ms;
  user-select: none;
}

/* Primary — accent fill */
.btn-primary {
  background: var(--color-accent);
  color: var(--color-text-inverse);
  border: 1px solid transparent;
}
.btn-primary:hover  { background: var(--color-accent-hover); }
.btn-primary:active { opacity: 0.85; }

/* Secondary — outlined */
.btn-secondary {
  background: transparent;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-strong);
}
.btn-secondary:hover  { background: var(--color-bg-hover); }

/* Ghost — no border, subtle hover */
.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid transparent;
}
.btn-ghost:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }

/* States */
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}
.btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Icon-only button */
.btn-icon {
  padding: 0;
  width: var(--button-height-md);
  justify-content: center;
}

/* Small variant */
.btn-sm { height: var(--button-height-sm); padding: 0 var(--space-2); font-size: var(--text-xs); }
```

### Input / Select

```css
.input {
  height: var(--input-height);
  padding: 0 var(--space-3);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  width: 100%;
  transition: border-color 100ms;
}
.input:hover  { border-color: var(--color-border-strong); }
.input:focus  { outline: none; border-color: var(--color-accent); }
.input::placeholder { color: var(--color-text-disabled); }
```

### Card / Panel

```css
.card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
/* No box-shadow. Borders are the separation mechanism. */
```

### Feasibility Banner

```css
/* Blocking — red */
.banner-error {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: color-mix(in oklch, var(--color-error) 12%, transparent);
  border: 1px solid color-mix(in oklch, var(--color-error) 40%, transparent);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-error);
}

/* Warning — yellow */
.banner-warning {
  background: color-mix(in oklch, var(--color-warning) 12%, transparent);
  border-color: color-mix(in oklch, var(--color-warning) 40%, transparent);
  color: var(--color-warning);
}

/* Info — blue, non-blocking (HiDPI upgrade prompt) */
.banner-info {
  background: var(--color-accent-muted);
  border-color: color-mix(in oklch, var(--color-accent) 40%, transparent);
  color: var(--color-accent-text);
}
```

### Pro badge

```css
.badge-pro {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 5px;
  background: var(--color-pro-muted);
  border: 1px solid color-mix(in oklch, var(--color-pro) 40%, transparent);
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-widest);
  color: var(--color-pro);
  text-transform: uppercase;
  vertical-align: middle;
  margin-left: var(--space-2);
}
```

### Toggle / Checkbox

No browser-native checkboxes. Custom toggle:

```css
.toggle {
  position: relative;
  width: 32px;
  height: 18px;
  flex-shrink: 0;
}
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-track {
  position: absolute; inset: 0;
  background: var(--color-bg-active);
  border: 1px solid var(--color-border-strong);
  border-radius: 9px;
  cursor: pointer;
  transition: background 150ms, border-color 150ms;
}
.toggle input:checked + .toggle-track {
  background: var(--color-accent);
  border-color: transparent;
}
.toggle-thumb {
  position: absolute;
  top: 2px; left: 2px;
  width: 12px; height: 12px;
  background: white;
  border-radius: 50%;
  transition: transform 150ms;
}
.toggle input:checked ~ .toggle-thumb { transform: translateX(14px); }
.toggle input:focus-visible + .toggle-track {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

---

## 5) Motion rules

CSS-only. No JS animation libraries in the popup (startup perf).
Playwright tests run in CI without GPU — keep transitions fast and testable.

```css
/* ── Global motion token ── */
:root {
  --ease-out:   cubic-bezier(0.0, 0.0, 0.2, 1);
  --ease-in:    cubic-bezier(0.4, 0.0, 1.0, 1);
  --ease-snap:  cubic-bezier(0.16, 1, 0.3, 1);    /* fast settle */

  --duration-fast:   80ms;
  --duration-normal: 150ms;
  --duration-slow:   250ms;
}

/* Popup entrance — slides up 4px and fades in */
@keyframes popup-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.popup-root {
  animation: popup-enter var(--duration-normal) var(--ease-snap);
}

/* Toast / receipt — slides in from bottom right */
@keyframes toast-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Progress bar fill */
@keyframes progress-fill {
  from { width: 0%; }
  to   { width: var(--progress-value, 0%); }
}

/* Respect user preference */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Motion constraints:**
- Popup-open animation: 150ms max. Any longer and it feels sluggish.
- Hover transitions: 80–100ms. Faster than this is jarring; slower is laggy.
- No bouncing, no spring physics in the popup. Reserved for the editor (more space).
- Progress indicators animate in the CSS; JS sets a CSS variable (`--progress-value`).
  No RAF loops for progress bars.

---

## 6) Iconography

**Source: Lucide icons (MIT licence, tree-shakeable SVG)**
Import only the icons you use. Never import the entire icon set.

```ts
// CORRECT — tree-shaken
import { Camera, Download, Clipboard, AlertTriangle } from 'lucide-preact';

// WRONG — imports everything
import * as Icons from 'lucide-preact';
```

Icon sizes: 14px for toolbar icons, 16px for action bar, 20px for empty states.
Stroke width: 1.5px (default Lucide). Do not change stroke width.
Never use emoji as UI icons. They render inconsistently across OS and DPR.

---

## 7) Popup layout anatomy

```
┌─────────────────────────────────────┐  ← 360px wide
│  SnapVault                  [Free▾] │  ← Header: 40px, logo + tier badge
├─────────────────────────────────────┤
│  [📷 Visible] [⊡ Region] [↕ Full]  │  ← Capture mode row: 44px
├─────────────────────────────────────┤
│  Format  ○ PNG  ○ JPEG  ○ PDF      │  ← Export Spec section: variable height
│  Size    [1080p            ▾]       │
│  DPI     ○ CSS 1×  ● Device  [PRO] │
├─────────────────────────────────────┤
│  ⚠ Estimated 12MB · exceeds limit  │  ← Feasibility banner (conditional)
├─────────────────────────────────────┤
│              [Capture]              │  ← Primary CTA: full-width, 36px
└─────────────────────────────────────┘  ← Total: ~240–340px depending on banners
```

Rules:
- Header is always visible and always 40px.
- Capture mode row: three equal-width icon+label buttons.
- Export Spec section: uses a tight 2-column grid (label left, control right).
  Labels in `--text-xs`, `--color-text-secondary`. Controls fill remaining space.
- Feasibility banner: only rendered when needed. Does not push CTA below 560px.
- Primary CTA: full-width, `btn-primary`, `btn-lg`.
- No scrolling in the popup. If content would overflow, compress the spec section.

---

## 8) Editor page layout

The editor is a full-page Preact app. Layout:

```
┌──────────────────────────────────────────────────────────┐
│ [← Back]  SnapVault Editor          [Export▾]  [⤓ Save] │  ← Topbar 48px
├────┬─────────────────────────────────────────┬───────────┤
│ T  │                                         │ Format    │
│ ○  │         CANVAS AREA                     │ Dimensions│
│ ⬡  │                                         │ DPI Policy│
│ ⌫  │                                         │ ─────── │
│    │                                         │ Feasiblty │
│    │                                         │ ─────── │
│    │                                         │ Redact    │
└────┴─────────────────────────────────────────┴───────────┘
  ↑                                               ↑
 Tool                                        Right panel
sidebar                                     240px fixed
 48px
```

- Canvas area: fills remaining space, `overflow: hidden`.
- Tool sidebar: 48px wide, icon-only buttons, tooltip on hover.
- Right panel: 240px fixed, scrollable, contains Export Spec controls.
- No floating toolbars over the canvas (they obscure content during annotation).

---

## 9) Content script action bar

Injected into the page after a capture. Must not look like a Chrome extension
alert or a browser notification — those patterns get immediately dismissed.

```css
/* Injected as a Shadow DOM so page styles can't interfere */
.snapvault-action-bar {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483647;  /* max z-index */
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: oklch(12% 0 0);     /* match extension dark theme */
  border: 1px solid oklch(30% 0 0);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.6);
  font-family: "DM Mono", ui-monospace, monospace;
  font-size: 12px;
}
```

The action bar must use Shadow DOM to prevent style contamination from the host page.
Use `element.attachShadow({ mode: 'closed' })`. Never `mode: 'open'`.

---

## 10) Design system component rules for the agent

When generating a new UI component:

1. Look at what tokens already exist in this file before inventing new values.
2. Use CSS classes, never inline `style={{ }}` for design values.
3. Every new CSS class goes in the component's own `.css` file,
   co-located next to the `.tsx` file.
4. Do NOT generate a new colour — use or extend the token list above.
5. Do NOT use Tailwind or any utility CSS framework. SnapVault uses
   CSS modules with CSS custom properties. This keeps the popup bundle tiny.
6. If you think a new component is needed but it already exists in
   `src/shared/components/`, import it — don't rewrite it.
7. Test the component's render at 360px popup width before declaring done.
   Most "responsive" UI breaks at small widths because tests used full viewport.
