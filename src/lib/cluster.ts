// Cluster graph view model (engine `cluster` mode via GET /api/v1/cluster). Pure + deterministic (unit-tested).
// Every link / role / mother wallet is INFERENCE with a confidence; only the queried address itself is FACT.
import type { AnyEnvelope, Epistemic } from "./envelope";
import { redact, safeHref } from "./redact";
import { asCoded, type Coded, type ScanInfo } from "./cluster-text";

export type Confidence = "high" | "medium" | "low" | "n/a";
export type Group = "spine" | "upper" | "lower" | "contract";

export interface GNode {
  id: string;
  address: string;
  short: string;
  role: string; // English engine text (fallback)
  roleCode: string | null; // engine role_code -> t.cluster.roles
  roleParams: Record<string, unknown>;
  mixerFunded: boolean;
  member: boolean; // false => CEX / bridge / router / LST / program / service: shown, never counted
  interacted: boolean; // "interacted contract" (excluded from membership)
  entityLabel: string | null; // e.g. "Exchange A", "ExampleSwap V2 Router" (INFERENCE from a seed list)
  contractKind: string | null;
  label: Epistemic;
  confidence: Confidence;
  score: number | null;
  hits: string[];
  hitCodes: (Coded | null)[]; // index-aligned with hits
  interaction: Coded[];
  serialMinter: boolean;
  createdTokens: number | null;
  link: string | null;
  balancePct: string | null; // null => not computed / UNKNOWN
  isTarget: boolean;
  isMother: boolean;
  group: Group;
  x: number;
  y: number;
  tone: "red" | "gold" | "cyan" | "muted";
}

export interface GEdge {
  source: string;
  target: string;
  label: string; // English engine label (fallback)
  code: Coded | null; // engine edge_codes twin
  onSpine: boolean;
}

export interface ClusterView {
  status: string;
  sectionStatus: string;
  sectionOk: boolean;
  sectionError: string | null;
  chain: string;
  address: string;
  targetType: string | null;
  fetchedAt: string | null;
  generatedAt: string | null;
  requested: string | null;
  finished: string | null;
  cached: boolean;
  params: { depth: number; maxNodes: number } | null;
  deployer: string | null;
  mother: { address: string; role: string | null; roleCode: string | null; label: "INFERENCE"; confidence: Confidence; entityLabel: string | null } | null;
  deployerSource: string | null;
  serial: { n: number | null; scanned: number | null; history: number | null; complete: boolean } | null;
  deployerScan: ScanInfo | null;
  motherScan: ScanInfo | null;
  interacted: { address: string; short: string; kind: string | null; label: string | null; via: string[]; interaction: Coded[]; link: string | null }[];
  pngLangs: string[];
  heldPct: string | null;
  soldPct: string | null;
  nodes: GNode[];
  edges: GEdge[];
  width: number;
  height: number;
  unknowns: string[];
  notes: string[];
  unknownCodes: (Coded | null)[]; // index-aligned with unknowns
  noteCodes: (Coded | null)[]; // index-aligned with notes
  discipline: string | null;
  scanned: Record<string, unknown> | null;
  pngUrl: string | null;
  pngError: string | null;
  error: { code: string; message: string } | null;
  disclaimer: string | null;
}

const CORE = new Set(["token contract", "seed wallet"]);
const UPPER = /^(seeded|supply|early|top holder|cluster)/;
const CONF = new Set(["high", "medium", "low", "n/a"]);
const CASE_SENSITIVE = new Set(["solana", "tron"]);

