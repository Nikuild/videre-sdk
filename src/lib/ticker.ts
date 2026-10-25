// Same-ticker panel view model (GET /api/v1/ticker). Assessments are INFERENCE with confidence, or UNKNOWN.
import type { AnyEnvelope, Epistemic } from "./envelope";
import { redact } from "./redact";

export interface TickerRow {
  chain: string;
  address: string;
  name: string | null;
  liquidity: string | null; // null => UNKNOWN (never 0)
  ageDays: number | null;
  pairCount: number | null;
  sources: string;
  fetchedAt: string | null;
  isReference: boolean;
  verdict: string; // "most liquid listing" | "probable copy" | "possible copy" | "unclear"
  label: Epistemic;
  confidence: string | null;
  reasons: string[];
}

export interface TickerView {
  ok: boolean;
  symbol: string;
  rows: TickerRow[];
  reference: { found: boolean; verdict: string | null; confidence: string | null; label: Epistemic } | null;
  summary: { tokens: number; chains: string[]; probable: number; possible: number };
  unknown: string[];
  coverage: string | null;
  method: string | null;
  generatedAt: string | null;
  truncated: boolean;
  error: string | null;
}

function rec(x: unknown): Record<string, unknown> | null {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

function usd(x: unknown): string | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  return `$${x.toLocaleString("en-US", { maximumFractionDigits: x < 100 ? 2 : 0 })}`;
}

export function buildTickerView(env: AnyEnvelope | null): TickerView {
  const r = rec(env?.result) || {};
  const rows: TickerRow[] = (Array.isArray(r.tokens) ? (r.tokens as unknown[]) : []).map(rec).filter((t): t is Record<string, unknown> => !!t).map((t) => {
    const a = rec(t.assessment) || {};
    const lab = String(a.label || "").toUpperCase();
    const label: Epistemic = lab === "UNKNOWN" || t.liquidity_usd == null ? "UNKNOWN" : "INFERENCE"; // never FACT: copies are inferred
    return {
      chain: String(t.chain ?? "UNKNOWN"),
      address: String(t.address ?? ""),
      name: t.name ? redact(String(t.name)) : null,
      liquidity: usd(t.liquidity_usd),
      ageDays: typeof t.oldest_pair_age_days === "number" ? t.oldest_pair_age_days : null,
      pairCount: typeof t.pair_count === "number" ? t.pair_count : null,
      sources: Array.isArray(t.sources) ? (t.sources as unknown[]).map(String).join(" + ") : "UNKNOWN",
      fetchedAt: (t.fetched_at as string) || null,
      isReference: !!t.is_reference,
      verdict: label === "UNKNOWN" ? "unclear" : String(a.verdict || "unclear"),
      label,
      confidence: label === "UNKNOWN" ? null : a.confidence ? String(a.confidence) : "low",
      reasons: Array.isArray(a.reasons) ? (a.reasons as unknown[]).map((x) => redact(String(x))) : [],
    };
  });
  const ref = rec(r.reference);
  const ra = rec(ref?.assessment);
  const s = rec(r.summary) || {};
  return {
    ok: env?.status === "ok" && !!env?.result,
    symbol: String(env?.symbol || r.symbol || ""),
    rows,
    reference: ref ? { found: !!ref.found, verdict: ra ? String(ra.verdict) : null, confidence: ra?.confidence ? String(ra.confidence) : null, label: ra && ra.label === "INFERENCE" ? "INFERENCE" : "UNKNOWN" } : null,
    summary: {
      tokens: typeof s.token_count === "number" ? s.token_count : rows.length,
      chains: Array.isArray(s.chains) ? (s.chains as unknown[]).map(String) : [],
      probable: typeof s.probable_copies === "number" ? s.probable_copies : rows.filter((x) => x.verdict === "probable copy").length,
      possible: typeof s.possible_copies === "number" ? s.possible_copies : rows.filter((x) => x.verdict === "possible copy").length,
    },
    unknown: Array.isArray(r.unknown_sources) ? (r.unknown_sources as unknown[]).map((u) => redact(String(u))) : [],
    coverage: r.coverage_note ? redact(String(r.coverage_note)) : null,
    method: r.method ? redact(String(r.method)) : null,
    generatedAt: (r.generated_at as string) || null,
    truncated: !!r.truncated,
    error: env?.error ? redact(`${env.error.code ?? ""}: ${env.error.message ?? ""}`) : null,
  };
}
