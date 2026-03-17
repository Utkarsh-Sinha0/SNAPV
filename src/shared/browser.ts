export function isFirefox(): boolean {
  if (typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)) {
    return true;
  }

  const browserLike = (globalThis as typeof globalThis & {
    browser?: {
      runtime?: {
        getBrowserInfo?: unknown;
      };
    };
  }).browser;

  return typeof browserLike?.runtime?.getBrowserInfo === 'function';
}
