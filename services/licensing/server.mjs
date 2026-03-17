import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_FILE = path.join(__dirname, 'data', 'licenses.json');
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 60;
const EU_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
]);

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

function withJsonHeaders(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
    body: JSON.stringify(body),
  };
}

export function normalizePlan(plan) {
  if (typeof plan !== 'string') {
    throw new Error('plan is required');
  }

  const normalized = plan.trim().toLowerCase();
  if (normalized === 'monthly' || normalized === 'pro-monthly' || normalized === 'pro') {
    return 'monthly';
  }

  if (normalized === 'lifetime' || normalized === 'pro-lifetime') {
    return 'lifetime';
  }

  throw new Error(`Unsupported plan: ${plan}`);
}

export function getCountryBucket(country) {
  const normalized = typeof country === 'string' ? country.trim().toUpperCase() : '';
  if (normalized === 'IN') {
    return 'IN';
  }

  if (normalized === 'US' || EU_COUNTRIES.has(normalized)) {
    return 'US';
  }

  return 'OTHER';
}

export function buildPriceIds(env = process.env) {
  return {
    monthly: {
      IN: env.STRIPE_PRICE_MONTHLY_IN ?? 'price_monthly_in',
      US: env.STRIPE_PRICE_MONTHLY_US ?? 'price_monthly_us',
      OTHER: env.STRIPE_PRICE_MONTHLY_OTHER ?? 'price_monthly_other',
    },
    lifetime: {
      IN: env.STRIPE_PRICE_LIFETIME_IN ?? 'price_lifetime_in',
      US: env.STRIPE_PRICE_LIFETIME_US ?? 'price_lifetime_us',
      OTHER: env.STRIPE_PRICE_LIFETIME_OTHER ?? 'price_lifetime_other',
    },
  };
}

export function selectPriceId(plan, country, priceIds = buildPriceIds()) {
  const normalizedPlan = normalizePlan(plan);
  const bucket = getCountryBucket(country);
  return priceIds[normalizedPlan][bucket];
}

