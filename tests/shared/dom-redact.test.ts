import { describe, expect, it } from 'vitest';

import {
  detectApiKey,
  detectCreditCard,
  detectEmail,
  detectPhone,
  detectSsn,
  luhnCheck,
  scanTextNode,
} from '../../src/shared/dom-redact';

describe('dom redaction detectors', () => {
  it('detects emails', () => {
    expect(detectEmail('user@example.com')).toBe(true);
    expect(detectEmail('notanemail')).toBe(false);
    expect(detectEmail('a@b')).toBe(false);
  });

  it('detects phones', () => {
    expect(detectPhone('+1-800-555-0100')).toBe(true);
    expect(detectPhone('hello')).toBe(false);
  });

  it('detects valid credit cards only when luhn passes', () => {
    expect(detectCreditCard('4532015112830366')).toBe(true);
    expect(detectCreditCard('1234567890123456')).toBe(false);
  });

  it('implements luhn checking', () => {
    expect(luhnCheck('4532015112830366')).toBe(true);
    expect(luhnCheck('4532015112830367')).toBe(false);
  });

  it('detects api keys heuristically', () => {
    expect(detectApiKey('sk_live_51NvzQn91fBaXyZQwpT8L2sG')).toBe(true);
    expect(detectApiKey('ordinaryword')).toBe(false);
  });

  it('detects ssns', () => {
    expect(detectSsn('123-45-6789')).toBe(true);
    expect(detectSsn('123-456-789')).toBe(false);
  });

  it('scans text nodes for supported pii types', () => {
    expect(scanTextNode('Send to user@example.com')).toEqual(['email']);
    expect(scanTextNode('Card: 4532015112830366')).toEqual(['credit-card']);
    expect(scanTextNode('Hello world')).toEqual([]);
  });
});
