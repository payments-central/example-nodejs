# Payments Central — Node.js Example

A minimal Express + TypeScript app that demonstrates the core Payments Central API flows: charging a card, listing transactions, issuing refunds, and creating hosted checkout sessions. Clone it, drop in your sandbox credentials, and you'll have a working demo in under two minutes.

## Prerequisites

- Node.js 18 or later
- A [Payments Central](https://developer.payments-central.com) sandbox account (free)

## Setup

```bash
git clone <this-repo>
cd payments-central-example-nodejs

npm install

cp .env.example .env
# Open .env and fill in your API key and merchant ID

npm run dev
# → http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You'll see a simple page with links to each demo route.

## Demo routes

| Method | Route | What it does |
|--------|-------|--------------|
| `GET`  | `/` | Home page with links to all demo routes |
| `POST` | `/demo/charge` | Charges $10.00 USD and returns the transaction object |
| `GET`  | `/demo/transactions` | Lists the last 10 transactions |
| `GET`  | `/demo/transaction/:id` | Fetches a single transaction by ID |
| `POST` | `/demo/refund/:id` | Refunds a transaction (full amount) |
| `POST` | `/demo/checkout` | Creates a checkout session and redirects to the hosted payment page |
| `GET`  | `/demo/success` | Landing page shown after a successful checkout |
| `GET`  | `/demo/cancel` | Landing page shown after a cancelled checkout |

POST routes can be triggered with `curl`:

```bash
# Charge
curl -X POST http://localhost:3000/demo/charge

# Refund (replace with a real transaction ID from the charge above)
curl -X POST http://localhost:3000/demo/refund/txn_abc123

# Checkout session
curl -X POST http://localhost:3000/demo/checkout
```

## Project structure

```
src/
  types.ts    — TypeScript interfaces for all API objects
  client.ts   — PaymentsCentralClient class (thin fetch wrapper)
  server.ts   — Express app and demo route handlers
```

## Building for production

```bash
npm run build   # compiles TypeScript to dist/
npm start       # runs the compiled output
```

## Further reading

Full API reference: [https://developer.payments-central.com](https://developer.payments-central.com)
