import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { RAW, getDict } from "@/i18n";
import { deepMerge } from "@/i18n/merge";
import { LOCALES, LOCALE_INFO, alternates, dirOf, isLocale, localePath, matchTag, negotiate, splitLocale } from "@/i18n/config";
import { flagId, humanFlag, humanWhy } from "@/lib/humanize";

type Leaf = { path: string; value: unknown };

/** Flatten a dictionary to leaf paths. Arrays are indexed, so a shorter array shows up as missing paths. */
function leaves(x: unknown, prefix = ""): Leaf[] {
  if (Array.isArray(x)) return x.flatMap((v, i) => leaves(v, `${prefix}[${i}]`));
  if (x && typeof x === "object") return Object.entries(x).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  return [{ path: prefix, value: x }];
}

const EN = new Map(leaves(en).map((l) => [l.path, l.value]));
const placeholders = (s: unknown) => (typeof s === "string" ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort() : []);
// plural categories are locale-specific (one / few / many / other): only "other" is required everywhere
const OPTIONAL = /^flags\.warnings\.(zero|one|two|few|many)$/;

describe("translation coverage guard", () => {
  for (const l of LOCALES.filter((x) => x !== "en")) {
    const raw = new Map(leaves(RAW[l]).map((x) => [x.path, x.value]));
    it(`${l}: every EN key exists (no missing keys, no stray keys, same array lengths)`, () => {
      const missing = [...EN.keys()].filter((k) => !raw.has(k) && !OPTIONAL.test(k));
      const extra = [...raw.keys()].filter((k) => !EN.has(k) && !OPTIONAL.test(k));
      expect(missing, `${l} missing`).toEqual([]);
      expect(extra, `${l} extra`).toEqual([]);
    });
    it(`${l}: same {placeholders} as EN, same value types, no markup`, () => {
      for (const [k, v] of raw) {
        if (!EN.has(k)) continue;
        expect(typeof v, `${l}:${k}`).toBe(typeof EN.get(k));
        if (k.startsWith("flags.warnings.")) expect(placeholders(v), `${l}:${k}`).toEqual(["n"]);
        else expect(placeholders(v), `${l}:${k}`).toEqual(placeholders(EN.get(k)));
        if (typeof v === "string") expect(v, `${l}:${k}`).not.toMatch(/<\s*\/?\s*[a-z!]/i); // never HTML in a translation
      }
    });
    it(`${l}: translated, not left in English (UI chrome, verdict help, errors, guides, disclaimer)`, () => {
      const req = ["home.heading", "home.sub", "report.verdictHelp.hard_pass", "report.verdictHelp.watch", "errors.generic.title", "errors.codes.timeout.next",
        "simulate.guide[0]", "signature.guide[0]", "disclaimer", "news.heading", "nav.check", "lang.label", "a11y.skip", "flags.text.honeypot.title"];
      for (const k of req) expect(raw.get(k), `${l}:${k}`).not.toBe(EN.get(k));
    });
  }

  it("coverage report: every locale has 100% of EN keys", () => {
    // plural forms the locale's grammar does not have (e.g. "one" in zh / ja / ko) are not counted as missing
    const keys = [...EN.keys()].filter((k) => !OPTIONAL.test(k));
    const total = keys.length;
    const rows = LOCALES.map((l) => {
      const raw = new Map(leaves(RAW[l]).map((x) => [x.path, x.value]));
      const present = keys.filter((k) => raw.has(k)).length;
      const differs = keys.filter((k) => raw.has(k) && raw.get(k) !== EN.get(k)).length;
      return { l, present, total, pct: Math.round((present / total) * 1000) / 10, differsPct: Math.round((differs / total) * 1000) / 10 };
    });
    console.log("i18n coverage", JSON.stringify(rows));
    for (const r of rows) expect(r.pct, r.l).toBe(100);
  });
});

describe("never SAFE", () => {
  // words that would read as a "safe" verdict in each language (uppercase badges / labels)
  const SAFE_WORDS = /\bSAFE\b|БЕЗОПАСН|БЕЗПЕЧН|SEGUR[OA]\b|SICHER\b|\bSÛR\b|GÜVENL|安全|안전|AN TOÀN|\bAMAN\b|सुरक्षित|آمن/i;
  for (const l of LOCALES) {
    it(`${l}: no SAFE anywhere, verdict / risk labels never mean "safe"`, () => {
      const t = getDict(l);
      expect(JSON.stringify(RAW[l])).not.toMatch(/\bSAFE\b/);
      for (const s of [...Object.values(t.report.verdicts), ...Object.values(t.signature.result.level), ...Object.values(t.simulate.result.status), ...Object.values(t.report.verdictLegend)])
        expect(s, `${l}: ${s}`).not.toMatch(SAFE_WORDS);
    });
  }
});

