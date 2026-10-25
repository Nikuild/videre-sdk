// Simulate B («Decode signature»): locale text built from the backend's STRUCTURED fields and codes. The backend keeps
// sending English (summary_en, unknowns[], notes[], risk.note, disclaimer) for API clients; the UI renders every
// sentence from i18n templates in the active locale, so a language switch re-renders an open result without a refetch.
// summary_en / raw text are used only as a fallback for a grant kind (or code) this UI version doesn't know.
// Pure functions -> Part[] (text + address parts, so addresses can be shortened on screen); unit-tested in
// tests/signature-text.test.ts (EN output must equal the backend's summary_en byte for byte).
import type { Dict } from "@/i18n/types";
import type { SigGrant, SigResult, SigTime } from "./signature";

export type D = Dict["signature"]["decoded"];
export interface Part { text: string; addr?: boolean }
type Val = string | number | Part[];

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const SEAPORT: Record<string, string> = { "0x00000000000000adc04c56bf30ac9d3c0aaf14dc": "Seaport 1.5", "0x0000000000000068f116a894984e2db1123eb395": "Seaport 1.6" };

export const addr = (a: string): Part[] => [{ text: a, addr: ADDR.test(a) }];
export const plain = (parts: Part[]): string => parts.map((p) => p.text).join("");

/** "{a} x {b}" + vars -> parts; a var may itself be parts (nested templates, addresses). Unknown placeholders are kept. */
export function fill(tpl: string, vars: Record<string, Val> = {}): Part[] {
  const out: Part[] = [];
  let last = 0;
  for (const m of tpl.matchAll(/\{(\w+)\}/g)) {
    if (m.index! > last) out.push({ text: tpl.slice(last, m.index) });
    const v = vars[m[1]];
    if (v === undefined) out.push({ text: m[0] });
    else if (Array.isArray(v)) out.push(...v);
    else out.push({ text: String(v) });
    last = m.index! + m[0].length;
  }
  if (last < tpl.length) out.push({ text: tpl.slice(last) });
  return merge(out);
}

