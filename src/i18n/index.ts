// Server / test entry: every locale table, merged over EN. Client components import "./fmt" (helpers) and "./load"
// (lazy per-locale chunks) instead, so the browser only downloads the dictionary it shows.
import { en } from "./en";
import ru from "./locales/ru";
import uk from "./locales/uk";
import es from "./locales/es";
import pt_br from "./locales/pt-br";
import de from "./locales/de";
import fr from "./locales/fr";
import tr from "./locales/tr";
import zh_cn from "./locales/zh-cn";
import ja from "./locales/ja";
import ko from "./locales/ko";
import { deepMerge } from "./merge";
import { LOCALES, DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import type { Dict, DeepPartial } from "./types";

export { LOCALES, DEFAULT_LOCALE, isLocale };
export type { Locale };
export { fmt } from "./fmt";

/** Raw (unmerged) locale tables: what translators wrote. Used by the coverage guard. */
export const RAW: Record<Locale, DeepPartial<Dict>> = { en, "ru": ru, "uk": uk, "es": es, "pt-br": pt_br, "de": de, "fr": fr, "tr": tr, "zh-cn": zh_cn, "ja": ja, "ko": ko };

const DICTS = Object.fromEntries(LOCALES.map((l) => [l, l === "en" ? en : deepMerge(en, RAW[l])])) as Record<Locale, Dict>;

/** Full dictionary for a locale (missing keys fall back to EN). Unknown locale -> EN. */
export function getDict(locale: string = DEFAULT_LOCALE): Dict {
  return DICTS[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

export type { Dict };
