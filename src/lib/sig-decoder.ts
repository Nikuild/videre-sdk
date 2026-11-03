// Offline typed-data / signature decoder: EIP-2612 permit, Permit2 (single, batch, transfer, batch transfer),
// Seaport order, eth_sign raw hash, SIWE (EIP-4361). Pure: no network, no signing.
// Output is structural facts only (who spends, which tokens, amounts, deadline, unlimited flag); it is not a verdict.

export interface TokenRef { chainId: number; address: string; symbol: string; decimals: number; source?: string; license?: string }
export interface DecodeOpts { tokens?: TokenRef[]; now?: number }
export type SigKind = "eip2612_permit" | "permit2_single" | "permit2_batch" | "permit2_transfer" | "permit2_batch_transfer"
  | "seaport_order" | "eth_sign_hash" | "siwe" | "typed_data_unknown" | "invalid";
export interface TokenAmount { token: string; symbol?: string; decimals?: number; verified: boolean; amount: string; unlimited: boolean; expiration?: number | null }
export interface Decoded {
  kind: SigKind; chainId: number | null; verifyingContract: string | null; owner: string | null; spender: string | null;
  tokens: TokenAmount[]; deadline: number | null; expired: boolean | null; unlimited: boolean; notes: string[];
  siwe?: Record<string, string>;
}

const MAX160 = (1n << 160n) - 1n, MAX256 = (1n << 256n) - 1n;
export const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const ONE_YEAR = 365 * 86400;
const lc = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null);
const big = (v: unknown): bigint | null => { try { return v === undefined || v === null ? null : BigInt(v as string); } catch { return null; } };
const num = (v: unknown): number | null => { const b = big(v); return b === null ? null : b > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(b); };

function base(kind: SigKind, chainId: number | null = null, vc: string | null = null): Decoded {
  return { kind, chainId, verifyingContract: vc, owner: null, spender: null, tokens: [], deadline: null, expired: null, unlimited: false, notes: [] };
}

function tok(chainId: number | null, addr: unknown, amount: unknown, max: bigint, opts: DecodeOpts, exp?: number | null): TokenAmount {
  const a = lc(addr) ?? "", amt = big(amount) ?? 0n;
  const t = opts.tokens?.find((x) => x.chainId === chainId && x.address.toLowerCase() === a);
  const out: TokenAmount = { token: a, verified: !!t, amount: amt.toString(), unlimited: amt >= max || amt >= MAX160 };
  if (t) { out.symbol = t.symbol; out.decimals = t.decimals; }
  if (exp !== undefined) out.expiration = exp;
  return out;
}

function finish(d: Decoded, now: number): Decoded {
  d.unlimited = d.tokens.some((t) => t.unlimited);
  const exps = [d.deadline, ...d.tokens.map((t) => t.expiration ?? null)].filter((x): x is number => x !== null && x !== undefined);
  if (exps.length) {
    d.expired = exps.every((e) => e !== 0 && e < now);
    if (exps.some((e) => e === 0 || e - now >= ONE_YEAR)) d.notes.push("long_validity");
  }
  if (d.unlimited) d.notes.push("unlimited_amount");
  return d;
}

function parseSiwe(s: string): Record<string, string> | null {
  const lines = s.replace(/\r/g, "").split("\n");
  const m = /^(\S+) wants you to sign in with your Ethereum account:$/.exec(lines[0] ?? "");
  if (!m || !/^0x[0-9a-fA-F]{40}$/.test(lines[1] ?? "")) return null;
  const r: Record<string, string> = { domain: m[1]!, address: lines[1]!.toLowerCase() };
  if (lines[3] && !/^[A-Z][A-Za-z ]+: /.test(lines[3])) r.statement = lines[3];
  for (const l of lines) { const kv = /^(URI|Version|Chain ID|Nonce|Issued At|Expiration Time|Not Before|Request ID): (.+)$/.exec(l); if (kv) r[kv[1]!] = kv[2]!; }
  return r;
}

