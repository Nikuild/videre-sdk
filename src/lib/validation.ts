// Client + server input validation. Mirrors the API validation so obviously bad input never hits the API.
// Truncated addresses (0xaa…985f, 0xaa...985f) are ALWAYS refused.
import { type Chain, isChain, isEvmChain } from "./chains";

const B58 = "1-9A-HJ-NP-Za-km-z";
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const TRON_RE = new RegExp(`^T[${B58}]{33}$`);
const SOL_RE = new RegExp(`^[${B58}]{32,44}$`);
const ELLIPSIS = ["…", "...", "..", "⋯"];

export type Family = "evm" | "solana" | "tron";
export type ValidationErrorCode =
  | "missing_address"
  | "too_long"
  | "truncated_address"
  | "whitespace"
  | "evm_too_short"
  | "evm_bad"
  | "b58_too_short"
  | "unrecognised"
  | "chain_mismatch"
  | "bad_chain"
  | "url_no_address";

export type ValidationResult =
  | { ok: true; address: string; chain: Chain; family: Family; fromUrl: boolean }
  | { ok: false; code: ValidationErrorCode; detail?: string };

export function detectFamily(a: string): Family | null {
  if (EVM_RE.test(a)) return "evm";
  if (TRON_RE.test(a)) return "tron";
  if (SOL_RE.test(a)) return "solana";
  return null;
}

// explorer / aggregator host -> chain hint (used only when the user left the selector on "auto")
const HOST_CHAIN: Record<string, Chain> = {
  "etherscan.io": "eth",
  "bscscan.com": "bsc",
  "basescan.org": "base",
  "arbiscan.io": "arbitrum",
  "polygonscan.com": "polygon",
  "optimistic.etherscan.io": "optimism",
  "solscan.io": "solana",
  "explorer.solana.com": "solana",
  "tronscan.org": "tron",
};
const DEX_SLUG_CHAIN: Record<string, Chain> = {
  ethereum: "eth", eth: "eth", bsc: "bsc", base: "base", arbitrum: "arbitrum",
  polygon: "polygon", polygon_pos: "polygon", optimism: "optimism", solana: "solana", tron: "tron",
};

/** Pull a full address out of an explorer / DexScreener / GeckoTerminal URL. Returns null if none. */
export function extractFromUrl(input: string): { address: string; chainHint?: Chain } | null {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const segs = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  const candidates = [...segs].reverse().concat([...u.searchParams.values()]);
  const address = candidates.find((s) => detectFamily(s) !== null && !/^(tokens?|address|pairs?|account)$/i.test(s));
  if (!address) return null;
  let chainHint: Chain | undefined = HOST_CHAIN[host];
  if (!chainHint && /(dexscreener\.com|geckoterminal\.com)$/.test(host)) {
    const slug = (segs[0] || "").toLowerCase();
    chainHint = DEX_SLUG_CHAIN[slug];
  }
  return { address, chainHint };
}

export function validateInput(rawInput: string | null | undefined, rawChain: string | null | undefined): ValidationResult {
  const chainIn = (rawChain || "auto").trim().toLowerCase();
  if (!isChain(chainIn)) return { ok: false, code: "bad_chain", detail: chainIn };
  let chain: Chain = chainIn;
  let a = (rawInput || "").trim();
  if (!a) return { ok: false, code: "missing_address" };
  if (ELLIPSIS.some((e) => a.includes(e))) return { ok: false, code: "truncated_address" };

  let fromUrl = false;
  if (/^https?:\/\//i.test(a)) {
    const got = extractFromUrl(a);
    if (!got) return { ok: false, code: "url_no_address" };
    a = got.address;
    fromUrl = true;
    if (chain === "auto" && got.chainHint) chain = got.chainHint;
  }
  if (a.length > 128) return { ok: false, code: "too_long" };
  if (/\s/.test(a)) return { ok: false, code: "whitespace" };

  const fam = detectFamily(a);
  if (fam === null) {
    if (a.slice(0, 2).toLowerCase() === "0x") {
      const hex = a.slice(2);
      if (/^[0-9a-fA-F]*$/.test(hex) && hex.length < 40) return { ok: false, code: "evm_too_short", detail: String(hex.length) };
      return { ok: false, code: "evm_bad" };
    }
    if (new RegExp(`^[${B58}]+$`).test(a) && a.length < 32) return { ok: false, code: "b58_too_short", detail: String(a.length) };
    return { ok: false, code: "unrecognised" };
  }
  if (chain !== "auto") {
    if (fam === "evm" && !isEvmChain(chain)) return { ok: false, code: "chain_mismatch", detail: chain };
    if ((fam === "solana" || fam === "tron") && chain !== fam) return { ok: false, code: "chain_mismatch", detail: chain };
  }
  return { ok: true, address: a, chain, family: fam, fromUrl };
}

