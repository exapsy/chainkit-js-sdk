// Wire types for the ChainKit merchant payments API.
//
// Field names mirror the JSON on the wire (snake_case) so this SDK is a
// faithful, low-surprise reflection of the OpenAPI spec and the webhook
// payload — what you read in these objects is exactly what the API
// docs describe. Kept hand-written (rather than generated) because the
// surface is small and a clean, stable shape matters more than codegen
// churn; regenerate-from-spec is the future maintenance path.

/** Lifecycle status of an invoice. */
export type InvoiceStatus =
  | "pending"
  | "partial"
  | "paid"
  | "confirmed"
  | "expired"
  | "cancelled"
  | "refunded";

/** Webhook event types ChainKit emits. */
export type WebhookEvent =
  | "invoice.partial"
  | "invoice.paid"
  | "invoice.confirmed"
  | "invoice.expired"
  | "invoice.cancelled";

export interface Invoice {
  id: string;
  project_id: string;
  /** Embed in the customer URL: `https://api.chainkit.dev/p/{public_id}`. */
  public_id: string;
  address: string;
  amount_sats: number;
  fiat_currency: string;
  rate_snapshot?: string;
  subtotal_fiat_cents: number;
  tax_rate_bps: number;
  tax_fiat_cents: number;
  total_fiat_cents: number;
  tax_inclusive: boolean;
  tax_label?: string;
  memo?: string;
  metadata?: unknown;
  status: InvoiceStatus;
  customer_email?: string;
  customer_name?: string;

  merchant_name: string;
  merchant_address: string;
  merchant_country: string;
  merchant_vat_id?: string;
  merchant_email_from?: string;
  merchant_logo_url?: string;
  merchant_receipt_footer?: string;

  expires_at: string;
  paid_at?: string;
  confirmed_at?: string;
  confirmations: number;
  txids: string[];
  received_sats: number;

  /**
   * Safe-to-fulfill signal. `true` only once `status === "confirmed"`
   * (received >= amount AND confirmations >= the configured threshold).
   * A `paid` invoice may still be a 0-conf mempool payment that can be
   * double-spent — never release goods while `is_final` is `false`.
   */
  is_final: boolean;
  /** `received_sats - amount_sats`, clamped at 0 — overpayment amount. */
  excess_sats: number;
  /** Convenience flag, equals `excess_sats > 0`. */
  overpaid: boolean;

  coin: string;
  network: string;
  explorer_tx_base?: string;

  source: string;
  created_at: string;
  updated_at: string;
}

export interface CreateInvoiceParams {
  /** UUID of the registered xpub to derive the receive address from. */
  xpub_id: string;
  amount_sats?: number;
  fiat_currency?: string;
  rate_snapshot?: string;
  subtotal_fiat_cents?: number;
  tax_rate_bps?: number;
  tax_label?: string;
  tax_inclusive?: boolean;
  memo?: string;
  customer_email?: string;
  customer_name?: string;
  /** Go-flavoured duration, e.g. "15m", "1h", "24h". Defaults to the cloud config. */
  expires_in?: string;
}

export interface ListInvoicesParams {
  status?: InvoiceStatus;
  /** 1–500, default 100. */
  limit?: number;
}

export interface Xpub {
  id: string;
  label: string;
  coin: string;
  network: string;
  xpub: string;
  derivation_path: string;
  fingerprint: string;
  created_at: string;
  /** Non-null once ownership is confirmed via `xpubs.verify`. */
  verified_at: string | null;
}

export interface RegisterXpubParams {
  label: string;
  /** Extended PUBLIC key (xpub/ypub/zpub or testnet tpub/upub/vpub). */
  xpub: string;
  coin?: "bitcoin";
  network?: "mainnet" | "testnet" | "regtest";
  /** Display-only; inferred from the xpub prefix when omitted. */
  derivation_path?: string;
}

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  created_at: string;
}

/** Returned by `webhooks.create` — `secret` is shown exactly once. */
export interface WebhookCreated extends Webhook {
  /**
   * Store this securely. It cannot be retrieved later and is required
   * to verify incoming deliveries via {@link verifyWebhook}.
   */
  secret: string;
}

export interface CreateWebhookParams {
  /** Must be https:// in production. */
  url: string;
  events: WebhookEvent[];
}

/** The JSON body POSTed to a subscribed endpoint on each transition. */
export interface WebhookPayload {
  /** Stable per-delivery key — dedupe retries on this. */
  delivery_id: string;
  event_type: WebhookEvent;
  occurred_at: string;
  invoice: Invoice;
}