export function decodeSignature(payload: unknown, opts: DecodeOpts = {}): Decoded {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (typeof payload === "string") {
    const s = payload.trim();
    if (/^0x[0-9a-fA-F]{64}$/.test(s)) {
      const d = base("eth_sign_hash"); d.notes.push("blind_hash_signature"); return d;
    }
    const siwe = parseSiwe(s);
    if (siwe) {
      const d = base("siwe", siwe["Chain ID"] ? Number(siwe["Chain ID"]) : null);
      d.owner = siwe.address ?? null; d.siwe = siwe;
      if (siwe["Expiration Time"]) { const t = Date.parse(siwe["Expiration Time"]); if (!Number.isNaN(t)) { d.deadline = Math.floor(t / 1000); d.expired = d.deadline < now; } }
      if (siwe.URI) { try { if (new URL(siwe.URI).host !== siwe.domain) d.notes.push("siwe_domain_uri_mismatch"); } catch { d.notes.push("siwe_bad_uri"); } }
      return d;
    }
    if (s[0] !== "{") return base("invalid");
    try { payload = JSON.parse(s); } catch { return base("invalid"); }
  }
  if (!payload || typeof payload !== "object") return base("invalid");
  const td = payload as { domain?: Record<string, unknown>; primaryType?: string; message?: Record<string, any> };
  const dom = td.domain ?? {}, m = td.message ?? {}, pt = td.primaryType ?? "";
  const chainId = num(dom.chainId), vc = lc(dom.verifyingContract);
  const d = base("typed_data_unknown", chainId, vc);

  if (pt === "Permit" && "spender" in m && "value" in m) {
    d.kind = "eip2612_permit"; d.owner = lc(m.owner); d.spender = lc(m.spender); d.deadline = num(m.deadline);
    d.tokens.push(tok(chainId, vc, m.value, MAX256, opts));
  } else if (pt === "PermitSingle" && m.details) {
    d.kind = "permit2_single"; d.spender = lc(m.spender); d.deadline = num(m.sigDeadline);
    d.tokens.push(tok(chainId, m.details.token, m.details.amount, MAX160, opts, num(m.details.expiration)));
  } else if (pt === "PermitBatch" && Array.isArray(m.details)) {
    d.kind = "permit2_batch"; d.spender = lc(m.spender); d.deadline = num(m.sigDeadline);
    for (const x of m.details) d.tokens.push(tok(chainId, x?.token, x?.amount, MAX160, opts, num(x?.expiration)));
  } else if ((pt === "PermitTransferFrom" || pt === "PermitWitnessTransferFrom") && m.permitted) {
    d.spender = lc(m.spender); d.deadline = num(m.deadline);
    if (Array.isArray(m.permitted)) { d.kind = "permit2_batch_transfer"; for (const x of m.permitted) d.tokens.push(tok(chainId, x?.token, x?.amount, MAX256, opts)); }
    else { d.kind = "permit2_transfer"; d.tokens.push(tok(chainId, m.permitted.token, m.permitted.amount, MAX256, opts)); }
  } else if (pt === "OrderComponents" && Array.isArray(m.offer)) {
    d.kind = "seaport_order"; d.owner = lc(m.offerer); d.deadline = num(m.endTime);
    for (const o of m.offer) d.tokens.push(tok(chainId, o?.token, o?.endAmount ?? o?.startAmount, MAX256, opts));
    const recips = new Set<string>((m.consideration ?? []).map((c: any) => lc(c?.recipient)).filter(Boolean));
    if (d.owner) recips.delete(d.owner);
    const own = (m.consideration ?? []).some((c: any) => lc(c?.recipient) === d.owner);
    if (!own) d.notes.push("seaport_nothing_back_to_offerer");
    d.spender = recips.size === 1 ? [...recips][0]! : null;
    if (recips.size > 1) d.notes.push("seaport_multiple_recipients");
  } else return d;

  if (d.kind.startsWith("permit2") && vc && vc !== PERMIT2) d.notes.push("permit2_unexpected_verifying_contract");
  return finish(d, now);
}
