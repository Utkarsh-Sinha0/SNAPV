# API_SPECIFICATIONS.md
# SnapVault — Internal APIs & Message Contracts
# Version: 3.0.0 | Last Updated: 2026-03-16

All internal communication uses typed runtime messages.
All types live in `src/shared/types.ts`.

---

## 1) Core shared types

### ExportSpec
```ts
interface ExportSpec {
  format: 'png' | 'jpeg' | 'pdf';
  dimensions: {
    mode: 'preset' | 'manual';
    presetId?: string;
    width?: number;
    height?: number;
  };
  dpiPolicy: 'css1x' | 'device';
  jpeg?: {
    mode: 'quality' | 'targetSize';
    quality?: number;           // 0–100
    targetBytes?: number;
    toleranceBytes?: number;
  };
  filenameTemplate: string;
  lightMode?: boolean;          // v3: skip stitch overlap correction
  gpuAccelerate?: boolean;      // v3: use WebGPU encode loop if available
}
```

### CaptureMetadata
```ts
interface CaptureMetadata {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;     // actual DPR at trigger time (per-monitor)
  screenLeft: number;           // multi-monitor x-offset
  screenTop: number;            // multi-monitor y-offset
  lightMode: boolean;
  capturedAt: number;           // Unix ms — used for 7-day expiry check
}
```

### FeasibilityResult
```ts
interface FeasibilityResult {
  ok: boolean;
  blockingReasons: string[];
  warnings: string[];
  estimatedBytesRange?: [min: number, max: number];
  estimatedCpuSeconds?: number;         // v3 new
  suggestLightMode?: boolean;           // v3 new: true when cpuSeconds > threshold
  dprAdjustedDimensions?: {            // v3 new: actual output dims after DPR
    width: number;
    height: number;
  };
}
```

### RedactAnnotation
```ts
type RedactAnnotationType =
  | 'face' | 'logo' | 'email' | 'phone' | 'credit-card'
  | 'api-key' | 'ssn' | 'text-block' | 'custom';

interface RedactAnnotation {
  id: string;
  type: RedactAnnotationType;
  rect: { x: number; y: number; w: number; h: number };
  confidence: number;
  source: 'dom' | 'ml';
  userReviewed: boolean;
}
```

### ExportSpecPreset (community sharing)
```ts
interface ExportSpecPreset {
  snapvault_preset: '1.0';      // schema version sentinel
  name: string;
  description?: string;
  spec: ExportSpec;
  createdAt?: string;           // ISO date string
}
```

---

## 2) Capture messages (popup/content → SW)

| Message | Payload | Notes |
|---------|---------|-------|
| `CAPTURE_VISIBLE` | `{ tabId: number, spec: ExportSpec }` | |
| `CAPTURE_REGION` | `{ tabId: number, rect: DOMRect, spec: ExportSpec }` | |
| `CAPTURE_FULLPAGE` | `{ tabId: number, spec: ExportSpec, lightMode: boolean }` | |
| `CAPTURE_SCROLL_CONTAINER` | `{ tabId: number, selector: string, spec: ExportSpec }` | v1.1 |
| `CAPTURE_METADATA_UPDATE` | `{ metadata: Partial<CaptureMetadata> }` | DPR refresh on monitor change |

---

## 3) Editor / export messages

| Message | Payload | Notes |
|---------|---------|-------|
| `OPEN_EDITOR_WITH_IMAGE` | `{ captureId: string }` | |
| `APPLY_EXPORT_SPEC` | `{ captureId: string, spec: ExportSpec }` | |
| `CHECK_FEASIBILITY` | `{ spec: ExportSpec, metadata: CaptureMetadata }` | Returns `FeasibilityResult` |
| `EXPORT_DOWNLOAD` | `{ captureId: string, spec: ExportSpec }` | |
| `EXPORT_CLIPBOARD` | `{ captureId: string, spec: ExportSpec }` | |
| `STORE_CAPTURE_DATA_URL` | `{ captureId: string, dataUrl: string, metadata: CaptureMetadata }` | |
| `GET_CAPTURE_DATA_URL` | `{ captureId: string }` | Returns `{ dataUrl: string }` |
| `DELETE_CAPTURE` | `{ captureId: string }` | |
| `PURGE_EXPIRED_CAPTURES` | `{}` | SW runs on startup + daily; removes entries older than 7 days |
| `NUKE_ALL_CAPTURES` | `{}` | Deletes all captures + sends OFFSCREEN_CLEAR_MEMORY |

