// Client-side lazy loading: each locale is its own JS chunk (loaded by Next's nonce-trusted runtime; CSP strict-dynamic).
import { en } from "./en";
import { deepMerge } from "./merge";
import type { Locale } from "./config";
import type { Dict, DeepPartial } from "./types";

const LOADERS: Record<Locale, () => Promise<DeepPartial<Dict>>> = {
  en: async () => en,
  "ru": () => import("./locales/ru").then((m) => m.default),
  "uk": () => import("./locales/uk").then((m) => m.default),
  "es": () => import("./locales/es").then((m) => m.default),
  "pt-br": () => import("./locales/pt-br").then((m) => m.default),
  "de": () => import("./locales/de").then((m) => m.default),
  "fr": () => import("./locales/fr").then((m) => m.default),
  "tr": () => import("./locales/tr").then((m) => m.default),
  "zh-cn": () => import("./locales/zh-cn").then((m) => m.default),
  "ja": () => import("./locales/ja").then((m) => m.default),
  "ko": () => import("./locales/ko").then((m) => m.default),
};

const cache = new Map<Locale, Dict>();

export async function loadDict(l: Locale): Promise<Dict> {
  const hit = cache.get(l);
  if (hit) return hit;
  const d = l === "en" ? en : deepMerge(en, await LOADERS[l]());
  cache.set(l, d);
  return d;
}

export function primeDict(l: Locale, d: Dict) {
  cache.set(l, d);
}
