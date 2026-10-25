// News tab: types, guards, client-side personalization (localStorage only, no account) and pure filter helpers.
// The backend sends codes (why_code / label_code / impact.reason_code); human text comes from the i18n dictionary.

export const NEWS_API_PATH = "/api/v1/news/feed";
export const NEWS_THEMES = ["BTC", "ETH", "SOL", "memes", "macro", "ETF", "hacks", "regulation", "listings", "sales"] as const;
export type NewsTheme = (typeof NEWS_THEMES)[number];

export interface NewsSource { source_id: string; name: string; kind: string; official: boolean; url: string; title: string; published_at: string }
export interface NewsImpact { status: "UNKNOWN" | "PENDING" | "MEASURED"; score: number | null; reason_code?: string; moved?: boolean;
  max_move_pct?: number | null; measured_window_min?: number; window_min?: number; elapsed_min?: number }
export interface NewsCard {
  id: string; title: string; summary: string; label: "FACT" | "REPORTED" | "RUMOR"; tickers: string[]; themes: string[]; importance: number;
  source_count: number; sources: NewsSource[]; published_at: string; updated_at: string; impact: NewsImpact;
  why_code?: { theme: string | null; tickers: string[]; label: string; n_sources: number };
  label_code?: { code: string; params: Record<string, string | number> };
  primary_source?: { name: string; url: string } | null;
}
export interface NewsSourceStatus { id: string; name: string; kind: string; host: string; status: string; stale: boolean; fetched_at: string | null; items: number }
export interface NewsStats { cards_seen: number; evaluated: number; moved: number; not_moved: number; unknown: number; share_moved: number | null;
  since_utc: string | null; window_min: number; threshold_major_pct: number; threshold_other_pct: number; pending: number; fact_now: number; reported_now?: number; rumor_now: number; filtered_now: number }
export interface NewsFeed { status: string; kind: "news"; generated_at_utc: string; cards: NewsCard[]; sources: NewsSourceStatus[];
  sources_ok: number; sources_total: number; filtered: { title: string; url: string; source: string; published_at: string; reason: string }[];
  stats: NewsStats; llm?: { enabled: boolean }; market?: { status: string }; cache_age_sec?: number; error?: { code: string } }

export function isNewsFeed(x: unknown): x is NewsFeed {
  const o = x as NewsFeed;
  return !!o && typeof o === "object" && o.kind === "news" && Array.isArray(o.cards) && Array.isArray(o.sources ?? []);
}

export interface NewsPrefs { themes: NewsTheme[]; minImportance: number; hideRumor: boolean; tickers: string[] }
export const DEFAULT_PREFS: NewsPrefs = { themes: [], minImportance: 0, hideRumor: false, tickers: [] };
export const PREFS_KEY = "news.prefs.v1";

export function parseTickers(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.split(/[\s,;]+/)) {
    const t = raw.replace(/^\$/, "").toUpperCase();
    if (/^[A-Z0-9]{2,12}$/.test(t) && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

export function sanitizePrefs(x: unknown): NewsPrefs {
  const o = (x && typeof x === "object" ? x : {}) as Partial<NewsPrefs>;
  const themes = Array.isArray(o.themes) ? NEWS_THEMES.filter((t) => (o.themes as unknown[]).includes(t)) : [];
  const mi = Number(o.minImportance);
  return { themes, minImportance: Number.isFinite(mi) ? Math.max(0, Math.min(100, Math.round(mi))) : 0, hideRumor: o.hideRumor === true,
    tickers: Array.isArray(o.tickers) ? parseTickers(o.tickers.filter((t) => typeof t === "string").join(",")) : [] };
}

export function loadPrefs(): NewsPrefs {
  try { return sanitizePrefs(JSON.parse(localStorage.getItem(PREFS_KEY) || "null")); } catch { return DEFAULT_PREFS; }
}
export function savePrefs(p: NewsPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(sanitizePrefs(p))); } catch { /* private mode: keep in memory */ }
}

/** Themes OR tickers (if any selected) must match; threshold and RUMOR hiding always apply. */
export function filterCards(cards: NewsCard[], p: NewsPrefs): NewsCard[] {
  return cards.filter((c) => {
    if (p.hideRumor && c.label === "RUMOR") return false;
    if (c.importance < p.minImportance) return false;
    if (!p.themes.length && !p.tickers.length) return true;
    return p.themes.some((t) => c.themes.includes(t)) || p.tickers.some((t) => c.tickers.includes(t));
  });
}

export function isDefaultPrefs(p: NewsPrefs): boolean {
  return !p.themes.length && !p.tickers.length && !p.hideRumor && p.minImportance === 0;
}

/** Plain https links only (feed items come from untrusted RSS). No javascript:/data:/http:, no userinfo or ports. */
export function newsHref(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 1024) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    return u.toString();
  } catch { return null; }
}

/** Honest share: null (UNKNOWN) when nothing was measured. */
export function sharePct(s: Pick<NewsStats, "share_moved" | "evaluated">): string | null {
  if (!s.evaluated || s.share_moved == null) return null;
  return `${Math.round(s.share_moved * 100)}%`;
}

export const AD_REASON_CODE: Record<string, string> = {
  "sponsored / press release": "sponsored", "price-prediction / shill": "shill", "exchange promo / campaign": "promo",
};
