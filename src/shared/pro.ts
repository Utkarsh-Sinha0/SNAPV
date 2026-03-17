import type { LicenseState } from './types';

export class ProRequiredError extends Error {
  constructor(message = 'Pro license required') {
    super(message);
    this.name = 'ProRequiredError';
  }
}

export function assertProLicense(state: LicenseState): void {
  if (state.status !== 'pro') {
    throw new ProRequiredError();
  }
}
