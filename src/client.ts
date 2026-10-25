// Minimal typed client for the Videre public HTTP API. Read-only: GET requests only, no keys, no wallet access.
// Pass the base URL of a Videre deployment (e.g. "https://videre.example.com"). Nothing is hard-coded.
import type { AnyEnvelope, Envelope } from "./lib/envelope";
import { isEnvelope } from "./lib/envelope";
import type { Chain } from "./lib/chains";

export interface VidereClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class VidereApiError extends Error {
  constructor(message: string, readonly status: number, readonly envelope?: AnyEnvelope) {
    super(message);
    this.name = "VidereApiError";
  }
}

export function createClient(opts: VidereClientOptions) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const f = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 330_000;

  async function get<T extends AnyEnvelope | Envelope>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    const res = await f(`${base}${path}?${qs}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    const body: unknown = await res.json().catch(() => null);
    if (!isEnvelope(body)) throw new VidereApiError(`unexpected response (${res.status})`, res.status);
    if (!res.ok && body.status !== "ok") throw new VidereApiError(body.error?.message || `HTTP ${res.status}`, res.status, body as AnyEnvelope);
    return body as T;
  }

  return {
    /** Token check: GET /api/v1/token */
    token: (address: string, chain: Chain = "auto") => get<Envelope>("/api/v1/token", { address, chain }),
    /** URL / domain check: GET /api/v1/url */
    url: (target: string) => get<AnyEnvelope>("/api/v1/url", { target }),
    /** Cluster map: GET /api/v1/cluster */
    cluster: (address: string, chain: Chain, depth?: number, max_nodes?: number) =>
      get<AnyEnvelope>("/api/v1/cluster", { address, chain, depth, max_nodes }),
    /** Same-ticker lookup: GET /api/v1/ticker */
    ticker: (symbol: string) => get<AnyEnvelope>("/api/v1/ticker", { symbol }),
  };
}
export type VidereClient = ReturnType<typeof createClient>;