function rec(x: unknown): Record<string, unknown> | null {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

export function shortAddr(a: string): string {
  return !a || a.length < 14 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function tone(role: string, conf: Confidence, interacted: boolean): GNode["tone"] {
  if (interacted) return "muted";
  if (/mixer/i.test(role) || conf === "high") return "red";
  if (CORE.has(role) || role === "deployer" || role.startsWith("mother") || conf === "medium") return "gold";
  if (/CEX|bridge|sink|exchange|service/i.test(role)) return "cyan";
  return "muted";
}

const SPACING_X = 170;
const ROW_Y = 150;
const PER_ROW = 6;

export function buildClusterView(env: AnyEnvelope): ClusterView {
  const r = rec(env.result) || {};
  const sec = rec(r.section) || {};
  const d = rec(sec.data) || {};
  const chain = String(env.chain || r.chain || d.chain || "UNKNOWN");
  const key = (a: string) => (CASE_SENSITIVE.has(chain) ? a : a.toLowerCase());
  const target = String(d.target || env.address || r.input || "");
  const sectionOk = String(sec.status || "").toUpperCase() === "OK";

  const rawNodes = Array.isArray(d.nodes) ? (d.nodes as unknown[]).map(rec).filter((n): n is Record<string, unknown> => !!n && typeof n.address === "string") : [];
  const mother = typeof d.mother_wallet === "string" && d.mother_wallet ? d.mother_wallet : null;
  const nodes: GNode[] = rawNodes.map((n) => {
    const address = String(n.address);
    const role = redact(String(n.role || "cluster candidate"));
    const isTarget = key(address) === key(target);
    const fact = isTarget || CORE.has(role);
    const member = n.member !== false || fact;
    const roleCode = typeof n.role_code === "string" && n.role_code ? n.role_code : null;
    const interacted = !member && (roleCode === "interacted_contract" || role === "interacted contract");
    let conf = String(n.confidence || "").toLowerCase() as Confidence;
    if (!CONF.has(conf) || (!fact && member && conf === "n/a")) conf = "low";
    if (fact || !member) conf = "n/a"; // non-members carry no membership confidence
    const bal = n.balance_pct;
    const hits = Array.isArray(n.hits) ? (n.hits as unknown[]).map((h) => redact(String(h))) : [];
    const hc = Array.isArray(n.hit_codes) ? (n.hit_codes as unknown[]) : [];
    const ent = typeof n.entity_label === "string" ? n.entity_label : typeof n.label === "string" && !["FACT", "INFERENCE", "UNKNOWN"].includes(n.label) ? n.label : null;
    return {
      id: key(address),
      address,
      short: shortAddr(address),
      role,
      roleCode,
      roleParams: rec(n.role_params) || {},
      mixerFunded: n.mixer_funded === true || /\[mixer-funded\]/.test(role),
      member,
      interacted,
      entityLabel: ent ? redact(ent.slice(0, 120)) : null,
      contractKind: typeof n.contract_kind === "string" ? n.contract_kind : typeof n.kind === "string" ? n.kind : null,
      // backend sets label; the UI enforces the rule regardless: only the queried address is FACT
      label: fact ? "FACT" : "INFERENCE",
      confidence: conf,
      score: typeof n.score === "number" ? n.score : null,
      hits,
      hitCodes: hits.map((_, i) => asCoded(hc[i])),
      interaction: Array.isArray(n.interaction) ? (n.interaction as unknown[]).map(asCoded).filter((x): x is Coded => !!x) : [],
      serialMinter: n.serial_minter === true,
      createdTokens: typeof n.created_tokens === "number" ? n.created_tokens : null,
      link: safeHref(n.link),
      balancePct: typeof bal === "number" ? `${bal}%` : bal === "UNKNOWN" ? "UNKNOWN" : null,
      isTarget,
      isMother: !!mother && key(address) === key(mother),
      group: "lower",
      x: 0,
      y: 0,
      tone: tone(role, conf, interacted),
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // layout (same idea as the engine PNG): hop chain on a left->right spine (mother left, token right), rest in rows above/below
  const hop = Array.isArray(d.hop_chain) ? (d.hop_chain as unknown[]).map((a) => key(String(a))) : [];
  const spine = [...new Set(hop.reverse())].filter((id) => byId.has(id));
  if (!spine.length && byId.has(key(target))) spine.push(key(target));
  const spineW = Math.max(0, spine.length - 1) * SPACING_X;
  spine.forEach((id, i) => Object.assign(byId.get(id)!, { group: "spine", x: i * SPACING_X, y: 0 }));
  const rest = nodes.filter((n) => !spine.includes(n.id));
  const contracts = rest.filter((n) => n.interacted);
  const upper = rest.filter((n) => !n.interacted && UPPER.test(n.role));
  const lower = rest.filter((n) => !n.interacted && !UPPER.test(n.role));
  const place = (grp: GNode[], dir: 1 | -1, g: Group) => {
    const per = Math.max(1, Math.min(PER_ROW, grp.length));
    grp.forEach((n, i) => {
      const row = Math.floor(i / per), col = i % per;
      n.group = g;
      n.x = spineW / 2 - ((per - 1) * SPACING_X) / 2 + col * SPACING_X;
      n.y = dir * (ROW_Y + row * (ROW_Y * 0.8));
    });
  };
  place(upper, -1, "upper");
  place(lower, 1, "lower");
  // interacted contracts: their own row(s) under everything else (never mixed with cluster members)
  const lowerRows = lower.length ? Math.ceil(lower.length / Math.max(1, Math.min(PER_ROW, lower.length))) : 0;
  const cPer = Math.max(1, Math.min(PER_ROW, contracts.length));
  contracts.forEach((n, i) => {
    const row = Math.floor(i / cPer), col = i % cPer;
    n.group = "contract";
    n.x = spineW / 2 - ((cPer - 1) * SPACING_X) / 2 + col * SPACING_X;
    n.y = ROW_Y + (lowerRows + row) * (ROW_Y * 0.8) + (lowerRows ? ROW_Y * 0.2 : 0);
  });
  const pad = 110;
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const minX = Math.min(0, ...xs) - pad, maxX = Math.max(0, ...xs) + pad;
  const minY = Math.min(-ROW_Y, ...ys) - 70, maxY = Math.max(ROW_Y, ...ys) + 70;
  for (const n of nodes) {
    n.x = Math.round(n.x - minX);
    n.y = Math.round(n.y - minY);
  }

  const edges: GEdge[] = [];
  const seen = new Set<string>();
  const ec = Array.isArray(d.edge_codes) ? (d.edge_codes as unknown[]) : [];
  (Array.isArray(d.edges) ? (d.edges as unknown[]) : []).forEach((e, ei) => {
    if (!Array.isArray(e) || e.length < 2) return;
    const s = key(String(e[0])), t = key(String(e[1]));
    const k = `${s}>${t}>${e[2] ?? ""}`;
    if (!byId.has(s) || !byId.has(t) || seen.has(k)) return;
    seen.add(k);
    edges.push({ source: s, target: t, label: redact(String(e[2] ?? "")), code: asCoded(ec[ei]), onSpine: spine.includes(s) && spine.includes(t) });
  });

  const mnode = mother ? byId.get(key(mother)) : undefined;
  // 0 cluster members counted => nothing was measured: UNKNOWN, never "0%"
  const measured = typeof d.cluster_members_counted !== "number" || d.cluster_members_counted > 0;
  const pct = (x: unknown) => (measured && typeof x === "number" ? `${x}%` : null);
  const p = env.params;
  const sc = rec(d.scanned) || {};
  const scan = (x: unknown): ScanInfo | null => {
    const o = rec(x);
    if (!o || typeof o.status !== "string") return null;
    const params: Record<string, unknown> = { ...(rec(o.reason_params) || {}) };
    if (o.status_detail !== undefined) params.status = o.status_detail;
    return { status: o.status, reasonCode: typeof o.reason_code === "string" ? o.reason_code : null, txs: typeof o.txs === "number" ? o.txs : null,
      label: typeof o.label === "string" ? redact(o.label.slice(0, 80)) : null, params };
  };
  const unknowns = Array.isArray(d.unknowns) ? (d.unknowns as unknown[]).map((u) => redact(String(u))) : [];
  const notes = Array.isArray(d.notes) ? (d.notes as unknown[]).map((u) => redact(String(u))) : [];
  const uc = Array.isArray(d.unknown_codes) ? (d.unknown_codes as unknown[]) : [];
  const nc = Array.isArray(d.note_codes) ? (d.note_codes as unknown[]) : [];
  const noteCodes = notes.map((_, i) => asCoded(nc[i]));
  const sm = noteCodes.find((c) => c?.code === "serial_minter")?.params;
  const num = (x: unknown) => (typeof x === "number" ? x : null);
  const interacted = (Array.isArray(d.interacted_contracts) ? (d.interacted_contracts as unknown[]) : []).map(rec)
    .filter((x): x is Record<string, unknown> => !!x && typeof x.address === "string")
    .map((x) => {
      const a = String(x.address);
      return { address: a, short: shortAddr(a), kind: typeof x.kind === "string" ? x.kind : null, label: typeof x.label === "string" ? redact(x.label.slice(0, 120)) : null,
        via: [...new Set(Array.isArray(x.via) ? (x.via as unknown[]).map(String) : [])], interaction: byId.get(key(a))?.interaction ?? [], link: byId.get(key(a))?.link ?? null };
    });
  return {
    status: env.status,
    sectionStatus: String(sec.status || "UNKNOWN"),
    sectionOk,
    sectionError: sec.error ? redact(String(sec.error)) : null,
    chain,
    address: target,
    targetType: d.target_type ? String(d.target_type) : null,
    fetchedAt: (sec.fetched_at as string) || null,
    generatedAt: (r.generated_at as string) || null,
    requested: env.requested_at_utc || null,
    finished: env.finished_at_utc || null,
    cached: !!env.cached,
    params: p ? { depth: p.depth, maxNodes: p.max_nodes } : null,
    deployer: typeof d.deployer === "string" ? d.deployer : null,
    mother: mother ? { address: mother, role: d.mother_role ? redact(String(d.mother_role)) : null, roleCode: typeof d.mother_role_code === "string" ? d.mother_role_code : null,
      label: "INFERENCE", confidence: mnode?.confidence && mnode.confidence !== "n/a" ? mnode.confidence : mnode && !mnode.member ? "n/a" : "low", entityLabel: mnode?.entityLabel ?? null } : null,
    deployerSource: typeof d.deployer_source === "string" ? redact(d.deployer_source.slice(0, 120)) : null,
    serial: d.deployer_serial_minter === true || sm ? { n: num(sm?.n), scanned: num(sm?.scanned), history: num(sm?.history), complete: sm?.complete === true } : null,
    deployerScan: scan(sc.deployer_scan),
    motherScan: scan(sc.mother_scan),
    interacted,
    pngLangs: Array.isArray(d.png_langs) ? (d.png_langs as unknown[]).filter((x): x is string => typeof x === "string" && /^[a-z]{2}(-[a-z]{2})?$/.test(x)) : [],
    heldPct: pct(d.cluster_supply_held_pct),
    soldPct: pct(d.cluster_supply_sold_pct_lower_bound),
    nodes,
    edges,
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
    unknowns,
    notes,
    unknownCodes: unknowns.map((_, i) => asCoded(uc[i])),
    noteCodes,
    discipline: d.discipline ? redact(String(d.discipline)) : null,
    scanned: rec(d.scanned),
    pngUrl: typeof env.png_url === "string" && env.png_url.startsWith("/api/v1/cluster/png?") ? env.png_url : null,
    pngError: d.png_error ? redact(String(d.png_error)) : null,
    error: env.error ? { code: String(env.error.code || env.status), message: redact(env.error.message || "") } : null,
    disclaimer: r.disclaimer ? redact(String(r.disclaimer)) : null,
  };
}
