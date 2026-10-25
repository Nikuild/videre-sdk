// Fixed English strings that the engine (untouched) and the Simulate A backend emit as notes / evidence /
// source names / roles. They carry no code, but they are constants: each one is matched here to a stable key and the
// words come from the active locale (Dict["known"]). Anything not in the table is shown verbatim (raw text under
// «Technical details» stays English on purpose). EN templates reproduce the source strings byte for byte (vitest).
import type { Dict } from "@/i18n/types";

export type K = Dict["known"];

const RULES: [RegExp, keyof K["text"], string[]?][] = [
  [/^liquidity = sum over DexScreener pairs; FDV\/mcap are quotes, not depth$/, "liquidity_sum"],
  [/^simulation at fetch time only; contract behaviour can change$/, "sim_fetch_time"],
  // engine name: "Videre", or the engine's pre-rename name (older envelopes) - both reproduced byte for byte
  [/^concentration computed by (Videre|s[c]amcheck) from the source's top-holder list \(CEX\/lockers are NOT excluded; identity = INFERENCE\)$/, "concentration", ["engine"]],
  [/^boosts\/orders = paid promotion; trending = attention\. Neither is quality$/, "paid_promo"],
  [/^first-funder walk \(earliest incoming value transfer\), stop at CEX\/mixer\/bridge\/contract\. Labels = INFERENCE; funding link != identity; post-mixer linkage is UNKNOWN by design$/, "first_funder"],
  [/^contains brand '([^']{1,64})' but is not an official domain \(([^)]{0,300})\)$/, "brand_not_official", ["brand", "list"]],
  [/^RDAP 404: domain not registered \(or TLD without RDAP\) -> age UNKNOWN; an unregistered look-alike can be registered any time$/, "rdap_404"],
  [/^Simulation shows what this transaction would do against the CURRENT on-chain state of the forked block\. The contract may behave differently later \(upgradeable code, owner switches, time \/ price \/ balance conditions, a different sender or block\)\. Heuristics, not proof\. No flags is not a clearance\. Not investment advice\.$/, "sim_disclaimer"],
  [/^0 \(fees excluded from balance changes\)$/, "gas_excluded"],
  [/^0 \(L2 execution fee excluded; the OP-stack L1 data fee may still show up in the sender's native change\)$/, "gas_l2"],
  [/^matched the verified contract ABI from the explorer$/, "abi_verified"],
  [/^signature from a public selector database; 4-byte selectors can collide, so the name is a best guess$/, "abi_4byte"],
  [/^selector not found in the explorer ABI or selector databases \(lookup status: (.{1,120})\)$/, "abi_not_found_status", ["status"]],
  [/^selector not found in the explorer ABI or selector databases$/, "abi_not_found"],
  [/^no calldata: plain native-coin transfer$/, "no_calldata_native"],
  [/^no calldata$/, "no_calldata"],
  [/^contract creation \(init code\)$/, "contract_creation"],
  [/^high-volume EOA \(CEX\/service-like, INFERENCE\)$/, "high_volume_label"],
];

function fillStr(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** Known constant -> active-locale text; null when the string is not a known constant. */
export function knownMatch(raw: string | null | undefined, k: K): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  for (const [re, key, names] of RULES) {
    const m = re.exec(s);
    if (!m) continue;
    const tpl = k.text[key];
    if (!tpl) return null;
    const vars: Record<string, string> = {};
    (names ?? []).forEach((n, i) => { vars[n] = m[i + 1]; });
    return fillStr(tpl, vars);
  }
  return null;
}

/** Known constant -> active-locale text, else the raw string unchanged. */
export function knownText(raw: string | null | undefined, k: K): string {
  return knownMatch(raw, k) ?? (raw ?? "");
}

/** Source names: "dns.google (DoH) + local resolver" -> the phrase "local resolver" in the active locale. */
export function sourceText(raw: string | null | undefined, k: K): string {
  return (raw ?? "").replace(/\blocal resolver\b/g, k.localResolver);
}

// Simulate backend roles -> keys
const SIM_ROLES: Record<string, keyof K["simRoles"]> = {
  "approval spender": "approvalSpender", "receives your tokens": "receivesYourTokens", token: "token", "called contract": "calledContract",
  "token recipient": "tokenRecipient", "token sender": "tokenSender", "native balance changed": "nativeChanged", "contract called": "contractCalled",
  "sender (you)": "senderYou",
};
export function simRoleText(role: string, k: K): string {
  const key = SIM_ROLES[role];
  return (key && k.simRoles[key]) || role;
}