---

## 4) Pro feature messages

| Message | Payload | Notes |
|---------|---------|-------|
| `TOGGLE_CLEAN_CAPTURE` | `{ enabled: boolean, customSelectors: string[] }` | |
| `PICK_DOM_ELEMENT` | `{ tabId: number }` | Activates element-picker content script |
| `ELEMENT_PICKED` | `{ tabId: number, selector: string, rect: DOMRect }` | Content → SW |
| `RUN_DOM_REDACTION` | `{ tabId: number }` | Returns `RedactAnnotation[]` from DOM scan |
| `RUN_AUTO_REDACTION` | `{ captureId: string }` | Routes to ML via offscreen |
| `APPLY_REDACT_ANNOTATIONS` | `{ captureId: string, annotations: RedactAnnotation[] }` | Confirmed by user |
| `START_LICENSE_CHECKOUT` | `{ plan: string, country?: string }` | |
| `VERIFY_LICENSE` | `{ licenseKey: string }` | |
| `SYNC_LICENSE` | `{}` | Background poll |
| `GET_LICENSE_STATE` | `{}` | Returns `LicenseState` |

---

## 5) Offscreen document messages (SW ↔ offscreen)

These messages are internal to the extension and NEVER exposed to content scripts or web pages.

| Message | Direction | Payload |
|---------|-----------|---------|
| `OFFSCREEN_STITCH` | SW → offscreen | `{ id: string, segments: string[], metadata: CaptureMetadata, spec: ExportSpec }` |
| `OFFSCREEN_ENCODE` | SW → offscreen | `{ id: string, dataUrl: string, spec: ExportSpec }` |
| `OFFSCREEN_BUILD_PDF` | SW → offscreen | `{ id: string, pages: string[], spec: ExportSpec }` |
| `OFFSCREEN_REDACT` | SW → offscreen | `{ id: string, dataUrl: string, annotations: RedactAnnotation[] }` |
| `OFFSCREEN_RUN_ML_REDACTION` | SW → offscreen | `{ id: string, dataUrl: string }` |
| `OFFSCREEN_CLEAR_MEMORY` | SW → offscreen | `{ reason: 'nuke' \| 'idle' }` |
| `OFFSCREEN_RESULT` | offscreen → SW | `{ id: string, ok: boolean, dataUrl?: string, annotations?: RedactAnnotation[], error?: string }` |

All `id` values are random UUIDs generated by the SW per operation. Offscreen echoes the `id`
back in `OFFSCREEN_RESULT` so the SW can resolve the correct pending Promise.

---

## 6) Settings / preferences keys (chrome.storage.local)

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `exportSpecs` | `ExportSpecPreset[]` | `[...defaults]` | User preset library |
| `licenseState` | `LicenseState` | `{ status: 'free' }` | |
| `privacySettings.storeCaptures` | `boolean` | `false` | "Recent captures" toggle |
| `privacySettings.captureExpiryDays` | `number` | `7` | 1–30 |
| `cleanCaptureSettings` | `CleanCaptureSettings` | `{ enabled: false, selectors: [] }` | |
| `performanceSettings.lightMode` | `boolean` | `false` | Stitch overlap correction toggle |
| `performanceSettings.useGpu` | `boolean` | `true` | WebGPU encode if available |
| `analyticsOptIn` | `boolean` | `false` | OFF by default |
| `installationId` | `string` | auto-generated UUID | |

---

## 7) External endpoints (minimal, metadata only)

All endpoints are HTTPS. All calls are wrapped with `assertNoPixelPayload`.

| Endpoint | Method | Payload | Notes |
|----------|--------|---------|-------|
| `/v1/licensing/checkout` | POST | `{ installationId, plan, country? }` | Returns Stripe checkout URL |
| `/v1/licensing/sync` | POST | `{ installationId }` | Returns `LicenseState` |
| `/v1/licensing/verify` | POST | `{ licenseKey, installationId }` | Binds key to install |
| `/v1/licensing/webhook` | POST | Stripe event body | Backend only; HTTPS |

No screenshot pixels. No page URLs. No content. Ever.

Analytics endpoint (optional, opt-in, anonymous):
- `POST /v1/analytics/event` — event name + install ID only. Off by default.
