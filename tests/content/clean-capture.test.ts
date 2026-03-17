import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyCleanCapture,
  validateCssSelector,
} from '../../src/content/clean-capture';

describe('clean capture content helpers', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<div class="valid-class">Hello</div>';
  });

  it('validates selectors safely', () => {
    expect(validateCssSelector('.valid-class')).toBe(true);
    expect(validateCssSelector('{{invalid}}')).toBe(false);
  });

  it('injects and removes the clean capture style tag', () => {
    const cleanup = applyCleanCapture('.valid-class { visibility: hidden !important; }');

    expect(document.head.querySelector('[data-snapvault-clean-capture="true"]')).toBeTruthy();

    cleanup();

    expect(document.head.querySelector('[data-snapvault-clean-capture="true"]')).toBeNull();
  });
});
