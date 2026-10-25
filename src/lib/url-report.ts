// URL / domain report view model (engine `url` mode via GET /api/v1/url). Reuses buildReport for the shared parts
// (UNKNOWN row, flags, sources, meta, verdict) and adds the domain facts panel. Pure functions (unit-tested).
import type { AnyEnvelope, Envelope, Epistemic, Section } from "./envelope";
import { buildReport, isOk, type ReportView } from "./report";
import { redact } from "./redact";

export interface DomainFact {
  key: string;
  value: string | null; // null => UNKNOWN
  source: string;
  fetchedAt: string | null;
  label: Epistemic;
  note?: string | null;
}

export interface UrlView extends ReportView {
  target: string;
  host: string;
  registrable: string | null;
  facts: DomainFact[];
  /** DNS answered (FACT) with no A / AAAA / NS at all: the domain does not exist (NXDOMAIN / not registered). */
  notRegistered: boolean;
}

function rec(x: unknown): Record<string, unknown> | null {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

function list(x: unknown): string | null {
  if (Array.isArray(x)) return x.length ? x.map((v) => redact(String(v))).join(", ") : "none";
  if (typeof x === "string" && x) return redact(x); // e.g. "UNKNOWN (FAIL)"
  return null;
}

// Look-alike / brand matching are heuristics => INFERENCE. Registry / list / DNS answers are FACT at fetch time.
const INFERENCE_SOURCES = /brand list|look-?alike/i;

export function buildUrlView(env: AnyEnvelope): UrlView {
  const base = buildReport(env as unknown as Envelope);
  for (const sev of Object.keys(base.flagsBySeverity) as (keyof typeof base.flagsBySeverity)[]) {
    for (const f of base.flagsBySeverity[sev]) {
      if (INFERENCE_SOURCES.test(f.source) || /look-?alike|typo-squat|homoglyph/i.test(`${f.flag} ${f.evidence}`)) f.label = "INFERENCE";
    }
  }
  const r = rec(env.result) || {};
  const S = (rec(r.sections) || {}) as Record<string, Section>;
  const facts: DomainFact[] = [];
  const push = (key: string, s: Section | undefined, val: string | null, label?: Epistemic, note?: string | null) => {
    const okv = !!s && isOk(s) && val !== null;
    facts.push({ key, value: okv ? val : null, source: s?.source || "UNKNOWN", fetchedAt: s?.fetched_at || null, label: okv ? label || "FACT" : "UNKNOWN", note: note ?? null });
  };
  const rd = S["rdap"];
  const rdd = rec(rd?.data);
  push("registered", rd, rdd?.registered ? String(rdd.registered) : null, "FACT", rdd?.note ? redact(String(rdd.note)) : null);
  push("age_days", rd, typeof rdd?.age_days === "number" ? String(Math.floor(rdd.age_days as number)) : null);
  push("registrar", rd, rdd?.registrar ? redact(String(rdd.registrar)) : null);
  push("expires", rd, rdd?.expires ? String(rdd.expires) : null);
  push("nameservers", rd, list(rdd?.nameservers));
  const gp = S["goplus_phishing"];
  const gpd = rec(gp?.data);
  const ph = gpd ? String(gpd.phishing_site ?? "") : "";
  push("phishing_list", gp, ph === "1" ? "LISTED as phishing" : ph === "0" ? "not listed (absence ≠ safe)" : null);
  const dns = S["dns"];
  const dd = rec(dns?.data);
  for (const t of ["A", "AAAA", "NS", "MX"]) {
    const v = dd ? list(dd[t]) : null;
    push(`dns_${t}`, dns, v && /^UNKNOWN/.test(v) ? null : v);
  }
  const empty = (x: unknown) => Array.isArray(x) && x.length === 0;
  const notRegistered = !!dns && isOk(dns) && !!dd && empty(dd.A) && empty(dd.AAAA) && empty(dd.NS);
  return {
    ...base,
    notRegistered,
    target: redact(String(env.target ?? r.input ?? "")),
    host: String(env.host ?? r.host ?? ""),
    registrable: r.registrable_domain ? String(r.registrable_domain) : null,
    facts,
  };
}
