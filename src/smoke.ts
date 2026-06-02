/**
 * CI smoke test (no secrets required).
 *
 * Boots a recorded mock of the Payments Central core API that ASSERTS every
 * outgoing request matches core's current contract, then drives the real demo
 * server (src/server.ts) through the full flow:
 *
 *   charge -> list -> get -> refund -> hosted checkout
 *
 * The refund leg drives the full money lifecycle the way UAT requires
 * (RED-52): charge -> authorize -> capture -> refund. The mock asserts the
 * authorize and capture calls happen before refund so the example can never
 * regress to refunding a `pending` charge directly.
 *
 * If the example ever drifts from the API (wrong query params, missing
 * `gateway`, missing refund `amount`, skipped authorize/capture, etc.) the
 * relevant assertion fails and this process exits non-zero, breaking CI loudly.
 */
import express, { type Request, type Response } from 'express';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { PaymentsCentralClient } from './client.js';

const MOCK_PORT = 4011;
const APP_PORT = 4010;
const APP_BASE = `http://127.0.0.1:${APP_PORT}`;

const failures: string[] = [];
function check(cond: unknown, msg: string): void {
  if (!cond) failures.push(msg);
}

const TX = {
  id: 'txn_smoke_1',
  amount: 1000,
  currency: 'USD',
  status: 'completed',
  gateway: 'stripe',
  merchant_ref: 'demo-smoke',
  description: 'smoke',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// Tracks the lifecycle so the refund assertion can prove authorize + capture
// ran first (charge -> authorize -> capture -> refund), matching UAT (RED-52).
const calls = { authorize: 0, capture: 0 };

// Records the decoded id Express saw on the most recent GET /:id call so the
// RED-96 parity check can prove the client encodeURIComponent's the id.
let lastGetId: string | null = null;

function startMock(): Promise<ReturnType<typeof app.listen>> {
  const app = express();
  app.use(express.json());

  // Auth headers must be present on every call.
  app.use((req, _res, next) => {
    check(
      String(req.headers['authorization'] ?? '').startsWith('Bearer '),
      `${req.method} ${req.path}: missing "Authorization: Bearer" header`,
    );
    check(!!req.headers['x-merchant-id'], `${req.method} ${req.path}: missing x-merchant-id header`);
    next();
  });

  app.post('/api/v1/transactions/charge', (req: Request, res: Response) => {
    const { amount, currency, gateway } = req.body ?? {};
    check(typeof amount === 'number' && amount > 0, 'charge: amount must be a positive number (minor units)');
    check(!!currency, 'charge: currency required');
    check(!!gateway, 'charge: gateway required');
    res.status(201).json({ ...TX, amount, currency, gateway });
  });

  app.get('/api/v1/transactions', (req: Request, res: Response) => {
    check('page' in req.query, 'list: missing `page` query param (core paginates with page/limit)');
    check('limit' in req.query, 'list: missing `limit` query param');
    check(!('offset' in req.query), 'list: `offset` is not a core param and must not be sent');
    res.json({ data: [TX], total: 1, page: Number(req.query.page), limit: Number(req.query.limit) });
  });

  app.get('/api/v1/transactions/:id', (req: Request, res: Response) => {
    lastGetId = req.params.id;
    res.json(TX);
  });

  // pending -> authorized. `gateway_ref` is optional (core mints one).
  app.post('/api/v1/transactions/:id/authorize', (_req: Request, res: Response) => {
    calls.authorize++;
    res.json({ ...TX, status: 'authorized' });
  });

  // authorized -> captured. core captures the full authorized amount.
  app.post('/api/v1/transactions/:id/capture', (_req: Request, res: Response) => {
    check(calls.authorize > 0, 'capture: must be preceded by an authorize call');
    calls.capture++;
    res.json({ ...TX, status: 'captured' });
  });

  app.post('/api/v1/transactions/:id/refund', (req: Request, res: Response) => {
    // core only refunds captured/settled tx, so the example MUST authorize+capture first.
    check(calls.authorize > 0, 'refund: must be preceded by an authorize call (charge -> authorize -> capture -> refund)');
    check(calls.capture > 0, 'refund: must be preceded by a capture call (core only refunds captured/settled transactions)');
    check(typeof req.body?.amount === 'number', 'refund: core requires a numeric `amount`');
    res.json({ ...TX, status: 'refunded' });
  });

  app.post('/api/v1/checkout/sessions', (req: Request, res: Response) => {
    const { amount, currency, gateway, success_url, cancel_url } = req.body ?? {};
    check(typeof amount === 'number' && amount > 0, 'checkout: amount must be a positive number');
    check(!!currency, 'checkout: currency required');
    check(!!gateway, 'checkout: gateway required');
    check(!!success_url, 'checkout: success_url required');
    check(!!cancel_url, 'checkout: cancel_url required');
    res.json({
      session_id: 'cs_smoke',
      checkout_url: `http://127.0.0.1:${MOCK_PORT}/pay?s=cs_smoke`,
      type: req.body?.type ?? 'redirect',
      expires_at: '2026-01-01T01:00:00.000Z',
    });
  });

  return new Promise((resolve) => {
    const server = app.listen(MOCK_PORT, () => resolve(server));
  });
}

async function waitForApp(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${APP_BASE}/`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error('demo server did not start in time');
}

async function expectOk(method: string, path: string, label: string): Promise<void> {
  const r = await fetch(`${APP_BASE}${path}`, { method, redirect: 'manual' });
  // checkout redirects (3xx); everything else should be 2xx.
  const ok = r.status >= 200 && r.status < 400;
  check(ok, `${label}: demo route ${method} ${path} returned HTTP ${r.status}`);
}

// RED-96 parity check: the client must encodeURIComponent the id on every
// /:id/... path (matching the PHP client's rawurlencode). API-minted UUIDs are
// unaffected, so we probe with an id containing a reserved char (`#`). Without
// encoding, fetch treats `#...` as a URL fragment and drops it, so the mock
// would see `txn` instead of `txn#smoke`; the encoded `%23` round-trips intact.
async function checkIdEncoding(): Promise<void> {
  const client = new PaymentsCentralClient({
    apiKey: 'sk_sandbox_smoke',
    merchantId: 'mer_smoke',
    baseUrl: `http://127.0.0.1:${MOCK_PORT}`,
  });
  const probeId = 'txn#smoke 96';
  lastGetId = null;
  await client.getTransaction(probeId);
  check(
    lastGetId === probeId,
    `id encoding: client must encodeURIComponent the id on /:id paths ` +
      `(expected mock to receive "${probeId}", saw "${lastGetId}")`,
  );
}

async function main(): Promise<void> {
  const mock = await startMock();

  const app: ChildProcess = spawn(process.execPath, ['dist/server.js'], {
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      PAYMENTS_CENTRAL_API_KEY: 'sk_sandbox_smoke',
      PAYMENTS_CENTRAL_MERCHANT_ID: 'mer_smoke',
      PAYMENTS_CENTRAL_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    },
    stdio: 'inherit',
  });

  try {
    await waitForApp();
    await expectOk('POST', '/demo/charge', 'charge');
    await expectOk('GET', '/demo/transactions', 'list');
    await expectOk('GET', `/demo/transaction/${TX.id}`, 'get');
    await expectOk('POST', `/demo/refund/${TX.id}`, 'refund');
    await expectOk('POST', '/demo/checkout', 'checkout');
    await checkIdEncoding();
  } finally {
    app.kill();
    mock.close();
  }

  if (failures.length > 0) {
    console.error('\nSMOKE FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nSMOKE PASSED: charge -> list -> get -> refund -> checkout all match the core API contract.');
}

main().catch((err) => {
  console.error('SMOKE ERROR:', err);
  process.exit(1);
});
