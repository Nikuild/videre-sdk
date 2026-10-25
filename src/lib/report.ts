// Turns a backend envelope into a render-ready view model. Pure functions (unit-tested).
import { type Envelope, type Epistemic, type Flag, type Section, type Severity, SEVERITIES } from "./envelope";
import { redact, safeHref } from "./redact";
import { verdictKind, type VerdictKind } from "./verdict";
import { humanFlag, humanWhy, isIssuerPowerFlag, type HumanFlag } from "./humanize";

export interface SectionRow {
  key: string;
  source: string;
  status: string; // raw engine status
  ok: boolean;
  fetchedAt: string | null;
  error: string | null;
  note: string | null;
  fallbackFrom: string | null;
}

export interface UnknownRow {
  key: string;
  source: string;
  status: string;
  reason: string | null;
}

export interface FlagRow {
  severity: Severity;
  rawSeverity: string;
  flag: string;
  evidence: string;
  source: string;
  fetchedAt: string | null;
  fetchedAtIsReportTime: boolean;
  label: Epistemic;
  confidence: string | null;
  human: HumanFlag;     // plain-language title / meaning (raw flag + evidence stay as technical detail)
  issuerPower: boolean; // admin power commonly kept by established tokens (pause / blacklist / mint / proxy)
}

export interface Metric {
  key: string;
  value: string | null; // null => UNKNOWN (never 0)
  source: string;
  fetchedAt: string | null;
  label: Epistemic;
}

export interface Hop {
  hop: number | string;
  from: string;
  fromLabel: string | null;
  fromKind: string | null;
  time: string | null;
  amount: string | null;
  link: string | null;
}

export interface ReportView {
  status: string;
  chain: string;
  chainRequested: string | null;
  address: string;
  name: string | null;
  symbol: string | null;
  verdict: { kind: VerdictKind; recognised: boolean; raw: string; why: string; whyHuman: string; note: string; incomplete: boolean; established: boolean };
  counts: Record<Severity, number | null>;
  unknown: UnknownRow[];
  sections: SectionRow[];
  flagsBySeverity: Record<Severity, FlagRow[]>;
  metrics: Metric[];
  deployer: { address: string | null; link: string | null; source: string | null; hops: Hop[]; sectionOk: boolean; fetchedAt: string | null } | null;
  explorer: string | null;
  times: { requested: string | null; finished: string | null; generated: string | null };
  cached: boolean;
  cacheAgeSec: number | null;
  engineVersion: string | null;
  wrapperVersion: string | null;
  tool: string | null;
  chainDetection: string | null;
  error: { code: string; message: string } | null;
  disclaimer: string | null;
}

const EPI = new Set(["FACT", "INFERENCE", "UNKNOWN"]);

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

function str(x: unknown): string | null {
  if (x === null || x === undefined || x === "") return null;
  return redact(String(x));
}

export function isOk(s: Section | undefined | null): boolean {
  return !!s && String(s.status || "").toUpperCase() === "OK";
}

function normSeverity(s: string): Severity {
  const v = (s || "").toLowerCase();
  return (SEVERITIES as string[]).includes(v) ? (v as Severity) : "info";
}

