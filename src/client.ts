import { Http } from "./http.js";
import type {
  CreateInvoiceParams,
  CreateWebhookParams,
  Invoice,
  ListInvoicesParams,
  RegisterXpubParams,
  Webhook,
  WebhookCreated,
  Xpub,
} from "./types.js";

export interface ChainkitClientOptions {
  /** Project-scoped API key (`ck_live_...`), minted at Project → Settings → API keys. */
  apiKey: string;
  /** UUID of the project. The key's project must match this. */
  projectId: string;
  /** API root. Default `https://api.chainkit.dev`. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 30_000. */
  timeoutMs?: number;
  /** Override the fetch implementation (tests, proxies). Defaults to global fetch. */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.chainkit.dev";

/**
 * Client for the ChainKit merchant payments API.
 *
 * @example
 * const ck = new ChainkitClient({ apiKey: process.env.CHAINKIT_API_KEY!, projectId });
 * const invoice = await ck.invoices.create({ xpub_id, amount_sats: 50_000, fiat_currency: "EUR" });
 * console.log(`Pay at https://api.chainkit.dev/p/${invoice.public_id}`);
 */
export class ChainkitClient {
  readonly invoices: InvoicesResource;
  readonly xpubs: XpubsResource;
  readonly webhooks: WebhooksResource;

  constructor(options: ChainkitClientOptions) {
    if (!options.apiKey) throw new Error("ChainkitClient: apiKey is required");
    if (!options.projectId) throw new Error("ChainkitClient: projectId is required");
    const http = new Http({
      apiKey: options.apiKey,
      projectId: options.projectId,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: options.timeoutMs ?? 30_000,
      fetch: options.fetch ?? globalThis.fetch,
    });
    this.invoices = new InvoicesResource(http);
    this.xpubs = new XpubsResource(http);
    this.webhooks = new WebhooksResource(http);
  }
}

class InvoicesResource {
  constructor(private readonly http: Http) {}

  /** Issue a customer invoice. */
  async create(params: CreateInvoiceParams): Promise<Invoice> {
    const res = await this.http.request<{ invoice: Invoice }>("POST", "/invoices", { body: params });
    return res.invoice;
  }

  /** Read a single invoice by id. */
  async get(invoiceId: string): Promise<Invoice> {
    const res = await this.http.request<{ invoice: Invoice }>(
      "GET",
      `/invoices/${encodeURIComponent(invoiceId)}`,
    );
    return res.invoice;
  }

  /** List invoices newest-first, optionally filtered by status. */
  async list(params: ListInvoicesParams = {}): Promise<Invoice[]> {
    const res = await this.http.request<{ invoices: Invoice[] }>("GET", "/invoices", {
      query: { status: params.status, limit: params.limit },
    });
    return res.invoices;
  }

  /** Cancel a pending/partial invoice. Throws `invoice_invalid_transition` otherwise. */
  async cancel(invoiceId: string): Promise<Invoice> {
    const res = await this.http.request<{ invoice: Invoice }>(
      "POST",
      `/invoices/${encodeURIComponent(invoiceId)}/cancel`,
    );
    return res.invoice;
  }

  /**
   * Mark a paid/confirmed invoice as refunded, recording the on-chain
   * txid of the refund you sent. Non-custodial: ChainKit moves no funds
   * — you broadcast the refund from your own wallet, this records it.
   * Throws `invoice_invalid_transition` for non-refundable statuses.
   */
  async refund(invoiceId: string, refundTxid: string, note?: string): Promise<Invoice> {
    const res = await this.http.request<{ invoice: Invoice }>(
      "POST",
      `/invoices/${encodeURIComponent(invoiceId)}/refund`,
      { body: { refund_txid: refundTxid, refund_note: note } },
    );
    return res.invoice;
  }
}

class XpubsResource {
  constructor(private readonly http: Http) {}

  /** Register an extended PUBLIC key as a source of receive addresses. */
  async register(params: RegisterXpubParams): Promise<Xpub> {
    const res = await this.http.request<{ xpub: Xpub }>("POST", "/xpubs", { body: params });
    return res.xpub;
  }

  /** List active xpubs in the project. */
  async list(): Promise<Xpub[]> {
    const res = await this.http.request<{ xpubs: Xpub[] }>("GET", "/xpubs");
    return res.xpubs;
  }

  /**
   * Confirm wallet ownership by pasting any receive address the
   * merchant's own wallet shows. Idempotent. Resolves on success;
   * throws `address_mismatch` if the address isn't derivable.
   */
  async verify(xpubId: string, address: string): Promise<void> {
    await this.http.request<void>("POST", `/xpubs/${encodeURIComponent(xpubId)}/verify`, {
      body: { address },
    });
  }

  /** Revoke an xpub. Idempotent — existing bound invoices stay payable. */
  async revoke(xpubId: string): Promise<void> {
    await this.http.request<void>("DELETE", `/xpubs/${encodeURIComponent(xpubId)}`);
  }
}

class WebhooksResource {
  constructor(private readonly http: Http) {}

  /** Register an outbound webhook. The returned `secret` is shown only once. */
  async create(params: CreateWebhookParams): Promise<WebhookCreated> {
    const res = await this.http.request<{ webhook: WebhookCreated }>("POST", "/webhooks", {
      body: params,
    });
    return res.webhook;
  }

  /** List active webhook subscriptions. */
  async list(): Promise<Webhook[]> {
    const res = await this.http.request<{ webhooks: Webhook[] }>("GET", "/webhooks");
    return res.webhooks;
  }

  /** Remove a webhook subscription. */
  async delete(webhookId: string): Promise<void> {
    await this.http.request<void>("DELETE", `/webhooks/${encodeURIComponent(webhookId)}`);
  }
}
