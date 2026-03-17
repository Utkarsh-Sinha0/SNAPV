import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLicensingServer,
  createRateLimiter,
  validateRuntimeEnv,
} from '../../services/licensing/server.mjs';

function createDeps() {
  return {
    stripe: {
      checkout: {
        sessions: {
          create: vi.fn(async (input: { line_items: Array<{ price: string }> }) => ({
            url: `https://checkout.example/${input.line_items[0]?.price}`,
          })),
        },
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
    },
    store: {
      get: vi.fn(async (_installationId: string): Promise<Record<string, unknown> | null> => null),
      upsert: vi.fn(async (state: unknown) => state),
    },
    webhookSecret: 'whsec_test',
    successUrl: 'https://snapvault.app/success',
    cancelUrl: 'https://snapvault.app/cancel',
    priceIds: {
      monthly: {
        IN: 'price_monthly_in',
        US: 'price_monthly_us',
        OTHER: 'price_monthly_other',
      },
      lifetime: {
        IN: 'price_lifetime_in',
        US: 'price_lifetime_us',
        OTHER: 'price_lifetime_other',
      },
    },
  };
}

async function withServer<T>(
  deps: ReturnType<typeof createDeps>,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createLicensingServer(deps);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

async function postJson(
  url: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const target = new URL(url);

  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        method: 'POST',
        hostname: target.hostname,
        port: Number(target.port),
        path: `${target.pathname}${target.search}`,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body).toString(),
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode ?? 0,
            json: raw.length > 0 ? JSON.parse(raw) : {},
          });
        });
      },
    );

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

describe('licensing server', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects the correct Stripe price id for India and US checkout requests', async () => {
    const deps = createDeps();

    await withServer(deps, async (baseUrl) => {
      const indiaResponse = await postJson(
        `${baseUrl}/v1/licensing/checkout`,
        JSON.stringify({
          installationId: 'install-in',
          plan: 'monthly',
          country: 'IN',
        }),
      );
      const usResponse = await postJson(
        `${baseUrl}/v1/licensing/checkout`,
        JSON.stringify({
          installationId: 'install-us',
          plan: 'monthly',
          country: 'US',
        }),
      );

      expect(indiaResponse.status).toBe(200);
      expect(indiaResponse.json).toEqual({
        url: 'https://checkout.example/price_monthly_in',
      });
      expect(usResponse.status).toBe(200);
      expect(usResponse.json).toEqual({
        url: 'https://checkout.example/price_monthly_us',
      });
    });

    expect(deps.stripe.checkout.sessions.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        line_items: [{ price: 'price_monthly_in', quantity: 1 }],
      }),
    );
    expect(deps.stripe.checkout.sessions.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        line_items: [{ price: 'price_monthly_us', quantity: 1 }],
      }),
    );
  });

  it('returns the current license state from sync', async () => {
    const deps = createDeps();
    vi.mocked(deps.store.get).mockResolvedValue({
      status: 'pro',
      plan: 'monthly',
      installationId: 'install-sync',
    });

    await withServer(deps, async (baseUrl) => {
      const response = await postJson(
        `${baseUrl}/v1/licensing/sync`,
        JSON.stringify({
          installationId: 'install-sync',
        }),
      );

      expect(response.status).toBe(200);
      expect(response.json).toEqual({
        status: 'pro',
        plan: 'monthly',
        installationId: 'install-sync',
      });
    });
  });

  it('returns 400 when the Stripe webhook signature is invalid', async () => {
    const deps = createDeps();
    vi.mocked(deps.stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    await withServer(deps, async (baseUrl) => {
      const response = await postJson(
        `${baseUrl}/v1/licensing/webhook`,
        '{}',
        {
          'stripe-signature': 'sig_invalid',
        },
      );

      expect(response.status).toBe(400);
      expect(response.json).toEqual({
        error: 'Invalid signature',
      });
    });

    expect(deps.store.upsert).not.toHaveBeenCalled();
  });

  it('marks the license active after a valid checkout.session.completed webhook', async () => {
    const deps = createDeps();
    vi.mocked(deps.stripe.webhooks.constructEvent).mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {
            installationId: 'install-webhook',
            plan: 'monthly',
          },
          subscriptionDetails: {
            currentPeriodEnd: 1_893_456_000,
          },
        },
      },
    });

    await withServer(deps, async (baseUrl) => {
      const response = await postJson(
        `${baseUrl}/v1/licensing/webhook`,
        '{}',
        {
          'stripe-signature': 'sig_valid',
        },
      );

      expect(response.status).toBe(200);
      expect(response.json).toEqual({ received: true });
    });

    expect(deps.store.upsert).toHaveBeenCalledWith({
      status: 'pro',
      plan: 'monthly',
      expiresAt: '2030-01-01T00:00:00.000Z',
      installationId: 'install-webhook',
    });
  });

  it('rate limits repeated requests from the same client', async () => {
    const deps = {
      ...createDeps(),
      rateLimiter: createRateLimiter({ maxRequests: 1, windowMs: 60_000 }),
    };

    await withServer(deps, async (baseUrl) => {
      const firstResponse = await postJson(
        `${baseUrl}/v1/licensing/sync`,
        JSON.stringify({ installationId: 'install-rate-limit' }),
      );
      const secondResponse = await postJson(
        `${baseUrl}/v1/licensing/sync`,
        JSON.stringify({ installationId: 'install-rate-limit' }),
      );

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(429);
      expect(secondResponse.json).toEqual({
        error: 'Too many requests',
      });
    });
  });

  it('rejects missing production env vars before startup', () => {
    expect(() =>
      validateRuntimeEnv({
        SNAPVAULT_ENV: 'production',
        STRIPE_SECRET_KEY: 'sk_test',
      }),
    ).toThrow('Missing required licensing env vars');
  });
});