/** Find the section a flag came from (by exact source, section key, or a token of a combined source like "dexscreener+geckoterminal"). */
export function sectionForSource(sections: Record<string, Section>, source: string): [string, Section] | null {
  const src = (source || "").toLowerCase().trim();
  if (!src) return null;
  const entries = Object.entries(sections);
  const exact = entries.find(([, s]) => (s.source || "").toLowerCase() === src);
  if (exact) return exact;
  const byKey = entries.find(([k]) => k.toLowerCase() === src || k.toLowerCase() === src.replace(/[^a-z0-9]+/g, "_"));
  if (byKey) return byKey;
  const base = src.replace(/\s*\(derived\)\s*$/, "");
  const partial = entries.find(([, s]) => (s.source || "").toLowerCase().split(/[+,/]| \(/).map((t) => t.trim()).includes(base));
  return partial || null;
}

export function flagLabel(f: Flag, sec: Section | null): Epistemic {
  const explicit = String(f.label || "").toUpperCase();
  if (EPI.has(explicit)) return explicit as Epistemic;
  const text = `${f.flag || ""} ${f.evidence || ""}`;
  if (/INFERENCE/i.test(text) || /\b(cluster|mother wallet)\b/i.test(text)) return "INFERENCE";
  if (/UNKNOWN/.test(text)) return "UNKNOWN";
  if (sec && !isOk(sec)) return "UNKNOWN";
  return "FACT"; // value reported by the named source at fetched_at
}

function parseUnknown(entry: string): UnknownRow {
  // engine format: "<section>:<source>=<STATUS>"
  const m = /^([^:]+):(.*)=([^=]*)$/.exec(entry);
  if (!m) return { key: entry, source: entry, status: "UNKNOWN", reason: null };
  return { key: m[1], source: m[2], status: m[3] || "UNKNOWN", reason: null };
}

function fmtNum(v: unknown, opts: { usd?: boolean; pct?: boolean; int?: boolean } = {}): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  if (opts.pct) return `${n.toFixed(n < 10 ? 2 : 1)}%`;
  if (opts.int) return Math.round(n).toLocaleString("en-US");
  if (opts.usd) {
    if (n !== 0 && Math.abs(n) < 0.01) return `$${n.toExponential(2)}`;
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 1000 ? 2 : 0 })}`;
  }
  return n.toLocaleString("en-US");
}

function firstSection(sections: Record<string, Section>, keys: string[]): [string, Section] | null {
  for (const k of keys) if (sections[k]) return [k, sections[k]];
  return null;
}

function metric(sections: Record<string, Section>, key: string, secKeys: string[], field: string, fmt: Parameters<typeof fmtNum>[1], label: Epistemic = "FACT"): Metric | null {
  const hit = firstSection(sections, secKeys);
  if (!hit) return null;
  const [, s] = hit;
  const d = asRecord(s.data);
  const value = isOk(s) && d ? fmtNum(d[field], fmt) : null;
  return { key, value, source: s.source || hit[0], fetchedAt: s.fetched_at || null, label: value === null ? "UNKNOWN" : label };
}

export function buildReport(env: Envelope): ReportView {
  const r = env.result || null;
  const sections: Record<string, Section> = (r && asRecord(r.sections) ? (r.sections as Record<string, Section>) : {}) || {};

  const sectionRows: SectionRow[] = Object.entries(sections).map(([key, s]) => {
    const d = asRecord(s.data);
    const fb = asRecord(s.fallback_from);
    return {
      key,
      source: s.source || key,
      status: String(s.status || "UNKNOWN"),
      ok: isOk(s),
      fetchedAt: s.fetched_at || null,
      error: str(s.error),
      note: d ? str(d.note) : null,
      fallbackFrom: fb ? `${fb.source ?? "?"}=${fb.status ?? "?"}${fb.error ? ` (${redact(fb.error)})` : ""}` : null,
    };
  });

  // UNKNOWN row: union of engine's unknown_sources and every non-OK section. A failed source is UNKNOWN, never 0/clean.
  const unknownMap = new Map<string, UnknownRow>();
  for (const e of r?.unknown_sources || []) {
    const u = parseUnknown(String(e));
    unknownMap.set(u.key, u);
  }
  for (const s of sectionRows) {
    if (s.ok) continue;
    const prev = unknownMap.get(s.key);
    unknownMap.set(s.key, { key: s.key, source: s.source, status: s.status, reason: s.error || prev?.reason || null });
  }
  const unknown = [...unknownMap.values()];

  const flagsBySeverity: Record<Severity, FlagRow[]> = { critical: [], high: [], medium: [], info: [] };
  for (const raw of r?.flags || []) {
    if (!raw || typeof raw !== "object") continue; // skip placeholders like "… (9 total)"
    const f = raw as Flag;
    const hit = sectionForSource(sections, f.source || "");
    const sec = hit ? hit[1] : null;
    const own = f.fetched_at || null;
    const fetchedAt = own || sec?.fetched_at || r?.generated_at || null;
    const sev = normSeverity(f.severity);
    const flagText = redact(f.flag);
    const evText = redact(f.evidence ?? "");
    flagsBySeverity[sev].push({
      human: humanFlag(flagText, evText),
      issuerPower: isIssuerPowerFlag(flagText, evText),
      severity: sev,
      rawSeverity: f.severity,
      flag: redact(f.flag),
      evidence: redact(f.evidence ?? ""),
      source: redact(f.source ?? "UNKNOWN"),
      fetchedAt,
      fetchedAtIsReportTime: !own && !sec?.fetched_at,
      label: flagLabel(f, sec),
      confidence: f.confidence ? String(f.confidence) : null,
    });
  }

  const c = r?.verdict?.counts || {};
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, typeof c[s] === "number" ? (c[s] as number) : null])) as Record<Severity, number | null>;

  const v = r?.verdict || {};
  const vk = verdictKind(v.draft_verdict, v.incomplete);

  const idHit = firstSection(sections, ["identity", "jupiter", "rugcheck", "goplus"]);
  const idData = idHit ? asRecord(idHit[1].data) : null;

  const metrics = [
    metric(sections, "liquidity_usd", ["identity"], "liquidity_usd_total", { usd: true }),
    metric(sections, "volume_24h_usd", ["identity"], "volume_24h_usd", { usd: true }),
    metric(sections, "mcap_usd", ["identity"], "mcap_usd", { usd: true }),
    metric(sections, "fdv_usd", ["identity"], "fdv_usd", { usd: true }),
    metric(sections, "oldest_pair_age_days", ["identity"], "oldest_pair_age_days", {}),
    metric(sections, "holder_count", ["holders"], "holder_count", { int: true }),
    metric(sections, "top10_pct", ["holders"], "top10_pct_ex_lp_burn", { pct: true }),
    metric(sections, "buy_tax_pct", ["honeypot"], "buy_tax_pct", { pct: true }),
    metric(sections, "sell_tax_pct", ["honeypot"], "sell_tax_pct", { pct: true }),
    metric(sections, "lp_locked_or_burned_pct", ["liquidity"], "lp_locked_or_burned_pct", { pct: true }),
  ].filter((m): m is Metric => m !== null);

  let deployer: ReportView["deployer"] = null;
  const dv = sections["dev_trace"];
  if (dv) {
    const d = asRecord(dv.data);
    const hops: Hop[] = Array.isArray(d?.hops)
      ? (d!.hops as unknown[]).map((h) => asRecord(h)).filter((h): h is Record<string, unknown> => !!h).map((h) => ({
          hop: (h.hop as number) ?? "?",
          from: str(h.from) || "UNKNOWN",
          fromLabel: str(h.from_label),
          fromKind: str(h.from_kind),
          time: str(h.time),
          amount: h.amount !== undefined && h.amount !== null ? `${h.amount} ${h.unit ?? ""}`.trim() : null,
          link: safeHref(h.link),
        }))
      : [];
    deployer = {
      address: isOk(dv) && d ? str(d.deployer) : null,
      link: isOk(dv) && d ? safeHref(d.deployer_link) : null,
      source: d ? str(d.deployer_source) : null,
      hops: isOk(dv) ? hops : [],
      sectionOk: isOk(dv),
      fetchedAt: dv.fetched_at || null,
    };
  }

  const name = idData ? str(idData.name ?? idData.token_name) : null;
  const symbol = idData ? str(idData.symbol ?? idData.token_symbol) : null;

  return {
    status: env.status,
    chain: String(env.chain || r?.chain || "UNKNOWN"),
    chainRequested: env.chain_requested ?? null,
    address: String(env.address || r?.input || ""),
    name,
    symbol,
    verdict: {
      kind: vk.kind,
      recognised: vk.recognised,
      raw: redact(v.draft_verdict || ""),
      why: redact(v.why || ""),
      whyHuman: humanWhy(redact(v.why || "")),
      note: redact(v.note || ""),
      incomplete: !!v.incomplete || vk.kind === "watch_incomplete",
      established: !!v.established_token_heuristic,
    },
    counts,
    unknown,
    sections: sectionRows,
    flagsBySeverity,
    metrics,
    deployer,
    explorer: safeHref(r?.explorer),
    times: { requested: env.requested_at_utc || null, finished: env.finished_at_utc || null, generated: r?.generated_at || null },
    cached: !!env.cached,
    cacheAgeSec: env.cache_age_sec ?? null,
    engineVersion: env.engine_version || null,
    wrapperVersion: env.wrapper_version || null,
    tool: r?.tool || null,
    chainDetection: r?.chain_detection ? redact(r.chain_detection) : null,
    error: env.error ? { code: String(env.error.code || env.status), message: redact(env.error.message || "") } : null,
    disclaimer: r?.disclaimer ? redact(r.disclaimer) : null,
  };
}
