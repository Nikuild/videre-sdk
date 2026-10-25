// Recent checks (spec MVP #7). Shape of /api/v1/history items; parsing is defensive and drops anything unexpected
// (only these five fields are ever rendered - no PII). Pure functions (unit-tested).
import { verdictKind, type VerdictKind } from "./verdict";
import { fmtUtc } from "./time";

export type HistoryMode = "token" | "url" | "cluster" | "ticker";
export interface HistoryItem {
  mode: HistoryMode;
  chain: string | null;
  target: string | null;
  verdict: string | null;
  finishedAtUtc: string | null;
}
export interface HistoryRow extends HistoryItem {
  verdictKind: VerdictKind | null;
  when: string | null; // "YYYY-MM-DD HH:MM:SS UTC"
}

const MODES = new Set(["token", "url", "cluster", "ticker"]);
const UTC_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const s = (x: unknown, max: number) => (typeof x === "string" && x ? x.slice(0, max) : null);

export function parseHistory(body: unknown): HistoryItem[] {
  const items = body && typeof body === "object" ? (body as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return [];
  const out: HistoryItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    if (typeof r.mode !== "string" || !MODES.has(r.mode)) continue;
    const target = s(r.target, 48);
    // defence in depth: only ever show a shortened address (backend already truncates)
    const shortTarget = target && /^(0x[0-9a-fA-F]{20,}|[1-9A-HJ-NP-Za-km-z]{25,})$/.test(target) ? `${target.slice(0, 6)}…${target.slice(-4)}` : target;
    const fin = s(r.finished_at_utc, 40);
    out.push({ mode: r.mode as HistoryMode, chain: s(r.chain, 16), target: shortTarget, verdict: s(r.verdict, 48), finishedAtUtc: fin && UTC_Z.test(fin) ? fin : null });
  }
  return out;
}

export function historyRows(items: HistoryItem[]): HistoryRow[] {
  return items.map((i) => ({
    ...i,
    // token / url verdicts map onto the four badges (SAFE impossible); cluster rows carry no verdict badge
    verdictKind: i.mode === "token" || i.mode === "url" ? verdictKind(i.verdict).kind : null,
    when: i.finishedAtUtc ? fmtUtc(i.finishedAtUtc) : null,
  }));
}
