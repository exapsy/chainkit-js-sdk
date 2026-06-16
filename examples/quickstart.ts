/**
 * ChainKit quickstart — first invoice in ~5 minutes.
 *
 * Prereqs:
 *   1. Create a project in the dashboard.
 *   2. Register your wallet's xpub and verify ownership (steps 1–2 below
 *      can also be done in the dashboard).
 *   3. Mint an API key at Project → Settings → API keys.
 *
 * Run:  CHAINKIT_API_KEY=ck_live_... CHAINKIT_PROJECT_ID=... node --experimental-strip-types examples/quickstart.ts
 */
import { ChainkitClient } from "../src/index.js";

const ck = new ChainkitClient({
  apiKey: process.env.CHAINKIT_API_KEY!,
  projectId: process.env.CHAINKIT_PROJECT_ID!,
});

async function main() {
  // 1. Register your wallet's extended PUBLIC key (xpub/ypub/zpub).
  const xpub = await ck.xpubs.register({
    label: "Cold wallet",
    xpub: process.env.CHAINKIT_XPUB!,
  });

  // 2. Prove you control it: paste any receive address your wallet shows.
  await ck.xpubs.verify(xpub.id, process.env.CHAINKIT_RECEIVE_ADDRESS!);

  // 3. Issue an invoice. The customer pays the on-chain `address`;
  //    funds settle directly to your wallet (non-custodial).
  const invoice = await ck.invoices.create({
    xpub_id: xpub.id,
    amount_sats: 50_000,
    fiat_currency: "EUR",
    customer_email: "buyer@example.com",
    memo: "Order #1001",
  });

  console.log(`Invoice ${invoice.id}`);
  console.log(`  Pay to:   ${invoice.address}`);
  console.log(`  Customer: https://api.chainkit.dev/p/${invoice.public_id}`);
  console.log(`  Status:   ${invoice.status} (is_final=${invoice.is_final})`);

  // 4. From here, subscribe to webhooks and verify them with
  //    verifyWebhook(...) — fulfill the order only when you receive
  //    `invoice.confirmed` / `is_final === true`, never on `paid`.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
