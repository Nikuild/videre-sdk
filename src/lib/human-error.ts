// Backend error code + raw message -> human title, "what to do next" and a sanitised technical detail.
// The UI never shows guard jargon (SSRF / allowlist): such words are rewritten even inside the folded technical detail.
import type { Dict } from "@/i18n/fmt";
import { fmtDuration } from "./time";

export function sanitizeTech(msg: string | null | undefined): string | null {
  if (!msg) return null;
  return msg
    .replace(/refused by allowlist\/SSRF guard/gi, "blocked by our network safety check")
    .replace(/\bSSRF\b( guard)?/gi, "network safety check")
    .replace(/\ballow-?list(ed)?\b/gi, "approved list")
    .replace(/\bnon_public_host\b/gi, "private address")
    .slice(0, 400);
}

export function humanError(te: Dict["errors"], code: string | null | undefined, raw?: string | null, retryAfter?: number | null) {
  const c = (code || "").toLowerCase();
  let e = te.codes[c];
  if (!e && /rpc/.test(c)) e = te.codes.rpc_unavailable;
  if (!e && /^bad_|missing_|invalid/.test(c)) e = te.codes.bad_address;
  e = e ?? te.generic;
  const s = retryAfter && retryAfter > 0 ? (retryAfter < 60 ? `${retryAfter} s` : fmtDuration(retryAfter)) : "a minute";
  return { title: e.title, next: e.next.replace("{s}", s), detail: sanitizeTech(raw) };
}
