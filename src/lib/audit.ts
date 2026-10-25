// Audit tab: types, guard, pure helpers. The backend sends {code, params}; every human string comes from t.audit.
import { fmt, type Dict } from "@/i18n/fmt";
import { humanFlag } from "@/lib/humanize";

export const AUDIT_API_PATH = "/api/v1/audit/run";
export const AUDIT_CHAINS = ["eth", "base", "bsc", "arbitrum"] as const;
export const AUDIT_SECTIONS = ["privileges", "proxy", "honeypot", "vulns", "verify"] as const;
export type AuditSection = (typeof AUDIT_SECTIONS)[number];
export type Label = "FACT" | "INFERENCE" | "UNKNOWN";
export type Severity = "high" | "medium" | "low" | "info";
type P = Record<string, string | number | null | undefined>;

export interface AuditItem { code: string; category: AuditSection; severity: Severity; label: Label; source: string; params: P; time_utc: string }
export interface AuditReport {
  status: string; kind: "audit"; id?: string; generated_at_utc: string; audit_version?: string;
  input?: { mode: "address" | "source"; chain: string | null; address: string | null; source_name?: string; source_sha256?: string };
  target?: { address: string; chain: string; explorer?: string; is_contract?: boolean; implementation?: string; proxy_kind?: string; code_size?: number } | null;
  items: AuditItem[]; counts?: { high: number; medium: number; low: number; info: number; unknown: number };
  tools?: { slither: { status: string | null; reason: string | null; solc?: string | null }; sandbox: string };
  error?: { code: string; params?: P } | null; cached?: boolean; disclaimer_code?: string;
}

export function isAuditReport(x: unknown): x is AuditReport {
  const o = x as AuditReport;
  return !!o && typeof o === "object" && o.kind === "audit" && Array.isArray(o.items);
}

const EVM = /^0x[0-9a-fA-F]{40}$/;
export function validateAuditInput(mode: "address" | "source", value: string): "bad_address" | "empty_source" | "not_solidity" | "source_too_large" | null {
  const v = value.trim();
  if (mode === "address") return EVM.test(v) ? null : "bad_address";
  if (!v) return "empty_source";
  if (new TextEncoder().encode(v).length > 200_000) return "source_too_large";
  return /\b(contract|library|interface)\s+[A-Za-z_]\w*/.test(v) ? null : "not_solidity";
}

const short = (a: unknown) => (typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : String(a ?? "?"));
export const shortFile = (f: unknown) => (typeof f === "string" && f ? f.split("/").slice(-2).join("/") : "");

function dur(sec: number, A: Dict["audit"]): string {
  if (sec >= 86400) return fmt(A.units.days, { n: Math.round(sec / 864) / 100 });
  if (sec >= 3600) return fmt(A.units.hours, { n: Math.round(sec / 36) / 100 });
  return fmt(A.units.seconds, { n: sec });
}

/** Human text for one item in the current locale. Unknown codes fall back to a generic line (never raw HTML). */
export function itemText(A: Dict["audit"], it: AuditItem, flags?: Dict["flags"]): string {
  const p = it.params || {};
  const base: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined) base[k] = typeof v === "number" ? v : String(v);
  if (p.address) base.address = short(p.address);
  if (p.implementation) base.implementation = short(p.implementation);
  if (p.via) base.via = short(p.via);
  if (it.code === "check_flag" && typeof p.flag === "string") base.flag = humanFlag(p.flag, "", flags).title;   // Check's own words, localized
  const items = A.items as Record<string, string>;
  // owner_* / upgrade_admin_* share controller templates
  const m = /^(owner|upgrade_admin)_(renounced|eoa|multisig|timelock|contract|unknown)$/.exec(it.code);
  if (m) {
    const role = (A.roles as Record<string, string>)[m[1]];
    const ctl = (A.controller as Record<string, string>)[m[2]];
    const via = p.via ? " " + fmt(A.controller.via, base) : "";
    return fmt(ctl, { ...base, role, delay: typeof p.delay_sec === "number" ? dur(p.delay_sec, A) : "?", owners: p.owners ?? "?" }) + via;
  }
  if (it.code.startsWith("bc_") && !(it.code in items)) {
    const what = (A.what as Record<string, string>)[it.code.slice(3)] ?? it.code.slice(3);
    return fmt(A.items.bc_function, { ...base, what });
  }
  if (it.code === "slither") {
    const ck = String(p.check ?? "");
    const meaning = (A.slither.checks as Record<string, string>)[ck] ?? A.slither.other;
    return fmt(A.slither.line, { check: ck, meaning, confidence: (A.slither.confidence as Record<string, string>)[String(p.confidence)] ?? String(p.confidence ?? "?") });
  }
  if (it.code === "bytecode_unknown" || it.code === "slither_unknown" || it.code === "bytecode_match" || it.code === "bytecode_mismatch") {
    base.reason = (A.reasons as Record<string, string>)[String(p.reason ?? "other")] ?? A.reasons.other;
  }
  if (it.code === "section_nothing_found" || it.code === "section_not_analyzed") base.section = A.sections[it.category] ?? it.category;
  if (it.code === "rpc_unavailable" || it.code === "rpc_partial") base.status = String(p.status ?? "?");
  const tpl = items[it.code];
  return tpl ? fmt(tpl, base) : fmt(A.items.unknown_code, { code: it.code });
}

export function whereText(A: Dict["audit"], it: AuditItem): string {
  const p = it.params || {};
  const parts: string[] = [];
  if (p.functions) parts.push(fmt(A.where.functions, { f: String(p.functions) }));
  else if (p.function) parts.push(fmt(A.where.functions, { f: String(p.function) }));
  if (p.file) parts.push(`${shortFile(p.file)}${p.line ? `:${p.line}` : ""}`);
  if (p.at) parts.push(fmt(A.where.at, { a: short(p.at) }));
  return parts.join(" · ");
}

const SEV: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };
export function bySection(items: AuditItem[]): { section: AuditSection; items: AuditItem[] }[] {
  return AUDIT_SECTIONS.map((s) => ({ section: s, items: items.filter((i) => i.category === s).sort((a, b) => SEV[a.severity] - SEV[b.severity]) }));
}

export const itemKey = (it: AuditItem, i: number) => `${it.category}:${it.code}:${i}`;
