# MONETIZATION_STRATEGY.md
# SnapVault — Tiered Monetization
# Version: 3.0.0 | Last Updated: 2026-03-16

---

## 1) Revenue model

- **Free tier** earns via sponsor slot shown only on non-popup pages (Options/Editor).
  Two implementation options — choose based on install count (see §2).
- **Pro tier** is ad-free and unlocks moat features (Clean Capture, True 1× export,
  DOM element isolation with hybrid bg toggle, local ML auto-redaction).
- **Lifetime option** available alongside subscription for early cash boost.

---

## 2) Free-tier monetization: two options

### Option A — Local `sponsor.json` card (recommended for launch, 0–10k installs)

A static JSON file bundled with the extension (`src/assets/sponsor.json`) that renders
a tasteful "Sponsor" card inside `ads_sandbox.html`.

```json
{
  "sponsor": {
    "name": "Acme Dev Tools",
    "tagline": "Automate your workflow.",
    "url": "https://acme.example.com?ref=snapvault",
    "cta": "Try free"
  }
}
```

**Why this wins for a solo launch:**
- Zero external dependency — no SDK, no network call, instant render.
- Zero RPM risk — replace with a direct deal at any time.
- Fully compliant with MV3 CSP (`script-src 'self'`).
- Trust signal: users can inspect the file; no ad-network tracking.
- Swap to Carbon by simply updating `ads_sandbox.html` — no manifest change.

**Monetization path:** direct sponsor outreach via email/Discord/LinkedIn.
Dev-tool adjacent SaaS companies regularly pay $200–$800/month for a "Sponsor" slot
in a well-positioned extension at 5k+ installs.

---

### Option B — Carbon Ads (recommended at 10k+ installs when RPM justifies it)

Carbon Ads serves non-intrusive, developer-audience ads with no SDK bloat in core code.
2026 data: Carbon RPM for dev-audience extensions is $0.50–$1.50 CPM on options/editor pages.
At 10k DAU with 20% editor-open rate → ~2k daily impressions → ~$1–3/day → $30–90/month.
Viable as supplemental income; not primary at early stage.

### Critical implementation rule (MV3 CSP — both options)
Extension pages enforce `script-src 'self'`. The sponsor slot MUST be in
`ads_sandbox.html` inside an iframe:
```html
<iframe src="ads_sandbox.html"
        sandbox="allow-scripts allow-popups allow-forms"
        style="border:none;width:320px;height:100px"></iframe>
```
`ads_sandbox.html` is listed in `manifest.sandbox.pages` and loads Carbon or renders
the `sponsor.json` card — isolated from extension APIs and screenshot pixels.

### Placement rules (both options)
- NEVER in popup (performance + trust signal).
- ONLY in Options page and/or Editor sidebar, free tier only.
- Clear label: "Sponsor" (not "Ad"). Pro tier: slot not rendered at all.

---

## 3) Pro pricing

### Subscription (recurring revenue)
| Region | Monthly | Notes |
|--------|---------|-------|
| India (INR) | ₹199 / month | ~$2.40 USD |
| US / EU | $4.99 / month | mid-range for privacy-first tools |
| Other | $3.99 / month | Stripe geo-detected fallback |

### Lifetime (early cash + word-of-mouth)
| Region | Price |
|--------|-------|
| India | ₹999 |
| US / EU | $29 |

Lifetime option creates early cash and users who tell others. Cap at first 500 sales
if preferred, or keep open as an always-available option.

---

## 4) Payments + geo pricing (Stripe)

Backend responsibilities (`services/licensing/server.mjs`):
- Detect country from checkout request; select correct Stripe price ID.
- `POST /v1/licensing/checkout` → returns Stripe Checkout Session URL.
- `POST /v1/licensing/webhook` → Stripe event processing; marks license active.
- `POST /v1/licensing/sync` → returns current license state for install ID.
- `POST /v1/licensing/verify` → binds license key to install ID.

Extension stores only:
`licenseStatus`, `plan`, `expiresAt`, `installationId`, optional `licenseKey`.
**No payment method data. No personal data.**

---

## 5) ExportSpec preset community — free viral growth

Users can export their ExportSpec presets as a `.json` file and share on GitHub/Discord.
This is the zero-cost viral loop:
- "Here's my SnapVault preset for Figma mockup exports" → link to `.json` on GitHub.
- Others import it with one click in Options.
- No server, no app store review, no tracking.
- Each shared preset is free advertising. Market it in launch posts.

---

## 6) Revenue projections (conservative)

| Milestone | Installs | DAU | Pro users | Monthly revenue |
|-----------|----------|-----|-----------|----------------|
| Month 1 | 2k | 400 | 8 | ~$40 |
| Month 3 | 5k | 1k | 20–30 | ~$100–150 |
| Month 6 | 15k | 3k | 60–90 | ~$300–450 |
| Month 12 | 50k | 10k | 200–300 | ~$1k–1.5k/mo |

At 50k installs + lifetime option + direct sponsor deal:
- Recurring Pro subscription: ~$1.5k/month.
- Lifetime sales (500 × $29): ~$14.5k one-time.
- Direct sponsor deal ($400/month at 50k DAU): $400/month.
- Total year-1 cash potential: ~$30–40k.

---

## 7) "Free tier earns constantly" guardrails
- Sponsor slot loads only when user opens Options/Editor.
- Sponsor never blocks capture pipeline.
- If `sponsor.json` is missing or malformed, show nothing (no error state).
- If Carbon fails to load, do nothing (no retry loop, no fallback network call).

---

## 8) Success metrics
- Free DAU → editor/options open rate (drives sponsor impressions).
- Sponsor click-through rate (sponsor.json: track via UTM in the URL only).
- Carbon RPM (track; switch to sponsor.json if < $0.50 for 30 days).
- Free → Pro conversion: target 1.5–3%.
- Pro monthly churn: target < 3%.
- Preset JSON shares (GitHub stars on community preset repos — proxy metric).
