import type { RedactAnnotationType } from './types';

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/;
const API_KEY_REGEX = /^[A-Za-z0-9_-]{20,}$/;

function extractDigits(text: string): string {
  return text.replace(/\D/g, '');
}

function shannonEntropy(text: string): number {
  const frequencies = new Map<string, number>();

  for (const char of text) {
    frequencies.set(char, (frequencies.get(char) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / text.length;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

export function detectEmail(text: string): boolean {
  return EMAIL_REGEX.test(text);
}

export function detectPhone(text: string): boolean {
  if (!/[+\d]/.test(text)) {
    return false;
  }

  const digits = extractDigits(text);
  if (digits.length < 10 || digits.length > 15) {
    return false;
  }

  return /(?:\+\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?){2,4}\d{2,4}/.test(text);
}

export function luhnCheck(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

export function detectCreditCard(text: string): boolean {
  const digits = extractDigits(text);
  return /^\d{13,19}$/.test(digits) && luhnCheck(digits);
}

export function detectApiKey(text: string): boolean {
  const trimmed = text.trim();
  return API_KEY_REGEX.test(trimmed) && shannonEntropy(trimmed) >= 3.5;
}

export function detectSsn(text: string): boolean {
  return SSN_REGEX.test(text);
}

export function scanTextNode(text: string): RedactAnnotationType[] {
  const matches: RedactAnnotationType[] = [];

  if (detectEmail(text)) {
    matches.push('email');
  }

  if (detectPhone(text)) {
    matches.push('phone');
  }

  if (detectCreditCard(text)) {
    matches.push('credit-card');
  }

  if (detectApiKey(text)) {
    matches.push('api-key');
  }

  if (detectSsn(text)) {
    matches.push('ssn');
  }

  return matches;
}