async function readRawBody(request, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      throw new HttpError(413, `Request body exceeds ${maxBytes} bytes`);
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

async function readJsonBody(request) {
  const rawBody = (await readRawBody(request)).toString('utf8');
  if (rawBody.length === 0) {
    return {};
  }

  return JSON.parse(rawBody);
}

function assertInstallationId(installationId) {
  if (typeof installationId !== 'string' || installationId.trim().length === 0) {
    throw new Error('installationId is required');
  }

  return installationId;
}

function assertHttpUrl(value, envName, env = process.env) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${envName} is required`);
  }

  const url = new URL(value);
  const isLocalhost = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if ((env.SNAPVAULT_ENV ?? 'development') === 'production' && url.protocol !== 'https:' && !isLocalhost) {
    throw new Error(`${envName} must use https in production`);
  }

  return url.toString();
}

export function validateRuntimeEnv(env = process.env) {
  const requiredKeys = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_MONTHLY_IN',
    'STRIPE_PRICE_MONTHLY_US',
    'STRIPE_PRICE_MONTHLY_OTHER',
    'STRIPE_PRICE_LIFETIME_IN',
    'STRIPE_PRICE_LIFETIME_US',
    'STRIPE_PRICE_LIFETIME_OTHER',
    'SNAPVAULT_CHECKOUT_SUCCESS_URL',
    'SNAPVAULT_CHECKOUT_CANCEL_URL',
  ];

  const missingKeys = requiredKeys.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missingKeys.length > 0) {
    throw new Error(`Missing required licensing env vars: ${missingKeys.join(', ')}`);
  }

  assertHttpUrl(env.SNAPVAULT_CHECKOUT_SUCCESS_URL, 'SNAPVAULT_CHECKOUT_SUCCESS_URL', env);
  assertHttpUrl(env.SNAPVAULT_CHECKOUT_CANCEL_URL, 'SNAPVAULT_CHECKOUT_CANCEL_URL', env);
}

export async function createJsonLicenseStore(filePath = DEFAULT_DATA_FILE) {
  let writeQueue = Promise.resolve();

  async function readState() {
    try {
      const raw = await readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return {};
      }

      throw error;
    }
  }

  async function writeState(state) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tempFilePath = `${filePath}.tmp`;
    await writeFile(tempFilePath, JSON.stringify(state, null, 2), 'utf8');
    await rename(tempFilePath, filePath);
  }

  return {
    async get(installationId) {
      const state = await readState();
      return state[installationId] ?? null;
    },
    async upsert(licenseState) {
      const installationId = assertInstallationId(licenseState.installationId);
      await (writeQueue = writeQueue.then(async () => {
        const state = await readState();
        state[installationId] = licenseState;
        await writeState(state);
      }));
      return licenseState;
    },
  };
}

export function createRateLimiter({
  maxRequests = DEFAULT_RATE_LIMIT_MAX,
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
} = {}) {
  const hits = new Map();

  return {
    check(key) {
      const now = Date.now();
      const current = hits.get(key);
      if (!current || current.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return;
      }

      if (current.count >= maxRequests) {
        throw new HttpError(429, 'Too many requests');
      }

      current.count += 1;
    },
  };
}

function getRequestIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  return request.socket?.remoteAddress ?? 'unknown';
}

export async function handleCheckoutRequest(body, deps) {
  const installationId = assertInstallationId(body.installationId);
  const normalizedPlan = normalizePlan(body.plan);
  const priceId = selectPriceId(normalizedPlan, body.country, deps.priceIds);
  const session = await deps.stripe.checkout.sessions.create({
    mode: normalizedPlan === 'lifetime' ? 'payment' : 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: deps.successUrl,
    cancel_url: deps.cancelUrl,
    metadata: {
      installationId,
      plan: normalizedPlan,
      country: getCountryBucket(body.country),
    },
  });

  if (!session?.url) {
    throw new Error('Stripe checkout session missing url');
  }

  return { url: session.url };
}

export async function handleSyncRequest(body, deps) {
  const installationId = assertInstallationId(body.installationId);
  const licenseState = await deps.store.get(installationId);
  return licenseState ?? { status: 'free', installationId };
}

function buildLicenseStateFromSession(session) {
  const installationId = assertInstallationId(session?.metadata?.installationId);
  const plan = normalizePlan(session?.metadata?.plan ?? 'monthly');
  const expiresAt =
    typeof session?.subscriptionDetails?.currentPeriodEnd === 'number'
      ? new Date(session.subscriptionDetails.currentPeriodEnd * 1000).toISOString()
      : undefined;

  return {
    status: 'pro',
    plan,
    ...(expiresAt ? { expiresAt } : {}),
    installationId,
  };
}

export async function handleWebhookRequest(rawBody, signature, deps) {
  const event = deps.stripe.webhooks.constructEvent(
    rawBody,
    signature,
    deps.webhookSecret,
  );

  if (event.type === 'checkout.session.completed') {
    const licenseState = buildLicenseStateFromSession(event.data.object);
    await deps.store.upsert(licenseState);
  }

  return { received: true };
}

export function createLicensingRequestHandler(deps) {
  return async function licensingHandler(request, response) {
    try {
      if (request.method === 'GET' && request.url === '/healthz') {
        const result = withJsonHeaders(200, { ok: true });
        response.writeHead(result.statusCode, result.headers);
        response.end(result.body);
        return;
      }

      if (request.method === 'POST') {
        deps.rateLimiter?.check(getRequestIp(request));
      }

      if (request.method === 'POST' && request.url === '/v1/licensing/checkout') {
        const body = await readJsonBody(request);
        const payload = await handleCheckoutRequest(body, deps);
        const result = withJsonHeaders(200, payload);
        response.writeHead(result.statusCode, result.headers);
        response.end(result.body);
        return;
      }

      if (request.method === 'POST' && request.url === '/v1/licensing/sync') {
        const body = await readJsonBody(request);
        const payload = await handleSyncRequest(body, deps);
        const result = withJsonHeaders(200, payload);
        response.writeHead(result.statusCode, result.headers);
        response.end(result.body);
        return;
      }

      if (request.method === 'POST' && request.url === '/v1/licensing/webhook') {
        const rawBody = await readRawBody(request);
        const signature = request.headers['stripe-signature'];
        if (typeof signature !== 'string' || signature.length === 0) {
          const result = withJsonHeaders(400, { error: 'Missing Stripe signature' });
          response.writeHead(result.statusCode, result.headers);
          response.end(result.body);
          return;
        }

        try {
          const payload = await handleWebhookRequest(rawBody, signature, deps);
          const result = withJsonHeaders(200, payload);
          response.writeHead(result.statusCode, result.headers);
          response.end(result.body);
        } catch (error) {
          const result = withJsonHeaders(400, {
            error: error instanceof Error ? error.message : String(error),
          });
          response.writeHead(result.statusCode, result.headers);
          response.end(result.body);
        }
        return;
      }

      const result = withJsonHeaders(404, { error: 'Not found' });
      response.writeHead(result.statusCode, result.headers);
      response.end(result.body);
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      const result = withJsonHeaders(statusCode, {
        error: error instanceof Error ? error.message : String(error),
      });
      response.writeHead(result.statusCode, result.headers);
      response.end(result.body);
    }
  };
}

export function createLicensingServer(deps) {
  return createServer(createLicensingRequestHandler(deps));
}

export async function createStripeFromEnv(env = process.env) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is required');
  }

  const { default: Stripe } = await import('stripe');
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export async function createRuntimeDeps(env = process.env) {
  validateRuntimeEnv(env);
  const stripe = await createStripeFromEnv(env);
  const store = await createJsonLicenseStore(env.SNAPVAULT_LICENSE_DB_FILE ?? DEFAULT_DATA_FILE);

  return {
    stripe,
    store,
    rateLimiter: createRateLimiter({
      maxRequests: Number(env.SNAPVAULT_LICENSING_RATE_LIMIT_MAX ?? DEFAULT_RATE_LIMIT_MAX),
      windowMs: Number(env.SNAPVAULT_LICENSING_RATE_LIMIT_WINDOW_MS ?? DEFAULT_RATE_LIMIT_WINDOW_MS),
    }),
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    successUrl: assertHttpUrl(env.SNAPVAULT_CHECKOUT_SUCCESS_URL, 'SNAPVAULT_CHECKOUT_SUCCESS_URL', env),
    cancelUrl: assertHttpUrl(env.SNAPVAULT_CHECKOUT_CANCEL_URL, 'SNAPVAULT_CHECKOUT_CANCEL_URL', env),
    priceIds: buildPriceIds(env),
  };
}

async function startServer() {
  const port = Number(process.env.PORT ?? 8787);
  const deps = await createRuntimeDeps(process.env);
  const server = createLicensingServer(deps);

  server.listen(port, () => {
    console.log(`SnapVault licensing server listening on http://127.0.0.1:${port}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
