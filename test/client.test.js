import { test } from "node:test";
import assert from "node:assert/strict";
import { ChainkitClient, ChainkitApiError } from "../dist/index.js";

const PROJECT = "22222222-2222-2222-2222-222222222222";

/** Builds a client whose fetch records the last call and returns `responder()`. */
function clientWith(responder) {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  const ck = new ChainkitClient({
    apiKey: "ck_live_abc",
    projectId: PROJECT,
    baseUrl: "https://api.example.test",
    fetch: fakeFetch,
  });
  return { ck, calls };
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("invoices.create posts to the project-scoped URL with bearer auth and unwraps the envelope", async () => {
  const { ck, calls } = clientWith(() => json(201, { invoice: { id: "inv_1", status: "pending" } }));
  const inv = await ck.invoices.create({ xpub_id: "x1", amount_sats: 50_000, fiat_currency: "EUR" });

  assert.equal(inv.id, "inv_1");
  const { url, init } = calls[0];
  assert.equal(url, `https://api.example.test/v1/projects/${PROJECT}/payments/invoices`);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer ck_live_abc");
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), {
    xpub_id: "x1",
    amount_sats: 50_000,
    fiat_currency: "EUR",
  });
});

test("invoices.list passes status + limit as query params", async () => {
  const { ck, calls } = clientWith(() => json(200, { invoices: [] }));
  await ck.invoices.list({ status: "paid", limit: 50 });
  assert.equal(
    calls[0].url,
    `https://api.example.test/v1/projects/${PROJECT}/payments/invoices?status=paid&limit=50`,
  );
});

test("xpubs.verify posts the address and resolves on 204", async () => {
  const { ck, calls } = clientWith(() => new Response(null, { status: 204 }));
  await ck.xpubs.verify("xp1", "bc1qexample");
  assert.equal(
    calls[0].url,
    `https://api.example.test/v1/projects/${PROJECT}/payments/xpubs/xp1/verify`,
  );
  assert.deepEqual(JSON.parse(calls[0].init.body), { address: "bc1qexample" });
});

test("non-2xx maps to ChainkitApiError with stable code + detail", async () => {
  const { ck } = clientWith(() =>
    json(402, { error: "invoice_monthly_cap_hit", detail: "Free plan allows 25/mo" }),
  );
  await assert.rejects(
    () => ck.invoices.create({ xpub_id: "x1" }),
    (e) => {
      assert.ok(e instanceof ChainkitApiError);
      assert.equal(e.status, 402);
      assert.equal(e.code, "invoice_monthly_cap_hit");
      assert.equal(e.detail, "Free plan allows 25/mo");
      return true;
    },
  );
});

test("constructor validates required options", () => {
  assert.throws(() => new ChainkitClient({ apiKey: "", projectId: PROJECT }), /apiKey is required/);
  assert.throws(() => new ChainkitClient({ apiKey: "k", projectId: "" }), /projectId is required/);
});
