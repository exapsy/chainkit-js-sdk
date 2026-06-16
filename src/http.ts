import { ChainkitApiError } from "./errors.js";

export interface HttpConfig {
  apiKey: string;
  projectId: string;
  baseUrl: string;
  /** Per-request timeout in ms. Default 30_000. */
  timeoutMs: number;
  /** Override for tests / custom transports. Defaults to global fetch. */
  fetch: typeof fetch;
}

/**
 * Thin request layer: builds the project-scoped URL, attaches the
 * Bearer API key, encodes/decodes JSON, and turns non-2xx responses
 * into {@link ChainkitApiError}. Resources call this; consumers don't.
 */
export class Http {
  constructor(private readonly cfg: HttpConfig) {}

  private url(path: string, query?: Record<string, string | number | undefined>): string {
    const base = this.cfg.baseUrl.replace(/\/+$/, "");
    let url = `${base}/v1/projects/${encodeURIComponent(this.cfg.projectId)}/payments${path}`;
    if (query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      }
      const s = qs.toString();
      if (s) url += `?${s}`;
    }
    return url;
  }

  async request<T>(
    method: string,
    path: string,
    opts?: { body?: unknown; query?: Record<string, string | number | undefined> },
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    let res: Response;
    try {
      res = await this.cfg.fetch(this.url(path, opts?.query), {
        method,
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          Accept: "application/json",
          ...(opts?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    const parsed = text ? safeJson(text) : undefined;

    if (!res.ok) {
      const err = (parsed ?? {}) as { error?: string; detail?: string };
      throw new ChainkitApiError(res.status, err.error ?? `http_${res.status}`, err.detail);
    }
    return parsed as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
