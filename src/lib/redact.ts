// Defence in depth: engine strings can embed provider URLs. Strip query strings and key-like path segments
// (e.g. RPC URLs of the form https://host/v1/<api-key>) before anything is rendered. Addresses/tx hashes outside URLs are kept.
const URL_RE = /https?:\/\/[^\s"'<>)]+/g;

export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname
      .split("/")
      .map((seg) => (/^(?!0x)[A-Za-z0-9_-]{24,}$/.test(seg) ? "***" : seg))
      .join("/");
    return `${u.protocol}//${u.host}${path}${u.search ? "?***" : ""}`;
  } catch {
    return "[url]";
  }
}

export function redact(text: unknown): string {
  if (text === null || text === undefined) return "";
  const s = typeof text === "string" ? text : JSON.stringify(text);
  return s.replace(URL_RE, (m) => redactUrl(m));
}

/** Hosts we render as clickable anchors: the chain explorers + DEX screeners the engine links to. Everything else
 * (project websites, x.com, t.me, … from upstream token metadata) is attacker-controlled and stays plain text. */
export const LINK_HOSTS: ReadonlySet<string> = new Set([
  "etherscan.io", "bscscan.com", "basescan.org", "arbiscan.io", "polygonscan.com", "optimistic.etherscan.io",
  "solscan.io", "explorer.solana.com", "tronscan.org", "robinhoodchain.blockscout.com",
  "dexscreener.com", "www.geckoterminal.com",
]);

/** Only https links to known explorers / DEX screeners are rendered as anchors; anything else -> null (plain text).
 * Blocks javascript:/data:/http:, userinfo, explicit ports, query strings and non-allowlisted hosts. */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 512) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    if (u.search) return null;
    if (!LINK_HOSTS.has(u.hostname.toLowerCase())) return null;
    return u.toString();
  } catch {
    return null;
  }
}
