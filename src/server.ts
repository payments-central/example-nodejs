import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { PaymentsCentralClient } from './client.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Client setup
// ---------------------------------------------------------------------------

const apiKey = process.env.PAYMENTS_CENTRAL_API_KEY;
const merchantId = process.env.PAYMENTS_CENTRAL_MERCHANT_ID;

if (!apiKey || !merchantId) {
  console.error('Missing required env vars: PAYMENTS_CENTRAL_API_KEY, PAYMENTS_CENTRAL_MERCHANT_ID');
  process.exit(1);
}

const client = new PaymentsCentralClient({
  apiKey,
  merchantId,
  baseUrl: process.env.PAYMENTS_CENTRAL_BASE_URL,
});

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

app.get('/', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payments Central — Node.js Demo</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px; color: #111; }
    h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
    p  { color: #555; margin-top: 0; }
    ul { list-style: none; padding: 0; }
    li { margin: 10px 0; }
    a  { color: #0055cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .method { display: inline-block; width: 48px; font-size: 0.75em; font-weight: 700;
              text-transform: uppercase; color: #fff; border-radius: 3px; padding: 2px 6px;
              margin-right: 6px; text-align: center; }
    .get  { background: #16a34a; }
    .post { background: #2563eb; }
  </style>
</head>
<body>
  <h1>Payments Central — Node.js Demo</h1>
  <p>Use the routes below to explore the API. Each route calls Payments Central and returns JSON (or redirects).</p>
  <ul>
    <li><span class="method post">POST</span><a href="#" onclick="post('/demo/charge')">/demo/charge</a> — charge $10.00 USD</li>
    <li><span class="method get">GET</span> <a href="/demo/transactions">/demo/transactions</a> — list last 10 transactions</li>
    <li><span class="method get">GET</span> <a href="/demo/transaction/REPLACE_ID">/demo/transaction/:id</a> — get a transaction by ID</li>
    <li><span class="method post">POST</span><a href="#" onclick="post('/demo/refund/REPLACE_ID')">/demo/refund/:id</a> — refund a transaction</li>
    <li><span class="method post">POST</span><a href="#" onclick="post('/demo/checkout')">/demo/checkout</a> — create checkout session &amp; redirect</li>
  </ul>
  <p style="margin-top:2rem;font-size:0.85em">
    POST routes can be triggered via <code>curl</code> or the buttons above (which use <code>fetch</code>).
    See the <a href="https://developer.payments-central.com" target="_blank">full API docs</a>.
  </p>
  <script>
    async function post(path) {
      try {
        const res = await fetch(path, { method: 'POST' });
        const data = await res.json().catch(() => res.text());
        alert(JSON.stringify(data, null, 2));
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  </script>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Demo routes
// ---------------------------------------------------------------------------

app.post('/demo/charge', async (_req: Request, res: Response) => {
  try {
    const transaction = await client.charge({
      amount: 1000, // $10.00 in minor units (cents)
      currency: 'USD',
      gateway: 'stripe',
      merchant_ref: `demo-${Date.now()}`,
      description: 'Demo charge from Payments Central Node.js sample',
    });
    res.json(transaction);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.get('/demo/transactions', async (_req: Request, res: Response) => {
  try {
    const result = await client.listTransactions(1, 10);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.get('/demo/transaction/:id', async (req: Request, res: Response) => {
  try {
    const transaction = await client.getTransaction(req.params.id);
    res.json(transaction);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.post('/demo/refund/:id', async (req: Request, res: Response) => {
  try {
    // core requires an explicit refund amount (minor units); fetch the
    // transaction first so we can issue a full refund for its amount.
    const tx = await client.getTransaction(req.params.id);
    const refund = await client.refund(req.params.id, {
      amount: tx.amount,
      reason: 'Demo refund from Payments Central Node.js sample',
    });
    res.json(refund);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.post('/demo/checkout', async (req: Request, res: Response) => {
  const port = process.env.PORT ?? '3000';
  const base = `http://localhost:${port}`;

  try {
    const session = await client.createCheckoutSession({
      amount: 2500, // $25.00 in minor units (cents)
      currency: 'USD',
      gateway: 'stripe', // core requires a gateway
      description: 'Demo checkout from Payments Central Node.js sample',
      success_url: `${base}/demo/success`,
      cancel_url: `${base}/demo/cancel`,
      type: 'payment',
    });
    res.redirect(session.checkout_url);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Checkout landing pages
// ---------------------------------------------------------------------------

app.get('/demo/success', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Payment completed</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;margin-top:100px;color:#111}
h1{color:#16a34a}a{color:#0055cc}</style></head>
<body>
  <h1>Payment completed!</h1>
  <p>Your payment was processed successfully.</p>
  <p><a href="/">Back to demo</a></p>
</body>
</html>`);
});

app.get('/demo/cancel', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Payment cancelled</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;margin-top:100px;color:#111}
h1{color:#dc2626}a{color:#0055cc}</style></head>
<body>
  <h1>Payment cancelled</h1>
  <p>You cancelled the checkout. No charge was made.</p>
  <p><a href="/">Back to demo</a></p>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Payments Central demo running at http://localhost:${PORT}`);
});
