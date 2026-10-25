// Simulate tab, stage B («Decode signature»): pure helpers - client-side form validation (mirrors
// the server-side decode validation pre-checks), result types and the human-language view
// model. The decode itself happens on the backend (offline, POST /api/v1/simulate/decode-signature); nothing here signs,
// connects a wallet or talks to a chain. Unit-tested in tests/signature.test.ts.
import type { SimAddress } from "./simulate";

export const SIG_API_PATH = "/api/v1/simulate/decode-signature";
export const SIG_CHAINS = ["auto", "eth", "base", "bsc", "arbitrum", "polygon", "optimism"] as const;
export type SigChain = (typeof SIG_CHAINS)[number];
export const SIG_CHAIN_LABELS: Record<SigChain, string> = {
  auto: "Auto (from the payload)", eth: "Ethereum", base: "Base", bsc: "BNB Chain", arbitrum: "Arbitrum One", polygon: "Polygon", optimism: "Optimism",
};
export const SIG_EXPLORERS: Record<string, string> = {
  eth: "https://etherscan.io", base: "https://basescan.org", bsc: "https://bscscan.com", arbitrum: "https://arbiscan.io",
  polygon: "https://polygonscan.com", optimism: "https://optimistic.etherscan.io",
};
export const MAX_PAYLOAD_CHARS = 65536;

export type SigErrorCode = "required" | "leading_dash" | "too_long" | "looks_like_key" | "bad_json" | "bad_input" | "bad_hex" | "bad_chain";
export interface SigFields { payload: string; chain: string; check_addresses: boolean }
export interface SigBody { payload: string; chain: SigChain; check_addresses: boolean }
export type SigValidation = { ok: true; body: SigBody } | { ok: false; field: "payload" | "chain"; code: SigErrorCode; detail?: string };

const KEYISH = /^(0x)?[0-9a-fA-F]{64}$/;
const BADCTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const HEXISH = /^0x[0-9a-fA-F]*$/;

/** Client pre-checks only (fast, friendly messages); the backend re-validates everything. */
export function validateSigForm(f: SigFields): SigValidation {
  const chain = (f.chain || "auto").trim().toLowerCase();
  if (!(SIG_CHAINS as readonly string[]).includes(chain)) return { ok: false, field: "chain", code: "bad_chain" };
  const s = (f.payload ?? "").trim();
  if (!s) return { ok: false, field: "payload", code: "required" };
  if (s.length > MAX_PAYLOAD_CHARS) return { ok: false, field: "payload", code: "too_long", detail: String(MAX_PAYLOAD_CHARS) };
  if (s.startsWith("-")) return { ok: false, field: "payload", code: "leading_dash" };
  if (BADCTRL.test(s)) return { ok: false, field: "payload", code: "bad_input" };
  if (KEYISH.test(s)) return { ok: false, field: "payload", code: "looks_like_key" };
  if (s[0] === "{" || s[0] === "[") {
    try {
      JSON.parse(s);
    } catch {
      return { ok: false, field: "payload", code: "bad_json" };
    }
  } else if (HEXISH.test(s) && (s.length - 2) % 2 !== 0) {
    return { ok: false, field: "payload", code: "bad_hex" };
  }
  return { ok: true, body: { payload: s, chain: chain as SigChain, check_addresses: f.check_addresses !== false } };
}

