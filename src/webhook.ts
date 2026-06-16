import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookVerificationError } from "./errors.js";
import type { WebhookPayload } from "./types.js";

export interface VerifyWebhookOptions {
  /** The raw request body, EXACTLY as received (string or bytes). Do NOT re-serialize parsed JSON. */
  body: string | Uint8Array;
  /** The `X-Chainkit-Signature` header value (`t=<unix>,v1=<hex>`). */
  signature: string;
  /** The webhook's signing secret (from `webhooks.create`). */
  secret: string;
  /** Reject deliveries whose timestamp is older/newer than this many seconds. Default 300. Set 0 to disable. */
  toleranceSeconds?: number;
  /** Injectable clock for tests (Unix seconds). Defaults to Date.now(). */
  nowSeconds?: number;
}

/**
 * Verifies a ChainKit webhook signature and returns the parsed payload.
 * Throws {@link WebhookVerificationError} on any failure — missing or
 * malformed header, expired timestamp, or signature mismatch.
 *
 * The signature is `HMAC_SHA256(secret, "<t>." + raw_body)`. You MUST
 * pass the raw body bytes you received; re-serialized JSON (reordered
 * keys / whitespace) will not match.
 *
 * @example
 * // Express:
 * app.post("/webhooks/chainkit", express.raw({ type: "*\/*" }), (req, res) => {
 *   try {
 *     const event = verifyWebhook({
 *       body: req.body,                              // Buffer (raw)
 *       signature: req.header("X-Chainkit-Signature")!,
 *       secret: process.env.CHAINKIT_WEBHOOK_SECRET!,
 *     });
 *     if (event.event_type === "invoice.confirmed") fulfill(event.invoice);
 *     res.sendStatus(200);
 *   } catch {
 *     res.sendStatus(400);
 *   }
 * });
 */
export function verifyWebhook(opts: VerifyWebhookOptions): WebhookPayload {
  const { body, signature, secret } = opts;
  const tolerance = opts.toleranceSeconds ?? 300;

  const { t, v1 } = parseSignatureHeader(signature);

  const bodyBytes = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  const mac = createHmac("sha256", secret);
  mac.update(`${t}.`);
  mac.update(bodyBytes);
  const expected = mac.digest("hex");

  if (!constantTimeEqualHex(expected, v1)) {
    throw new WebhookVerificationError("signature mismatch");
  }

  if (tolerance > 0) {
    const ts = Number(t);
    if (!Number.isFinite(ts)) {
      throw new WebhookVerificationError("non-numeric timestamp");
    }
    const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > tolerance) {
      throw new WebhookVerificationError(
        `timestamp outside tolerance (${Math.abs(now - ts)}s > ${tolerance}s)`,
      );
    }
  }

  try {
    return JSON.parse(bodyBytes.toString("utf8")) as WebhookPayload;
  } catch {
    throw new WebhookVerificationError("payload is not valid JSON");
  }
}

function parseSignatureHeader(header: string): { t: string; v1: string } {
  if (!header) throw new WebhookVerificationError("missing signature header");
  let t: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key === "t") t = val;
    else if (key === "v1") v1 = val;
  }
  if (!t || !v1) {
    throw new WebhookVerificationError("signature header missing t= or v1=");
  }
  return { t, v1 };
}

function constantTimeEqualHex(a: string, b: string): boolean {
  // Length differences leak nothing useful here, but timingSafeEqual
  // requires equal-length buffers, so guard first.
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
