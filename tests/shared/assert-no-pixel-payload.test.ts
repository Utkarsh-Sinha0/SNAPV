import { describe, expect, it } from 'vitest';

import { assertNoPixelPayload } from '../../src/shared/assert-no-pixel-payload';

describe('assertNoPixelPayload', () => {
  it('throws for data URLs', () => {
    expect(() =>
      assertNoPixelPayload({ dataUrl: 'data:image/png;base64,abc' }),
    ).toThrow();
  });

  it('throws for ImageData instances', () => {
    expect(() =>
      assertNoPixelPayload({ img: new ImageData(1, 1) }),
    ).toThrow();
  });

  it('throws for ArrayBuffer payloads', () => {
    expect(() => assertNoPixelPayload(new ArrayBuffer(8))).toThrow();
  });

  it('allows licensing metadata payloads', () => {
    expect(() =>
      assertNoPixelPayload({ installationId: 'abc', plan: 'pro' }),
    ).not.toThrow();
  });

  it('allows empty objects and primitives', () => {
    expect(() => assertNoPixelPayload({})).not.toThrow();
    expect(() => assertNoPixelPayload('hello')).not.toThrow();
  });

  it('throws for nested data URLs', () => {
    expect(() =>
      assertNoPixelPayload({ meta: { dataUrl: 'data:text/plain,abc' } }),
    ).toThrow();
  });
});
