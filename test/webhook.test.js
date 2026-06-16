import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhook, WebhookVerificationError } from "../dist/index.js";

const SECRET = "whsec_test_secret";

function sign(body, ts, secret = SECRET) {
  const mac = createHmac("sha256", secret);
  mac.update(`${ts}.`);
  mac.update(Buffer.from(body, "utf8"));
  return `t=${ts},v1=${mac.digest("hex")}`;
}

const samplePayload = JSON.stringify({
  delivery_id: "11111111-1111-1111-1111-111111111111",
  event_type: "invoice.confirmed",
  occurred_at: "2026-06-15T00:00:00Z",
  invoice: { id: "abc", status: "confirmed", is_final: true },
});

test("verifies a valid signature and returns the parsed payload", () => {
  const now = 1_750_000_000;
  const sig = sign(samplePayload, now);
  const event = verifyWebhook({ body: samplePayload, signature: sig, secret: SECRET, nowSeconds: now });
  assert.equal(event.event_type, "invoice.confirmed");
  assert.equal(event.invoice.is_final, true);
});

test("accepts a Buffer body identical to the string body", () => {
  const now = 1_750_000_000;
  const sig = sign(samplePayload, now);
  const event = verifyWebhook({
    body: Buffer.from(samplePayload, "utf8"),
    signature: sig,
    secret: SECRET,
    nowSeconds: now,
  });
  assert.equal(event.delivery_id, "11111111-1111-1111-1111-111111111111");
});

test("rejects a tampered body", () => {
  const now = 1_750_000_000;
  const sig = sign(samplePayload, now);
  assert.throws(
    () => verifyWebhook({ body: samplePayload + " ", signature: sig, secret: SECRET, nowSeconds: now }),
    WebhookVerificationError,
  );
});

test("rejects a wrong secret", () => {
  const now = 1_750_000_000;
  const sig = sign(samplePayload, now, "other_secret");
  assert.throws(
    () => verifyWebhook({ body: samplePayload, signature: sig, secret: SECRET, nowSeconds: now }),
    /signature mismatch/,
  );
});

test("rejects an expired timestamp", () => {
  const ts = 1_750_000_000;
  const sig = sign(samplePayload, ts);
  assert.throws(
    () =>
      verifyWebhook({
        body: samplePayload,
        signature: sig,
        secret: SECRET,
        nowSeconds: ts + 600, // 10 min later, default tolerance 300s
      }),
    /tolerance/,
  );
});

test("tolerance 0 disables the timestamp check", () => {
  const ts = 1_750_000_000;
  const sig = sign(samplePayload, ts);
  const event = verifyWebhook({
    body: samplePayload,
    signature: sig,
    secret: SECRET,
    nowSeconds: ts + 100_000,
    toleranceSeconds: 0,
  });
  assert.equal(event.event_type, "invoice.confirmed");
});

test("rejects a malformed header", () => {
  assert.throws(
    () => verifyWebhook({ body: samplePayload, signature: "garbage", secret: SECRET }),
    /missing t= or v1=/,
  );
});