describe("locale routing helpers", () => {
  it("11 locales, EN default, all LTR; removed VI / ID / HI / AR are not locales", () => {
    expect(LOCALES.length).toBe(11);
    expect([...LOCALES]).toEqual(["en", "ru", "uk", "es", "pt-br", "de", "fr", "tr", "zh-cn", "ja", "ko"]);
    for (const l of LOCALES) expect(dirOf(l), l).toBe("ltr");
    for (const x of ["vi", "id", "hi", "ar"]) expect(isLocale(x), x).toBe(false);
    expect(LOCALE_INFO["zh-cn"].htmlLang).toBe("zh-CN");
    expect(LOCALE_INFO["pt-br"].htmlLang).toBe("pt-BR");
  });
  it("splitLocale strips a known prefix only", () => {
    expect(splitLocale("/ru/r/eth/0xabc")).toEqual({ locale: "ru", rest: "/r/eth/0xabc", explicit: true });
    expect(splitLocale("/ko")).toEqual({ locale: "ko", rest: "/", explicit: true });
    for (const x of ["/ar", "/hi/news", "/vi/simulate", "/id/r/eth/0x1"]) expect(splitLocale(x).explicit, x).toBe(false); // removed -> plain EN path
    expect(splitLocale("/zh-cn/simulate")).toEqual({ locale: "zh-cn", rest: "/simulate", explicit: true });
    expect(splitLocale("/ZH-CN/news").locale).toBe("zh-cn");
    expect(splitLocale("/simulate")).toEqual({ locale: "en", rest: "/simulate", explicit: false });
    expect(splitLocale("/r/url/example.com").explicit).toBe(false); // "r" is not a locale
    expect(splitLocale("/xx/news").explicit).toBe(false);
    expect(splitLocale("/en/news")).toEqual({ locale: "en", rest: "/news", explicit: true }); // proxy 308s this
  });
  it("localePath: EN unprefixed, others prefixed; query and hash kept; idempotent", () => {
    expect(localePath("en", "/simulate")).toBe("/simulate");
    expect(localePath("ru", "/")).toBe("/ru");
    expect(localePath("ru", "/r/bsc/0x1?example=1")).toBe("/ru/r/bsc/0x1?example=1");
    expect(localePath("ko", "/?tab=sig")).toBe("/ko?tab=sig");
    expect(localePath("de", "/ru/news")).toBe("/de/news");
    expect(localePath("en", "/ja/simulate")).toBe("/simulate");
    expect(localePath("pt-br", localePath("pt-br", "/news"))).toBe("/pt-br/news");
  });
  it("Accept-Language negotiation honours q-values and maps regional tags", () => {
    expect(negotiate(null)).toBe("en");
    expect(negotiate("ru-RU,ru;q=0.9,en-US;q=0.8")).toBe("ru");
    expect(negotiate("fr-CH, fr;q=0.9, en;q=0.8")).toBe("fr");
    expect(negotiate("en;q=0.5, de;q=0.9")).toBe("de");
    expect(negotiate("pt-PT")).toBe("pt-br");
    expect(negotiate("zh-Hans-CN")).toBe("zh-cn");
    expect(negotiate("zh-TW")).toBe("en"); // traditional Chinese is not served as zh-CN
    expect(negotiate("xx, yy;q=0.4")).toBe("en");
    for (const h of ["ar-EG", "hi-IN", "vi", "id-ID,id;q=0.9"]) expect(negotiate(h), h).toBe("en"); // removed locales
    expect(negotiate("*")).toBe("en");
    expect(matchTag("in")).toBeNull();
    expect(matchTag("uk-UA")).toBe("uk");
    expect(isLocale("en-US")).toBe(false);
  });
  it("hreflang alternates cover every locale + x-default", () => {
    const a = alternates("/simulate");
    expect(Object.keys(a).length).toBe(12);
    expect(a["x-default"]).toBe("/simulate");
    for (const x of ["ar", "hi", "vi", "id"]) expect(a[x]).toBeUndefined();
    expect(a["zh-CN"]).toBe("/zh-cn/simulate");
  });
});

describe("codes -> text per locale", () => {
  it("engine flag strings map to stable ids and render in each locale", () => {
    expect(flagId("honeypot: sell simulation failed")).toBe("honeypot");
    expect(flagId("owner can pause transfers / trading toggle (issuer power on established token - explain it)")).toBe("pause");
    expect(flagId("something brand new")).toBeNull();
    const ru = getDict("ru");
    expect(humanFlag("honeypot: x", "", ru.flags).title).toBe(ru.flags.text.honeypot.title);
    expect(humanFlag("honeypot: x").title).toBe(en.flags.text.honeypot.title); // EN default unchanged
    expect(humanFlag("unmapped engine text").title).toBe("Unmapped engine text"); // engine words kept verbatim
  });
  it("a missing key in a partial locale falls back to EN at runtime", () => {
    const partial = deepMerge(en, { simulate: { submit: "X" } });
    expect(partial.simulate.submit).toBe("X");
    expect(partial.simulate.result.forkAt).toBe(en.simulate.result.forkAt);
    expect(partial.signature.payloadHint).toBe(en.signature.payloadHint);
  });
  it("why line uses the locale's plural rules", () => {
    const ru = getDict("ru");
    expect(humanWhy("0 high / 1 medium flag(s) - gates remain: mintable", en.flags, "en")).toBe("1 warning to look into: owner can print more tokens");
    expect(humanWhy("2 high / 3 medium flag(s) - gates remain: x", ru.flags, "ru")).toMatch(/^5 предупреждений/);
    expect(humanWhy("1 high / 1 medium flag(s) - gates remain: x", ru.flags, "ru")).toMatch(/^2 предупреждения/);
  });
});
