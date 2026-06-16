/**
 * Thrown when the API returns a non-2xx response. `code` is the stable
 * sentinel string from the API's `error` field (safe to switch on);
 * `detail` is the human-readable message (may change). `status` is the
 * HTTP status code.
 *
 * @example
 * try {
 *   await ck.invoices.create({ xpub_id });
 * } catch (e) {
 *   if (e instanceof ChainkitApiError && e.code === "invoice_monthly_cap_hit") {
 *     // prompt the merchant to upgrade their plan
 *   }
 * }
 */
export class ChainkitApiError extends Error {
  readonly status: number;
  /** Stable sentinel from the API `error` field, e.g. "invoice_not_found". */
  readonly code: string;
  readonly detail: string | undefined;

  constructor(status: number, code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ChainkitApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/** Thrown by {@link verifyWebhook} when a signature is missing, malformed, expired, or wrong. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}
