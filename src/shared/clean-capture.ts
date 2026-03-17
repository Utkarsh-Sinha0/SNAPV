const DEFAULT_OVERLAY_SELECTORS = [
  '[data-cookie-banner]',
  '[aria-label*="cookie" i]',
  '[class*="cookie" i]',
  '[id*="cookie" i]',
  '[class*="modal" i]',
  '[class*="banner" i]',
] as const;

export function buildCleanCaptureCSS(selectors: string[]): string {
  const allSelectors = [...DEFAULT_OVERLAY_SELECTORS, ...selectors];
  return allSelectors
    .map((selector) => `${selector} { visibility: hidden !important; }`)
    .join('\n');
}
