# @chainkit/sdk

Official TypeScript/JavaScript SDK for the [ChainKit](https://chainkit.dev) non-custodial Bitcoin payments API.

- **Non-custodial** — you register an extended *public* key; funds settle directly to your wallet. ChainKit never holds keys or coins.
- **Typed** — invoices, xpubs, and webhooks with full TypeScript types.
- **Zero runtime dependencies** — native `fetch` + Node `crypto`.
- **Webhook verification built in** — HMAC-SHA256, constant-time, replay-protected.

## Install

```bash
npm install @chainkit/sdk
```

Requires Node 18+ (or any runtime with a global `fetch`). Webhook verification uses `node:crypto`.

## Quickstart — first invoice in 5 minutes

```ts
import { ChainkitClient } from "@chainkit/sdk";

const ck = new ChainkitClient({
  apiKey: process.env.CHAINKIT_API_KEY!, // ck_live_... — Project → Settings → API keys
  projectId: process.env.CHAINKIT_PROJECT_ID!,
});

// 1. Register your wallet's extended PUBLIC key.
const xpub = await ck.xpubs.register({ label: "Cold wallet", xpub: "zpub6r..." });

// 2. Prove you control it — paste any receive address your wallet shows.
await ck.xpubs.verify(xpub.id, "bc1q...");

// 3. Issue an invoice.
const invoice = await ck.invoices.create({
  xpub_id: xpub.id,
  amount_sats: 50_000,
  fiat_currency: "EUR",
  customer_email: "buyer@example.com",
});

console.log(`Pay at https://api.chainkit.dev/p/${invoice.public_id}`);
```

See [`examples/quickstart.ts`](./examples/quickstart.ts) for the full flow.

## Receiving webhooks

ChainKit POSTs a signed JSON body on each invoice transition. **Verify the signature against the raw bytes** — never re-serialize the parsed JSON first.

```ts
import express from "express";
import { verifyWebhook } from "@chainkit/sdk";

const app = express();

app.post("/webhooks/chainkit", express.raw({ type: "*/*" }), (req, res) => {
  try {
    const event = verifyWebhook({
      body: req.body, // Buffer — raw bytes
      signature: req.header("X-Chainkit-Signature")!,
      secret: process.env.CHAINKIT_WEBHOOK_SECRET!,
    });

    // Fulfill ONLY when the payment is final. `invoice.paid` may be a
    // 0-conf mempool payment that can still be double-spent.
    if (event.event_type === "invoice.confirmed") {
      fulfillOrder(event.invoice);
    }
    res.sendStatus(200);
  } catch {
    res.sendStatus(400); // bad signature / expired — do not retry-trust it
  }
});
```

`verifyWebhook` throws `WebhookVerificationError` on a missing/malformed header, an expired timestamp (default tolerance 300s, set `toleranceSeconds`), or a signature mismatch.

## API

```ts
const ck = new ChainkitClient({ apiKey, projectId, baseUrl?, timeoutMs?, fetch? });

// Invoices
await ck.invoices.create(params);   // → Invoice
await ck.invoices.get(id);          // → Invoice
await ck.invoices.list({ status?, limit? }); // → Invoice[]
await ck.invoices.cancel(id);       // → Invoice

// Wallets (xpubs)
await ck.xpubs.register({ label, xpub, network? }); // → Xpub
await ck.xpubs.verify(xpubId, address);             // → void (throws address_mismatch)
await ck.xpubs.list();                              // → Xpub[]
await ck.xpubs.revoke(xpubId);                      // → void

// Webhooks
await ck.webhooks.create({ url, events });  // → WebhookCreated (secret shown once)
await ck.webhooks.list();                   // → Webhook[]
await ck.webhooks.delete(webhookId);        // → void
```

### Errors

Non-2xx responses throw `ChainkitApiError` with a stable `code` (the API's `error` sentinel, safe to switch on), an HTTP `status`, and a human `detail`:

```ts
import { ChainkitApiError } from "@chainkit/sdk";

try {
  await ck.invoices.create({ xpub_id });
} catch (e) {
  if (e instanceof ChainkitApiError && e.code === "invoice_monthly_cap_hit") {
    // prompt the merchant to upgrade
  }
}
```

### The `paid` vs `confirmed` contract

| Status | Meaning | Safe to fulfill? |
| ------ | ------- | ---------------- |
| `paid` | received ≥ amount but below the confirmation threshold (may be 0-conf mempool) | **No** |
| `confirmed` (`is_final === true`) | received ≥ amount AND enough confirmations | **Yes** |

Overpayments surface as `invoice.excess_sats` / `invoice.overpaid`.

## Field naming

Object fields mirror the API wire format (`snake_case`) so the SDK matches the [OpenAPI spec](https://api.chainkit.dev) and the webhook payload exactly.

## Development

```bash
npm install
npm run build      # tsc → dist/
npm test           # node --test (tests run against dist/)
npm run typecheck
```

## License

MIT