// ------------------------------------------------------------------------------------------------ result types
export type Epi = "FACT" | "INFERENCE" | "UNKNOWN";
export interface SigTime { kind: "date" | "never" | "none" | "expired" | "immediate" | "unknown"; utc?: string | null; raw?: string | null; in_days?: number | null }
export interface SigGrant {
  kind: string; pattern: string; who?: string | null; who_role?: string; owner?: string | null; token?: string | null; token_symbol?: string | null;
  claimed_name?: string | null; amount_raw?: string | null; amount?: string | null; decimals?: number | null; unlimited?: boolean; unlimited_kind?: string | null;
  revoked?: boolean; approved?: boolean; until?: SigTime; until_field?: string; sig_deadline?: SigTime; via?: string; item?: string; text?: string;
  recipient_role?: string; label: Epi; summary_en: string;
  // additive structured fields (backend i18n codes): the UI builds the sentence from these, summary_en is the fallback
  recipient?: string; recipient_is_offerer?: boolean; byte_len?: number; method?: string | null; primary_type?: string;
  siwe?: { domain: string; address: string; [k: string]: string };
  item_info?: { item_type: number; token?: string | null; token_symbol?: string | null; amount?: string | null; amount_raw?: string | null; identifier?: string | null };
  safe_call?: { safe: string | null; to: string; operation: number; value_wei: string; selector: string | null; function: string | null; args: string[] };
}
export interface SigCode { id: string; params?: Record<string, string> }
export interface SigMarker { id: string; severity: "critical" | "high" | "medium" | "info" | string; label: Epi; text: string }
export interface SigResult {
  kind: "signature"; stage: "B"; payload_type: string;
  input: { format: string | null; method: string | null; signer_hint: string | null; signature_present: boolean };
  pattern: { id: string; name: string; label: Epi };
  decode: { label: Epi; error: { code?: string; message?: string; path?: string } | null };
  chain: { chain_id: number | null; key: string | null; name: string; source: string; label: Epi };
  domain: Record<string, string> | null;
  hashes: { domain_separator?: string; struct_hash?: string; digest?: string; primary_type_encoding?: string; label: Epi; note?: string } | null;
  grants: SigGrant[];
  risk: { level: "critical" | "high" | "medium" | "info"; markers: SigMarker[]; note?: string; note_code?: string };
  fields: { path: string; type: string; value: string }[]; fields_truncated: boolean;
  addresses: SimAddress[]; unknowns: string[]; notes: string[]; disclaimer: string; generated_at?: string;
  unknown_codes?: SigCode[]; note_codes?: SigCode[]; disclaimer_code?: string;
}
export interface SigEnvelope {
  status: "ok" | "error" | "timeout" | "unknown"; kind?: string; stage?: string; requested_at_utc?: string; finished_at_utc?: string;
  disclaimer?: string; result: SigResult | null; error: { code?: string; message?: string; retry_after_sec?: number } | null;
}

export function isSigEnvelope(x: unknown): x is SigEnvelope {
  if (!x || typeof x !== "object" || !("status" in x) || !("result" in x) || !("error" in x)) return false;
  const r = (x as { result: unknown }).result;
  return r === null || (typeof r === "object" && Array.isArray((r as SigResult).grants) && !!(r as SigResult).risk);
}

// ------------------------------------------------------------------------------------------------ view model
export const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, info: 1 };

export interface MarkerGroup { id: string; severity: string; label: Epi; texts: string[] }

/** One row per marker id (the backend may emit the same id with different evidence, e.g. two forever deadlines). */
export function groupMarkers(ms: SigMarker[]): MarkerGroup[] {
  const out: MarkerGroup[] = [];
  for (const m of ms) {
    const g = out.find((x) => x.id === m.id);
    if (!g) out.push({ id: m.id, severity: m.severity, label: m.label, texts: [m.text] });
    else {
      if (!g.texts.includes(m.text)) g.texts.push(m.text);
      if ((SEV_RANK[m.severity] ?? 0) > (SEV_RANK[g.severity] ?? 0)) g.severity = m.severity;
    }
  }
  return out.sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0));
}

export function isFlagged(a: SimAddress): boolean {
  const c = a.check?.counts;
  return a.check?.status === "ok" && !!c && ((c.critical ?? 0) > 0 || (c.high ?? 0) > 0);
}

export interface GrantView {
  g: SigGrant; who: string | null; whoFlagged: boolean; until: SigTime | null; tone: "critical" | "high" | "medium" | "info";
}

export function buildSigView(r: SigResult) {
  const byAddr = new Map(r.addresses.map((a) => [a.address.toLowerCase(), a]));
  const grants: GrantView[] = r.grants.map((g) => {
    const who = g.who ? g.who.toLowerCase() : null;
    const row = who ? byAddr.get(who) : undefined;
    const whoFlagged = !!row && isFlagged(row);
    const until = g.until && g.until.kind !== "none" ? g.until : g.until ?? null;
    const dangerous = g.unlimited || g.kind === "opaque" || (g.kind === "operator_all" && g.approved !== false) || whoFlagged;
    const tone = dangerous ? "critical" : g.kind === "allowance" || g.kind === "transfer" || g.kind === "safe_call" ? "high" : g.label === "UNKNOWN" ? "high" : "medium";
    return { g, who, whoFlagged, until, tone };
  });
  const markers = groupMarkers(r.risk.markers);
  const flagged = r.addresses.filter(isFlagged);
  const unchecked = r.addresses.filter((a) => a.check?.status !== "ok");
  return { grants, markers, flagged, unchecked, level: r.risk.level, explorer: r.chain.key ? SIG_EXPLORERS[r.chain.key] : undefined };
}

/** Split a backend sentence into text / 0x-address parts so addresses can be shortened (full value in title) and wrap on mobile. */
export function splitAddresses(s: string): { text: string; addr: boolean }[] {
  const out: { text: string; addr: boolean }[] = [];
  const re = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ text: s.slice(last, m.index), addr: false });
    out.push({ text: m[0], addr: true });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), addr: false });
  return out;
}
