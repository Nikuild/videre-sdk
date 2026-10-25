// Simulate tab (stage A): pure helpers - form validation (mirrors the server-side validation), native-amount -> wei,
// and the "human language" view model built from the backend result. Unit-tested in tests/simulate.test.ts.
export const SIM_CHAINS = ["eth", "base", "bsc", "arbitrum"] as const;
export type SimChain = (typeof SIM_CHAINS)[number];
export const SIM_CHAIN_LABELS: Record<SimChain, string> = { eth: "Ethereum", base: "Base", bsc: "BNB Chain", arbitrum: "Arbitrum One" };
export const SIM_NATIVE: Record<SimChain, string> = { eth: "ETH", base: "ETH", bsc: "BNB", arbitrum: "ETH" };
export const SIM_MODES = ["call", "raw", "hash"] as const;
export type SimMode = (typeof SIM_MODES)[number];
export const SIM_API_PATH = "/api/v1/simulate/run";
export const MAX_CALLDATA_BYTES = 49152;

export type SimErrorCode =
  | "required" | "leading_dash" | "bad_address" | "truncated_address" | "looks_like_key" | "bad_hex" | "too_long"
  | "short_selector" | "bad_value" | "bad_hash" | "bad_raw" | "bad_chain";

export interface SimFields { from?: string; to?: string; value?: string; data?: string; raw_tx?: string; tx_hash?: string; block?: "latest" | "parent" }
export type SimBody = Record<string, string | null>;
export type SimFieldError = { field: keyof SimFields | "chain"; code: SimErrorCode; detail?: string };
/** On failure `field`/`code` = the first problem (focus target); `errors` = EVERY invalid field (shown all at once). */
export type SimValidation = { ok: true; body: SimBody } | ({ ok: false; errors?: SimFieldError[] } & SimFieldError);

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const HEX = /^0x(?:[0-9a-fA-F]{2})*$/;
const KEYISH = /^(0x)?[0-9a-fA-F]{64}$/;
const CTRL = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/;

function clean(v: string | undefined): string {
  return (v ?? "").trim();
}

function addrErr(field: "from" | "to", v: string): SimValidation | null {
  if (!v) return { ok: false, field, code: "required" };
  if (v.startsWith("-")) return { ok: false, field, code: "leading_dash" };
  if (/…|\.\.\.|⋯/.test(v)) return { ok: false, field, code: "truncated_address" };
  if (KEYISH.test(v)) return { ok: false, field, code: "looks_like_key" };
  if (!ADDR.test(v)) return { ok: false, field, code: "bad_address" };
  return null;
}

function hexErr(field: "data" | "raw_tx", v: string, maxBytes: number): SimValidation | null {
  if (v.startsWith("-")) return { ok: false, field, code: "leading_dash" };
  if (CTRL.test(v) || /\s/.test(v) || !HEX.test(v)) return { ok: false, field, code: "bad_hex" };
  if ((v.length - 2) / 2 > maxBytes) return { ok: false, field, code: "too_long", detail: String(maxBytes) };
  return null;
}

