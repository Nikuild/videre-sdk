// Locale registry + pure routing helpers (no React, no Next imports: used by src/proxy.ts, server and client code, vitest).
//
// URL scheme ("as-needed" prefix): English is the default and lives UNPREFIXED at / (/simulate, /r/...). Every other
// locale is a lower-case path prefix: /ru/..., /de/..., /zh-cn/..., /pt-br/... . /en/... is a 308 redirect to the
// unprefixed URL, so each page has exactly one canonical URL per locale.

export const LOCALES = ["en", "ru", "uk", "es", "pt-br", "de", "fr", "tr", "zh-cn", "ja", "ko"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Cookie mirror of the localStorage choice (lets the server redirect / to /ru without a flash). Holds only a locale code. */
export const LOCALE_COOKIE = "sc_locale";
export const LOCALE_STORAGE_KEY = "videre.locale";
/** Request header set by src/proxy.ts after it strips the prefix (server components read the locale from it). */
export const LOCALE_HEADER = "x-sc-locale";
export const PATH_HEADER = "x-sc-path";

export interface LocaleInfo { code: Locale; htmlLang: string; dir: "ltr" | "rtl"; native: string; english: string; og: string }

export const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  en: { code: "en", htmlLang: "en", dir: "ltr", native: "English", english: "English", og: "en_US" },
  ru: { code: "ru", htmlLang: "ru", dir: "ltr", native: "Русский", english: "Russian", og: "ru_RU" },
  uk: { code: "uk", htmlLang: "uk", dir: "ltr", native: "Українська", english: "Ukrainian", og: "uk_UA" },
  es: { code: "es", htmlLang: "es", dir: "ltr", native: "Español", english: "Spanish", og: "es_ES" },
  "pt-br": { code: "pt-br", htmlLang: "pt-BR", dir: "ltr", native: "Português (Brasil)", english: "Portuguese (Brazil)", og: "pt_BR" },
  de: { code: "de", htmlLang: "de", dir: "ltr", native: "Deutsch", english: "German", og: "de_DE" },
  fr: { code: "fr", htmlLang: "fr", dir: "ltr", native: "Français", english: "French", og: "fr_FR" },
  tr: { code: "tr", htmlLang: "tr", dir: "ltr", native: "Türkçe", english: "Turkish", og: "tr_TR" },
  "zh-cn": { code: "zh-cn", htmlLang: "zh-CN", dir: "ltr", native: "简体中文", english: "Chinese (Simplified)", og: "zh_CN" },
  ja: { code: "ja", htmlLang: "ja", dir: "ltr", native: "日本語", english: "Japanese", og: "ja_JP" },
  ko: { code: "ko", htmlLang: "ko", dir: "ltr", native: "한국어", english: "Korean", og: "ko_KR" },
};

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

export function dirOf(l: Locale): "ltr" | "rtl" {
  return LOCALE_INFO[l].dir;
}

/** "/ru/r/eth/0x.." -> { locale: "ru", rest: "/r/eth/0x..", explicit: true }; "/simulate" -> en, not explicit. */
export function splitLocale(pathname: string): { locale: Locale; rest: string; explicit: boolean } {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const m = /^\/([A-Za-z]{2}(?:-[A-Za-z]{2})?)(?=\/|$)(.*)$/.exec(p);
  if (m) {
    const seg = m[1].toLowerCase();
    if (isLocale(seg)) return { locale: seg, rest: m[2] || "/", explicit: true };
  }
  return { locale: DEFAULT_LOCALE, rest: p, explicit: false };
}

/** Public URL of `path` (unprefixed, starts with "/") in `locale`. EN stays unprefixed. Query / hash are kept. */
export function localePath(locale: Locale, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const { rest } = splitLocale(p);
  if (locale === DEFAULT_LOCALE) return rest;
  if (rest === "/") return `/${locale}`;
  if (/^\/[?#]/.test(rest)) return `/${locale}${rest.slice(1)}`;
  return `/${locale}${rest}`;
}

/** Map a BCP-47 tag (as browsers send it) onto one of our locales, or null. "pt" -> pt-br, "zh"/"zh-Hans*" -> zh-cn. */
export function matchTag(tag: string): Locale | null {
  const t = tag.trim().toLowerCase().replace(/_/g, "-");
  if (!t || t === "*") return null;
  if (isLocale(t)) return t;
  const [base, ...sub] = t.split("-");
  if (base === "zh") return sub.some((s) => s === "tw" || s === "hk" || s === "mo" || s === "hant") ? null : "zh-cn";
  if (base === "pt") return "pt-br";
  return isLocale(base) ? base : null;
}

/** Accept-Language negotiation (q-values honoured, ties keep header order). Falls back to EN. */
export function negotiate(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const items = header.split(",").slice(0, 30).map((part, i) => {
    const [tag, ...params] = part.trim().split(";");
    const q = params.map((x) => /^\s*q=([0-9.]+)\s*$/.exec(x)).find(Boolean);
    const qv = q ? Number(q[1]) : 1;
    return { tag, q: Number.isFinite(qv) ? qv : 0, i };
  }).filter((x) => x.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
  for (const it of items) {
    const m = matchTag(it.tag);
    if (m) return m;
  }
  return DEFAULT_LOCALE;
}

/** hreflang alternates for one unprefixed path: every locale + x-default (EN). */
export function alternates(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of LOCALES) out[LOCALE_INFO[l].htmlLang] = localePath(l, path);
  out["x-default"] = localePath(DEFAULT_LOCALE, path);
  return out;
}