/** Adjacent text parts -> one (one text node per run between addresses). */
export function merge(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    if (p.text === "") continue;
    const prev = out[out.length - 1];
    if (prev && !prev.addr && !p.addr) prev.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

function tokenParts(g: SigGrant, d: D): Part[] {
  if (g.token_symbol) return [{ text: g.token_symbol }];
  if (g.claimed_name) return fill(d.claimedToken, { name: g.claimed_name, addr: g.token ? addr(g.token) : "None" });
  return g.token ? fill(d.tokenAddr, { addr: addr(g.token) }) : fill(d.unknownToken);
}

function whenParts(u: SigTime | undefined, d: D): Part[] {
  const k = u?.kind || "unknown";
  if (k === "expired") return fill(d.when.expired, { utc: u?.utc || d.epoch0 });
  if (k === "date") return fill(d.when.date, { utc: u?.utc ?? "None" });
  return fill(d.when[k] ?? "");
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function itemParts(g: SigGrant, d: D): Part[] | null {
  const it = g.item_info;
  if (!it || !isNum(it.item_type)) return null;
  const t = it.item_type;
  if (t === 0) return fill(d.itemNative, { amount: it.amount ?? "None" });
  const tok = it.token_symbol ? [{ text: it.token_symbol }] : fill(d.tokenAddr, { addr: addr(String(it.token)) });
  if (t === 1) return it.amount != null ? fill(d.itemErc20, { amount: it.amount, tok }) : fill(d.itemErc20Raw, { raw: it.amount_raw ?? "None", tok });
  const kind = d.itemKinds[String(t)] ?? d.itemGeneric;
  if (t === 4 || t === 5) return fill(d.itemCriteria, { kind, tok, crit: String(it.identifier ?? "").slice(0, 20) });
  if (t === 3) return fill(d.itemIdCount, { kind, tok, id: it.identifier ?? "None", n: it.amount_raw ?? "None" });
  return fill(d.itemId, { kind, tok, id: it.identifier ?? "None" });
}

/** The grant sentence in the active locale, or null when this grant kind / shape isn't known (caller falls back to summary_en). */
export function grantSentence(g: SigGrant, d: D): Part[] | null {
  const who = g.who ? addr(g.who) : fill(d.unknownWho);
  const tok = tokenParts(g, d);
  const what = g.unlimited ? fill(d.unlimited, { tok })
    : g.amount ? fill(d.amount, { amount: g.amount, tok })
    : g.amount_raw ? fill(d.amountRaw, { raw: g.amount_raw, tok }) : tok;
  const when = whenParts(g.until, d);
  const coll = g.token ? addr(g.token) : fill(d.unknownWord);
  switch (g.kind) {
    case "allowance": return g.revoked ? fill(d.revoke, { who, tok }) : fill(d.allowance, { who, what, when });
    case "transfer": return fill(d.transfer, { who, what, when });
    case "operator_all": return g.approved ? fill(d.operatorAll, { who, coll, when }) : fill(d.operatorRevoke, { who, coll });
    case "order_give": { const item = itemParts(g, d); return item ? fill(d.orderGive, { item, when }) : null; }
    case "order_get": {
      const item = itemParts(g, d);
      if (!item || typeof g.recipient_is_offerer !== "boolean") return null;
      return fill(d.orderGet, { item, recipient: g.recipient_is_offerer ? fill(d.offererYou) : addr(g.recipient ?? "") });
    }
    case "safe_call": {
      const s = g.safe_call;
      if (!s) return null;
      const extra = s.function ? (s.args.length ? fill(d.safeRunningArgs, { fn: s.function, args: s.args.join(", ") }) : fill(d.safeRunning, { fn: s.function }))
        : s.selector ? fill(d.safeUnknownSel, { sel: s.selector }) : [];
      return fill(s.operation === 1 ? d.safeDelegate : d.safeCall, { safe: s.safe ? addr(s.safe) : d.unknownWord, to: addr(s.to), wei: s.value_wei, extra });
    }
    case "login":
      if (g.siwe) return fill(d.siwe, { domain: g.siwe.domain, address: addr(g.siwe.address) });
      return g.pattern === "text_message" ? fill(d.login) : null;
    case "opaque":
      if (!isNum(g.byte_len)) return null;
      return g.pattern === "eth_sign" ? fill(d.ethSign, { n: g.byte_len })
        : g.pattern === "opaque_message" ? fill(d.opaqueMsg, { n: g.byte_len, method: g.method || d.messageSignature }) : null;
    case "generic":
      if (g.pattern === "generic_eip712" && g.primary_type) return merge([...fill(d.generic, { type: g.primary_type }), ...(g.who ? fill(d.genericNames, { who }) : [])]);
      if (g.pattern === "invalid_typed_data") return fill(d.invalidTyped);
      if (g.pattern === "legacy_typed_data") return fill(d.legacy);
      return null;
    default: return null;
  }
}

/** Sentence parts, falling back to the backend's English summary when the kind is unknown. */
export function grantSentenceOrFallback(g: SigGrant, d: D): { parts: Part[]; fallback: boolean } {
  const p = grantSentence(g, d);
  return p ? { parts: p, fallback: false } : { parts: [{ text: g.summary_en }], fallback: true };
}

/** Short "What" cell of a grant card (null = no cell). */
export function grantWhatParts(g: SigGrant, d: D): Part[] | null {
  const tok: Part[] | null = g.token_symbol ? [{ text: g.token_symbol }] : g.claimed_name ? fill(d.whatClaimed, { name: g.claimed_name }) : g.token ? fill(d.tokenAddr, { addr: addr(g.token) }) : null;
  if (g.kind === "operator_all") return g.token ? fill(d.whatAllItems, { coll: addr(g.token) }) : fill(d.whatAllItemsUnknown);
  if (g.kind === "order_give" || g.kind === "order_get") return itemParts(g, d) ?? (g.item ? [{ text: g.item }] : null);
  if (!tok) return null;
  if (g.revoked) return fill(d.whatRevoke, { tok });
  if (g.unlimited) return fill(d.unlimited, { tok });
  if (g.amount) return fill(d.amount, { amount: g.amount, tok });
  if (g.amount_raw) return fill(d.whatRaw, { raw: g.amount_raw, tok });
  return tok;
}

// backend role strings -> i18n keys (emitted by the decode endpoint); anything else is a raw field name
const ROLE_KEYS: Record<string, string> = {
  spender: "spender", operator: "operator", owner: "owner", token: "token", "token (verifyingContract)": "tokenVc",
  "Permit2 (canonical)": "permit2", verifyingContract: "verifyingContract", "collection / token": "collection", "offerer (you)": "offererYou",
  zone: "zone", "offered token / NFT": "offered", "consideration recipient": "recipient", "consideration recipient (you)": "recipientYou",
  "Safe (verifyingContract)": "safe", "call target": "callTarget", refundReceiver: "refundReceiver", "SIWE account": "siweAccount",
  "signer (from the request)": "signer",
};
export function roleText(role: string, d: D): string {
  const k = ROLE_KEYS[role];
  if (k && d.roles[k]) return d.roles[k];
  const m = /^(\w+) argument$/.exec(role);
  if (m) return plain(fill(d.roles.argOf, { fn: m[1] }));
  return role;
}

/** Pattern line ("Recognised as"): template by pattern id; vars come from the typed data (primary type, Seaport contract). */
export function patternText(r: SigResult, d: D): string {
  const tpl = d.patterns[r.pattern.id];
  if (!tpl) return r.pattern.name;
  const type = r.hashes?.primary_type_encoding?.split("(")[0] || r.grants.find((g) => g.primary_type)?.primary_type;
  const vc = String(r.domain?.verifyingContract ?? "").toLowerCase();
  const op = r.grants.find((g) => g.kind === "opaque");
  const vars: Record<string, string> = {};
  if (type) vars.type = type;
  vars.name = SEAPORT[vc] ?? d.seaportUnknown;
  vars.method = (op?.method as string | undefined) || r.input.method || d.methodUnknown;
  const s = plain(fill(tpl, vars));
  return /\{(type|name|method)\}/.test(s) ? r.pattern.name : s; // ("Safe{Wallet}" is a brand, not a placeholder)
}

export function chainNameText(r: SigResult, d: D): string {
  if (r.chain.name === "UNKNOWN") return d.unknownWord;
  if (r.chain.key == null && r.chain.chain_id != null && r.chain.name === `chain id ${r.chain.chain_id}`) return plain(fill(d.chainId, { n: r.chain.chain_id }));
  return r.chain.name;
}

const SOURCE_KEYS: Record<string, string> = { "domain.chainId": "domain", "selected network (not in the payload)": "selected", none: "none" };
export function chainSourceText(src: string, d: D): string {
  const k = SOURCE_KEYS[src];
  return (k && d.chainSource[k]) || src;
}

/** unknowns[] / notes[] in the active locale from the parallel *_codes arrays (same order); raw text when a code is unknown. */
export function codedList(texts: string[], codes: { id: string; params?: Record<string, string> }[] | undefined, table: Record<string, string>): string[] {
  return texts.map((raw, i) => {
    const c = codes && codes.length === texts.length ? codes[i] : undefined;
    const tpl = c ? table[c.id] : undefined;
    if (!tpl) return raw;
    const s = plain(fill(tpl, c!.params ?? {}));
    return /\{\w+\}/.test(s) ? raw : s;
  });
}

export function checkReasonText(check: { reason?: string; reason_code?: string } | undefined, chainName: string, d: D): string | undefined {
  const tpl = check?.reason_code ? d.checkReasons[check.reason_code] : undefined;
  return tpl ? plain(fill(tpl, { name: chainName })) : check?.reason;
}
