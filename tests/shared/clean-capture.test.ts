import { describe, expect, it } from 'vitest';
import { buildCleanCaptureCSS } from '../../src/shared/clean-capture';

describe('buildCleanCaptureCSS', () => {
  it('hides custom selectors and the default overlay set', () => {
    const css = buildCleanCaptureCSS(['.my-banner']);

    expect(css).toContain('.my-banner { visibility: hidden !important; }');
    expect(css).toContain('[data-cookie-banner] { visibility: hidden !important; }');
  });
});
