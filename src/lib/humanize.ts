// Plain-language layer over engine flag strings. The engine output is not modified: its raw flag / evidence text
// stays available as "technical detail"; the UI leads with these human labels. Pure functions (unit-tested).
// i18n: the engine text is matched to a stable id here; the words come from the active locale (Dict["flags"], EN default).
import { en } from "@/i18n/en";

type FlagDict = typeof en.flags;
const EN_FLAGS: FlagDict = en.flags;

/** Field names of raw GoPlus / engine evidence ("transfer_pausable=1") that have a plain-language label. */
const FIELDS = new Set(Object.keys(EN_FLAGS.fields));

/** Engine flag text (prefix match, lower-case) -> stable id (texts: Dict["flags"].text[id]). */
const FLAG_RULES: [RegExp, string][] = [
  [/^owner can pause transfers/, "pause"],
  [/^blacklist function/, "blacklist"],
  [/^mintable/, "mintable"],
  [/^upgradeable proxy/, "proxy"],
  [/^anti-whale limits modifiable/, "anti_whale"],
  [/^trading cooldown/, "cooldown"],
  [/^external call in transfer path/, "external_call"],
  [/^honeypot/i, "honeypot"],
  [/^cannot sell all/, "cannot_sell_all"],
  [/^cannot buy/, "cannot_buy"],
  [/^owner can change balances/, "owner_balance"],
  [/^self-destruct/, "selfdestruct"],
  [/^fake \/ airdrop-scam token/, "fake_airdrop"],
  [/^extreme sell tax/, "extreme_sell_tax"],
  [/^high sell tax/, "high_sell_tax"],
  [/^extreme buy tax/, "extreme_buy_tax"],
  [/^non-zero sell tax/, "sell_tax"],
  [/^hidden owner/, "hidden_owner"],
  [/^can take back ownership/, "take_back_ownership"],
  [/^tax modifiable by owner/, "tax_modifiable"],
  [/^per-address tax modifiable/, "per_address_tax"],
  [/^creator deployed honeypots before/, "creator_honeypots"],
  [/^source not verified|^closed source/, "closed_source"],
  [/^dead \/ dust liquidity/, "dust_liquidity"],
  [/^rugged/i, "rugged"],
  [/^lp mostly unlocked on young token/, "lp_unlocked"],
  [/^buys but zero sells/, "zero_sells"],
  [/^dead tape/, "dead_tape"],
  [/^creator holds (large|notable) share/, "creator_share"],
  [/^holders siphoned/, "holders_siphoned"],
  [/^sell simulation did not complete/, "sell_sim_incomplete"],
  [/^brand-new pairs/, "brand_new_pairs"],
  [/^phantom quote risk/, "phantom_quote"],
  [/^thin book/, "thin_book"],
  [/^serial deployer/, "serial_deployer"],
  [/^paid dexscreener/, "paid_dexscreener"],
  [/^trending on geckoterminal/, "trending_gecko"],
  [/^deployer funding from cex/, "deployer_cex"],
  [/^deployer funding from bridge/, "deployer_bridge"],
  [/^deployer funding from high-volume/, "deployer_high_volume"],
  [/^funded from cex/, "funded_cex"],
  [/^funded from bridge/, "funded_bridge"],
  [/^funded from swap/, "funded_swap"],
  [/^funded from high-volume/, "funded_high_volume"],
  [/^deployer funding touches a mixer/, "deployer_mixer"],
  [/^deployer funded via instant-exchange/, "deployer_instant"],
  [/^goplus omitted owner-power fields/, "goplus_omitted"],
  [/^look-alike domain/, "lookalike_domain"],
  [/^host does not resolve/, "no_resolve"],
  [/^on goplus phishing list|phishing/i, "phishing"],
];

/** Engine annotations that read like notes to an analyst; they are turned into context, not shown verbatim. */
const ANALYST_NOTE = /\s*\(issuer power on established token - explain it\)/i;

