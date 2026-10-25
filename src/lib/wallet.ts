// Check tab: address-kind probe (/api/v1/kind) + wallet report (/api/v1/wallet). The backend sends codes; every human
// string comes from the dictionary (t.wallet). Pure functions (unit-tested). UNKNOWN is never rendered as clean.
import type { Envelope, Epistemic } from "./envelope";
import { safeHref } from "./redact";

export const KIND_API_PATH = "/api/v1/kind";
export const WALLET_API_PATH = "/api/v1/wallet";

export type AddrKind = "wallet" | "token" | "contract" | "unknown";
export type KindRoute = "wallet" | "token" | "unknown";

export interface KindResult {
  kind: AddrKind;
  basis: string;
  chain: string | null;
  route: KindRoute;
  reason: string | null;
  hintWallet: string | null;
}

const KINDS = new Set<AddrKind>(["wallet", "token", "contract", "unknown"]);
const CODE = /^[a-z0-9_]{1,64}$/;
const code = (x: unknown): string | null => (typeof x === "string" && CODE.test(x) ? x : null);
const str = (x: unknown, n = 120): string | null => (typeof x === "string" && x ? x.slice(0, n) : null);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Parse a /api/v1/kind envelope. Anything malformed is UNKNOWN (route "unknown"), never "token". */
export function parseKind(env: Envelope | null | undefined): KindResult {
  const r = (env?.status === "ok" ? env.result : null) as Record<string, unknown> | null;
  const kind = r && KINDS.has(r.kind as AddrKind) ? (r.kind as AddrKind) : "unknown";
  // token_supported === false (e.g. code only on Avalanche, not covered by the token engine) -> never the token path
  const tokenOk = !(r && (r.token_supported === false || r.route === "unknown"));
  const route: KindRoute = kind === "wallet" ? "wallet" : (kind === "token" || kind === "contract") && tokenOk ? "token" : "unknown";
  const hint = r ? str(r.hint_wallet, 64) : null;
  return {
    kind, route,
    basis: (r && code(r.basis)) || "unrecognised",
    chain: r ? code(r.chain) : null,
    reason: r ? code(r.reason) : null,
    hintWallet: hint && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(hint) ? hint : null,
  };
}

export type Severity = "critical" | "high" | "medium" | "info";
const SEVS = new Set<Severity>(["critical", "high", "medium", "info"]);

export interface WalletFlag { severity: Severity; code: string; source: string; label: Epistemic; hop: number | null }
export interface BalanceRow { chain: string; ok: boolean; native: string | null; balance: number | null; sentTxs: number | null; recentSignatures: number | null; lastActivity: string | null; isContract: boolean | null }
export interface FundingHop { hop: number | null; ok: boolean; from: string | null; fromKind: string | null; fromLabel: string | null; time: string | null; amount: number | null; unit: string | null; txLink: string | null; reason: string | null; label: Epistemic }
export type WalletSummary = "flags" | "no_flags_incomplete" | "no_flags_partial_view";

export interface WalletView {
  address: string;
  chain: string;
  summary: WalletSummary;
  flags: WalletFlag[];
  balances: { label: Epistemic; fetchedAt: string | null; rows: BalanceRow[] };
  goplus: { label: Epistemic; status: string; fetchedAt: string | null };
  funding: { label: Epistemic; status: string; fetchedAt: string | null; hops: FundingHop[] };
  addressLabel: { label: Epistemic; kind: string | null; text: string | null };
  detected: { kind: AddrKind; basis: string } | null;
  unknown: string[];
  explorer: string | null;
  generatedAt: string | null;
  requested: string | null;
  finished: string | null;
  cached: boolean;
}

const ep = (x: unknown): Epistemic => (x === "FACT" || x === "INFERENCE" ? x : "UNKNOWN");
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

export function buildWalletView(env: Envelope): WalletView {
  const r = obj(env.result);
  const bal = obj(r.balances), gp = obj(r.goplus), fund = obj(r.funding), lab = obj(r.address_label), det = obj(r.detected);
  const summary = (["flags", "no_flags_incomplete", "no_flags_partial_view"] as const).find((s) => s === r.summary) ?? "no_flags_incomplete";
  const unknown = arr(r.unknown).map(code).filter((x): x is string => !!x);
  const gpStatus = str(gp.status, 24) ?? "FAIL";
  const flags: WalletFlag[] = arr(r.flags).map(obj).flatMap((f) => {
    const c = code(f.code);
    if (!c) return [];
    const sev = SEVS.has(f.severity as Severity) ? (f.severity as Severity) : "info";
    return [{ severity: sev, code: c, source: str(f.source, 40) ?? "UNKNOWN", label: ep(f.label), hop: num(obj(f.params).hop) }];
  });
  return {
    address: str(r.input, 80) ?? env.address ?? "",
    chain: code(r.chain) ?? env.chain ?? "auto",
    // a partial view with UNKNOWN sections is never upgraded: summary from the backend, but force "incomplete" if any UNKNOWN
    summary: summary === "no_flags_partial_view" && (unknown.length > 0 || gpStatus !== "OK") ? "no_flags_incomplete" : summary,
    flags,
    balances: {
      label: ep(bal.label), fetchedAt: str(bal.fetched_at, 32),
      rows: arr(bal.rows).map(obj).map((b) => ({
        chain: code(b.chain) ?? "?", ok: b.status === "OK", native: str(b.native, 8), balance: num(b.balance), sentTxs: num(b.sent_txs),
        recentSignatures: num(b.recent_signatures), lastActivity: str(b.last_activity, 32), isContract: typeof b.is_contract === "boolean" ? b.is_contract : null,
      })),
    },
    goplus: { label: gpStatus === "OK" ? "FACT" : "UNKNOWN", status: gpStatus, fetchedAt: str(gp.fetched_at, 32) },
    funding: {
      label: fund.status === "OK" ? "INFERENCE" : "UNKNOWN", status: str(fund.status, 24) ?? "FAIL", fetchedAt: str(fund.fetched_at, 32),
      hops: arr(fund.hops).map(obj).map((h) => ({
        hop: num(h.hop), ok: h.status === "OK", from: str(h.from, 64), fromKind: code(String(h.from_kind ?? "").replace("-", "_")), fromLabel: str(h.from_label, 80),
        time: typeof h.time === "string" ? h.time.slice(0, 32) : null, amount: num(h.amount), unit: str(h.unit, 12),
        txLink: safeHref(str(h.tx_link, 300)), reason: code(h.reason_code), label: h.status === "OK" ? "INFERENCE" : "UNKNOWN",
      })),
    },
    addressLabel: { label: lab.status === "OK" ? "INFERENCE" : "UNKNOWN", kind: code(String(lab.kind ?? "").replace("-", "_")), text: str(lab.text, 80) },
    detected: det.kind && KINDS.has(det.kind as AddrKind) ? { kind: det.kind as AddrKind, basis: code(det.basis) ?? "unrecognised" } : null,
    unknown,
    explorer: safeHref(str(obj(r.links).explorer, 300)),
    generatedAt: str(r.generated_at, 32),
    requested: env.requested_at_utc ?? null,
    finished: env.finished_at_utc ?? null,
    cached: !!env.cached,
  };
}

/** Localized text for a code with a raw-code fallback (a new GoPlus flag must still show up, never disappear). */
export function codeText(map: Record<string, string>, c: string): string {
  return Object.prototype.hasOwnProperty.call(map, c) ? map[c] : c.replace(/_/g, " ");
}

export function walletPath(chain: string, address: string): string {
  return `/wallet?${new URLSearchParams({ address, chain })}`;
}
