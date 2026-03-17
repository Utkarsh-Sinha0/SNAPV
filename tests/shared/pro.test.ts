import { describe, expect, it } from 'vitest';
import { assertProLicense, ProRequiredError } from '../../src/shared/pro';

describe('assertProLicense', () => {
  it('throws when the license is not pro', () => {
    expect(() => assertProLicense({ status: 'free' })).toThrow(ProRequiredError);
  });

  it('allows pro licenses through', () => {
    expect(() => assertProLicense({ status: 'pro' })).not.toThrow();
  });
});