export interface HumanFlag { id: string | null; title: string; meaning: string | null; context: string | null; evidence: string | null }

/** Stable id of an engine flag string, or null when it is not one we have plain words for. */
export function flagId(flag: string): string | null {
  const clean = (flag || "").replace(ANALYST_NOTE, "").trim();
  const hit = FLAG_RULES.find(([re]) => re.test(clean.toLowerCase()) || re.test(clean));
  return hit ? hit[1] : null;
}

export function humanEvidence(evidence: string, tf: FlagDict = EN_FLAGS): string | null {
  const parts = (evidence || "").split(/\s*(?:,|\bor\b)\s*/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const m = /^([a-z_]+)=(\d+|true|false)$/i.exec(p);
    if (!m) return null; // free-text evidence: keep the engine's own words
    const key = m[1].toLowerCase();
    if (!FIELDS.has(key)) return null;
    const label = tf.fields[key] ?? EN_FLAGS.fields[key];
    if (m[2] === "1" || m[2] === "true" || (m[1] === "is_open_source" && m[2] === "0")) out.push(label);
  }
  return out.length ? out.join("; ") : null;
}

function text(tf: FlagDict, id: string): { title: string; meaning: string } {
  return tf.text[id] ?? EN_FLAGS.text[id];
}

export function humanFlag(flag: string, evidence = "", tf: FlagDict = EN_FLAGS): HumanFlag {
  const raw = flag || "";
  const issuer = ANALYST_NOTE.test(raw);
  const clean = raw.replace(ANALYST_NOTE, "").trim();
  const id = flagId(raw);
  const hit = id ? text(tf, id) : null;
  return {
    id,
    title: hit ? hit.title : clean.charAt(0).toUpperCase() + clean.slice(1),
    meaning: hit ? hit.meaning : null,
    context: issuer ? tf.issuerContext : null,
    evidence: humanEvidence(evidence, tf),
  };
}

function plural(tf: FlagDict, n: number, lang: string): string {
  let cat = "other";
  try { cat = new Intl.PluralRules(lang).select(n); } catch { /* unknown tag: "other" */ }
  return (tf.warnings[cat] ?? tf.warnings.other).replace("{n}", String(n));
}

/** Engine "why" line -> plain text (drops analyst annotations, rewrites "0 high / 3 medium flag(s) - gates remain:").
 * `lang` = BCP-47 tag for plural rules (EN default). Engine phrases we have no id for are kept verbatim. */
export function humanWhy(why: string, tf: FlagDict = EN_FLAGS, lang = "en"): string {
  if (!why) return "";
  const low = (s: string) => (tf.whyLowercase ? s.toLowerCase() : s);
  let s = why.replace(/\s*\(issuer power on established token - explain it\)/gi, "");
  s = s.replace(/^(\d+) high \/ (\d+) medium flag\(s\) - gates remain:\s*/i, (_, h, m) => plural(tf, Number(h) + Number(m), lang));
  s = s.replace(/core safety sources UNKNOWN \(([^)]*)\) - cannot clear;?/i, (_, list) => tf.coreUnknown.replace("{list}", list));
  // rename known flag phrases inside the list
  return s.split(/;\s*/).map((part) => {
    const id = flagId(part.trim());
    return id && !/:/.test(part) ? low(text(tf, id).title) : part.replace(/(: )(.+)$/, (_, c, rest) => {
      const rid = flagId(rest.trim());
      return rid ? c + low(text(tf, rid).title) : c + rest;
    });
  }).join("; ");
}

/** Issuer-power flags = admin powers that many established tokens keep (pause / blacklist / mint / proxy / limits). */
export function isIssuerPowerFlag(flag: string, evidence = ""): boolean {
  return ANALYST_NOTE.test(flag) || /^(transfer_pausable|is_blacklisted|is_mintable|is_proxy|anti_whale_modifiable)=1$/.test(evidence.trim());
}