/** "0.5" (native units, up to `decimals` places) -> wei as a decimal string. Returns null on bad input. */
export function toWei(amount: string, decimals = 18): string | null {
  const s = amount.trim();
  if (!s) return "0";
  if (s.startsWith("-") || !/^\d{1,40}(\.\d+)?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  const wei = BigInt(int) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
  return wei > 2n ** 256n - 1n ? null : wei.toString();
}

export function validateSimForm(chain: string, mode: SimMode, f: SimFields): SimValidation {
  if (!(SIM_CHAINS as readonly string[]).includes(chain)) return { ok: false, field: "chain", code: "bad_chain" };
  if (mode === "call") {
    const from = clean(f.from), to = clean(f.to), data = clean(f.data) || "0x", value = clean(f.value);
    const wei = toWei(value);
    const all = [
      addrErr("from", from),
      addrErr("to", to),
      hexErr("data", data, MAX_CALLDATA_BYTES) ?? (data !== "0x" && data.length < 10 ? ({ ok: false, field: "data", code: "short_selector" } as SimValidation) : null),
      wei === null ? ({ ok: false, field: "value", code: "bad_value" } as SimValidation) : null,
    ].filter((e): e is Extract<SimValidation, { ok: false }> => !!e && !e.ok);
    if (all.length) return { ...all[0], errors: all.map(({ field, code, detail }) => ({ field, code, detail })) };
    if (wei === null) return { ok: false, field: "value", code: "bad_value" };
    return { ok: true, body: { chain, mode, from: from.toLowerCase(), to: to.toLowerCase(), value: wei, data: data.toLowerCase() } };
  }
  if (mode === "raw") {
    const raw = clean(f.raw_tx);
    if (!raw) return { ok: false, field: "raw_tx", code: "required" };
    if (KEYISH.test(raw)) return { ok: false, field: "raw_tx", code: "looks_like_key" };
    const e = hexErr("raw_tx", raw, MAX_CALLDATA_BYTES + 1024); if (e) return e;
    if (raw.length < 82) return { ok: false, field: "raw_tx", code: "bad_raw" };
    return { ok: true, body: { chain, mode, raw_tx: raw.toLowerCase() } };
  }
  const h = clean(f.tx_hash);
  if (!h) return { ok: false, field: "tx_hash", code: "required" };
  if (h.startsWith("-")) return { ok: false, field: "tx_hash", code: "leading_dash" };
  if (!HASH.test(h)) return { ok: false, field: "tx_hash", code: "bad_hash" };
  return { ok: true, body: { chain, mode, tx_hash: h.toLowerCase(), block: f.block === "parent" ? "parent" : "latest" } };
}

// ------------------------------------------------------------------------------------------------ result types
export type Epi = "FACT" | "INFERENCE" | "UNKNOWN";
export interface SimTransfer { standard: string; token: string; from: string; to: string; amount_raw: string; amount?: string | null; token_id?: string | null; symbol?: string | null; decimals?: number | null; label: Epi }
export interface SimApproval { kind: string; token: string; owner: string; spender: string; amount_raw?: string | null; amount?: string | null; unlimited: boolean; unlimited_kind?: string | null; revoked: boolean; expiration_utc?: string | null; symbol?: string | null; token_id?: string | null; via?: string; context?: string | null; label: Epi }
export interface SimNative { address: string; delta_wei: string | null; delta?: string | null; sign?: string; label: Epi }
export interface SimFlag { severity: string; flag: string; evidence?: string; source?: string; label: Epi; confidence?: string | null }
export interface SimCheck { status: "ok" | "unknown"; reason?: string; reason_code?: string; flags: SimFlag[]; counts: Record<string, number> | null; verdict_kind?: string | null; verdict_label?: string | null; report_path?: string | null; unknown_count?: number; flags_total?: number; label_guess?: { label?: string; label_source?: string; kind?: string } | null; cached?: boolean }
export interface SimAddress { address: string; roles: string[]; kind: "token" | "wallet"; check: SimCheck | null }
export interface SimContract { address: string; call_types: string[]; min_depth: number | null; calls: number | null; reverted_calls: number | null; selectors: string[]; label: Epi; has_code?: boolean | null }
export interface SimResult {
  kind: "simulate"; stage: string; chain: SimChain; chain_name: string; native_symbol: string; generated_at: string; duration_sec?: number;
  input: { mode: SimMode; from: string; to: string | null; value_wei: string; data_bytes: number; selector: string | null; tx_hash?: string | null; source: string; block_mode?: string | null; original_block?: number | null };
  fork: { rpc_host: string; rpc_failed_before: string[]; block_number: number; block_time_utc: string | null; label: Epi; gas_price_simulated: string };
  decoded: { selector: string | null; signature: string | null; label: Epi; source: string | null; args: { name: string; type: string; value: string }[] | null; candidates?: string[]; note?: string; explorer?: { contract_name?: string | null } };
  execution: { status: "success" | "reverted" | "not_executable" | "unknown"; label: Epi; revert_reason: string | null; gas_used: number | null };
  native_changes: SimNative[]; token_transfers: SimTransfer[]; approvals: SimApproval[]; contracts_called: SimContract[];
  addresses: SimAddress[]; unknowns: string[]; disclaimer: string; explorer?: { base: string };
}
export interface SimEnvelope { status: "ok" | "error" | "timeout" | "unknown"; kind?: string; chain?: string | null; requested_at_utc?: string; finished_at_utc?: string; disclaimer?: string; result: SimResult | null; error: { code?: string; message?: string; retry_after_sec?: number } | null }

export function isSimEnvelope(x: unknown): x is SimEnvelope {
  return !!x && typeof x === "object" && "status" in x && "result" in x && "error" in x;
}

// ------------------------------------------------------------------------------------------------ human-language view model
export interface Flow { what: string; amount: string; counterparty: string; token: string | null; label: Epi; nft: boolean }
export interface ApprovalLine { remaining: boolean; spender: string; what: string; amount: string; unlimited: boolean; revoked: boolean; kind: string; expires: string | null; label: Epi; token: string }

export const shortAddr = (a: string | null | undefined) => (!a ? "—" : a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function tokenName(t: { symbol?: string | null; token: string }) {
  return t.symbol || `token ${shortAddr(t.token)}`;
}

function amountOf(t: SimTransfer): string {
  if (t.standard === "erc721") return `#${t.token_id}`;
  if (t.standard === "erc1155") return `${t.amount_raw} × #${t.token_id}`;
  return t.amount ?? `${t.amount_raw} (raw units, decimals UNKNOWN)`;
}

export function buildSimView(r: SimResult) {
  const me = r.input.from.toLowerCase();
  const youSend: Flow[] = [], youReceive: Flow[] = [], other: SimTransfer[] = [];
  for (const n of r.native_changes) {
    if (n.address.toLowerCase() !== me || n.label !== "FACT" || !n.delta_wei || n.delta_wei === "0") continue;
    const f: Flow = { what: r.native_symbol, amount: n.delta ?? n.delta_wei, counterparty: "", token: null, label: "FACT", nft: false };
    (n.delta_wei.startsWith("-") ? youSend : youReceive).push(f);
  }
  for (const t of r.token_transfers) {
    const f = (cp: string): Flow => ({ what: tokenName(t), amount: amountOf(t), counterparty: cp, token: t.token, label: t.label, nft: t.standard !== "erc20" });
    if (t.from === me && t.to === me) continue;
    if (t.from === me) youSend.push(f(t.to));
    else if (t.to === me) youReceive.push(f(t.from));
    else other.push(t);
  }
  const approvals: ApprovalLine[] = r.approvals.filter((a) => a.owner === me).map((a) => ({
    remaining: a.context === "remaining_after_spend", spender: a.spender, kind: a.kind, token: a.token, label: a.context === "remaining_after_spend" ? "INFERENCE" : a.label, revoked: a.revoked, unlimited: a.unlimited, expires: a.expiration_utc ?? null,
    what: a.kind === "approval_for_all" ? `all items of ${tokenName(a)}` : a.kind === "erc721" ? `${tokenName(a)} #${a.token_id}` : tokenName(a),
    amount: a.revoked ? "0" : a.unlimited ? "UNLIMITED" : a.amount ?? `${a.amount_raw} (raw units)`,
  }));
  const otherApprovals = r.approvals.filter((a) => a.owner !== me);
  const otherNative = r.native_changes.filter((n) => n.address.toLowerCase() !== me && n.label === "FACT" && n.delta_wei && n.delta_wei !== "0");
  const flagged = r.addresses.filter((a) => a.check?.status === "ok" && a.check.counts && (a.check.counts.critical > 0 || a.check.counts.high > 0));
  const unchecked = r.addresses.filter((a) => a.check?.status !== "ok");
  const nativeUnknown = r.native_changes.some((n) => n.address.toLowerCase() === me && n.label === "UNKNOWN");
  return { me, youSend, youReceive, other, approvals, otherApprovals, otherNative, flagged, unchecked, nativeUnknown,
           unlimited: approvals.filter((a) => a.unlimited && !a.revoked && !a.remaining) };
}

/** Sample for the "Try a sample transaction" button: Ethereum, approve(ExampleSwap V2 router, UNLIMITED) on XCOIN.
 * Read-only: only simulated on a fork. From = a well-known public address (example.eth), not anyone's key. */
export const SIM_SAMPLE = {
  chain: "eth" as SimChain,
  from: "0x0000000000000000000000000000000000000002",
  to: "0x0000000000000000000000000000000000000001", // XCOIN
  value: "",
  data: "0x095ea7b3" + "0".repeat(24) + "0000000000000000000000000000000000000003" + "f".repeat(64),
};
