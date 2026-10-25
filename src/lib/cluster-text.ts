// Engine codes -> localized text for the cluster graph / report. Pure (unit-tested).
// The engine emits stable {code, params} twins next to every English string (role_code, hit_codes, unknown_codes,
// note_codes, scanned.*_scan.reason_code); text lives only in the i18n dictionaries. Unknown code -> English engine text.
import { fmt, type Dict } from "@/i18n/fmt";
import { redact } from "./redact";

export type CT = Dict["cluster"];
export interface Coded { code: string; params: Record<string, unknown> }

const ADDR_PARAMS = new Set(["funder", "sink", "rugcheck_creator", "signer", "from"]);

function short(a: string): string {
  return !a || a.length < 14 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function fmtNum(x: number): string {
  if (!Number.isFinite(x)) return "UNKNOWN";
  const a = Math.abs(x);
  if (a >= 1e6) return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(x);
  if (a >= 1) return String(+x.toFixed(4));
  return String(+x.toPrecision(4));
}

export function asCoded(x: unknown): Coded | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.code !== "string" || !o.code) return null;
  const p = o.params && typeof o.params === "object" && !Array.isArray(o.params) ? (o.params as Record<string, unknown>) : {};
  return { code: o.code, params: p };
}

/** params -> display strings; missing placeholders become UNKNOWN (never a raw "{x}") */
function vars(tpl: string, params: Record<string, unknown>, extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tpl.matchAll(/\{(\w+)\}/g)) {
    const k = m[1];
    if (k in extra) { out[k] = extra[k]; continue; }
    const v = params[k];
    if (typeof v === "number") out[k] = fmtNum(v);
    else if (typeof v === "string" && v) out[k] = redact(ADDR_PARAMS.has(k) ? short(v) : v.slice(0, 120));
    else if (typeof v === "boolean") out[k] = v ? "yes" : "no";
    else out[k] = "UNKNOWN";
  }
  return out;
}

function tr(tpl: string | undefined, params: Record<string, unknown>, extra?: Record<string, string>): string | null {
  return typeof tpl === "string" ? fmt(tpl, vars(tpl, params, extra)) : null;
}

/** reason code (+ params) -> text */
export function reasonText(code: unknown, params: Record<string, unknown>, t: CT): string {
  if (typeof code !== "string" || !code) return "UNKNOWN";
  const s = tr(t.reasons[code], params);
  return s ?? redact(code);
}

export function roleText(n: { role: string; roleCode: string | null; roleParams: Record<string, unknown>; mixerFunded: boolean }, t: CT): string {
  const base = n.roleCode && n.roleCode !== "other" ? tr(t.roles[n.roleCode], n.roleParams) : null;
  if (!base) return n.role;
  return n.mixerFunded ? fmt(t.mixerFunded, { role: base }) : base;
}

/** which transfer an amount / timing hit was computed on, and from whom */
export function basisText(params: Record<string, unknown>, t: CT): string | null {
  const b = params.basis;
  return typeof b === "string" && b ? tr(t.basis[b], params) ?? redact(b) : null;
}

export function hitText(h: Coded, fallback: string, t: CT): string {
  let key = h.code;
  if ((key === "funded_by_deployer" || key === "funded_by_mother") && h.params.first_funder) key += "_first";
  if (key === "recycled_to_deployer_or_mother") key = h.params.to === "mother" ? "recycled_mother" : "recycled_deployer";
  let tpl = t.hitTexts[key];
  if (typeof tpl !== "string") return fallback;
  const basis = basisText(h.params, t);
  if (!basis) tpl = tpl.replace(/\s*[(（]\{basis\}[)）]/u, ""); // older envelopes: no basis recorded
  return fmt(tpl, vars(tpl, h.params, basis ? { basis } : {}));
}

/** how an excluded contract / program / service showed up (never worded as "funded") */
export function interactionText(c: Coded, t: CT): string {
  const s = tr(t.interactionTexts[c.code], c.params);
  if (s) return s;
  return tr(t.interactionTexts.interacted_with_deployer, {}) ?? redact(c.code);
}

export function edgeText(e: { label: string; code: Coded | null }, t: CT): string {
  if (!e.code) return e.label;
  return tr(t.edgeCodes[e.code.code], e.code.params) ?? e.label;
}

export function unknownText(u: Coded, fallback: string, t: CT): string {
  const tpl = t.unknownCodes[u.code];
  if (typeof tpl !== "string") return fallback;
  return fmt(tpl, vars(tpl, u.params, { reason: reasonText(u.params.reason_code, u.params, t) }));
}

export function noteText(n: Coded, fallback: string, t: CT): string {
  const tpl = t.noteCodes[n.code];
  if (typeof tpl !== "string") return fallback;
  let reason = reasonText(n.params.reason_code, n.params, t);
  if (typeof n.params.label === "string" && n.params.label && n.code === "mother_not_scanned") reason += ` (${redact(n.params.label.slice(0, 80))})`;
  return fmt(tpl, vars(tpl, n.params, { reason }));
}

export interface ScanInfo { status: string; reasonCode: string | null; txs: number | null; label: string | null; params: Record<string, unknown> }

export function scanText(s: ScanInfo | null, t: CT): string {
  if (!s) return t.scanStatus.not_run;
  const head = s.status === "scanned" ? fmt(t.scanStatus.scanned, { n: s.txs ?? 0 }) : (t.scanStatus[s.status] ?? redact(s.status));
  if (s.status === "scanned" || !s.reasonCode) return head;
  return `${head} — ${reasonText(s.reasonCode, s.params, t)}${s.label ? ` (${redact(s.label)})` : ""}`;
}

export function kindText(k: string | null, t: CT): string {
  return k ? t.kinds[k] ?? redact(k) : "UNKNOWN";
}

/** "via" code of an interacted contract (no params) -> its interaction wording without numbers */
export function viaText(code: string, t: CT): string {
  const tpl = t.interactionTexts[code] ?? t.interactionTexts.interacted_with_deployer;
  return tpl.replace(/\s*\{\w+\}(\s*\{\w+\})*/g, "").replace(/\s{2,}/g, " ").trim();
}