// ---- stage 3: URL / domain mode. Mirrors backend validate_url_target().
export type UrlErrorCode = "url_bad" | "url_scheme" | "url_ip";
export type UrlResult = { ok: true; target: string; host: string } | { ok: false; code: UrlErrorCode };

const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD_RE = /^([a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

export function urlHost(raw: string): string {
  return raw.replace(/^[a-z]+:\/\//i, "").split("/")[0].split("?")[0].split("#")[0].split("@").pop()!.split(":")[0].toLowerCase().replace(/\.$/, "");
}

export function validateUrlTarget(raw: string | null | undefined): UrlResult {
  const t = (raw || "").trim();
  if (!t || t.length > 2048 || /\s/.test(t) || t.startsWith("//")) return { ok: false, code: "url_bad" };
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(t);
  if (m && !/^https?$/i.test(m[1])) return { ok: false, code: "url_scheme" };
  if (!m && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t) && !/^[^:]+\.[^:]+:\d/.test(t)) return { ok: false, code: "url_scheme" }; // javascript:, data:
  let host = urlHost(t);
  if (/[^\x00-\x7f]/.test(host)) {
    try {
      host = new URL(`http://${host}`).hostname; // IDN -> punycode
    } catch {
      return { ok: false, code: "url_bad" };
    }
  }
  if (!host || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || host === "localhost") return { ok: false, code: "url_ip" };
  const labels = host.split(".");
  if (labels.length < 2 || host.length > 253 || !labels.every((l) => LABEL_RE.test(l)) || !TLD_RE.test(labels[labels.length - 1]))
    return { ok: false, code: "url_bad" };
  return { ok: true, target: t, host };
}

export type InputKind =
  | { kind: "token"; address: string; chain: Chain }
  | { kind: "url"; target: string; host: string }
  | { kind: "error"; code: ValidationErrorCode | UrlErrorCode; detail?: string };

const BARE_DOMAIN = /^(?!0x)[^\s/:]+\.[a-z\u00a1-\uffff-]{2,}(\/\S*)?$/i;

/** Home input router: full address (or explorer/DEX link with one) -> token report; any other link or bare domain -> URL report. */
export function classifyInput(raw: string, chain: string): InputKind {
  const a = (raw || "").trim();
  const isLink = /^https?:\/\//i.test(a);
  const looksDomain = !isLink && !ELLIPSIS.some((e) => a.includes(e)) && BARE_DOMAIN.test(a) && detectFamily(a) === null;
  if (isLink) {
    const tok = validateInput(a, chain);
    if (tok.ok) return { kind: "token", address: tok.address, chain: tok.chain };
    if (tok.code !== "url_no_address") return { kind: "error", code: tok.code, detail: tok.detail };
  }
  if (isLink || looksDomain) {
    const u = validateUrlTarget(a);
    return u.ok ? { kind: "url", target: u.target, host: u.host } : { kind: "error", code: u.code };
  }
  const tok = validateInput(a, chain);
  return tok.ok ? { kind: "token", address: tok.address, chain: tok.chain } : { kind: "error", code: tok.code, detail: tok.detail };
}

/** Path segment for /r/url/<seg>. encodeURIComponent keeps it reversible; "/" is encoded so it stays one segment. */
export function urlReportPath(target: string): string {
  return `/r/url/${encodeURIComponent(target)}`;
}
