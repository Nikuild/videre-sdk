// Client-safe i18n helpers (no locale tables here, so importing this never bundles all locale dictionaries).
export type { Dict } from "./types";

/** "{n} tokens" + {n: 3} -> "3 tokens". Plain string substitution: the result is rendered as React text, never as HTML. */
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
