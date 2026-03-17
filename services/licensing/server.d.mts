import type { Server } from 'node:http';

export function createLicensingServer(deps: unknown): Server;
export function createRateLimiter(config?: {
  maxRequests?: number;
  windowMs?: number;
}): {
  check: (key: string) => void;
};
export function validateRuntimeEnv(env?: Record<string, string | undefined>): void;
