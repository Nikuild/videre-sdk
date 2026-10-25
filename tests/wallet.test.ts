import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildWalletView, codeText, parseKind, walletPath } from "@/lib/wallet";
import type { Envelope } from "@/lib/envelope";
import { en } from "@/i18n/en";
import { deepMerge } from "@/i18n/merge";
import { LOCALES } from "@/i18n/config";

const FX = path.join(__dirname, "..", "fixtures", "envelopes");
const load = (rel: string): Envelope => JSON.parse(fs.readFileSync(path.join(FX, rel), "utf8"));
const W = "Fake111111111111111111111111111111111111127";
const NEVER_SAFE = /\bSAFE\b|БЕЗОПАСН|БЕЗПЕЧН|SEGUR[OA]\b|SICHER\b|\bSÛR\b|GÜVENL|安全|안전/i;
const kindEnv = (result: unknown, status = "ok"): Envelope => ({ status, result: result as Envelope["result"] });

describe("parseKind: routing never falls into the token path on UNKNOWN", () => {
  it("wallet / token / contract / unknown", () => {
    expect(parseKind(load(`kind/${W}.json`))).toMatchObject({ kind: "wallet", route: "wallet", basis: "sol_system_owned" });
    expect(parseKind(kindEnv({ kind: "token", basis: "sol_token_mint" })).route).toBe("token");
    expect(parseKind(kindEnv({ kind: "contract", basis: "evm_has_code" })).route).toBe("token");
    expect(parseKind(load("kind/0x3333333333333333333333333333333333333333.json"))).toMatchObject({ route: "unknown", reason: "timeout" });
  });
  it("malformed / error / hostile answers are UNKNOWN", () => {
    expect(parseKind(null).route).toBe("unknown");
    expect(parseKind(kindEnv({ kind: "wallet" }, "error")).route).toBe("unknown");
    expect(parseKind(kindEnv({ kind: "SAFE" })).route).toBe("unknown");
    expect(parseKind(kindEnv({ kind: "token", basis: "<script>" })).basis).toBe("unrecognised");
    expect(parseKind(kindEnv({ kind: "unknown", hint_wallet: "javascript:alert(1)" })).hintWallet).toBeNull();
    expect(parseKind(kindEnv({ kind: "unknown", hint_wallet: W })).hintWallet).toBe(W);
  });
});

describe("buildWalletView", () => {
  it("7PQg fixture (live engine output 2026-10-21): wallet, UNKNOWN GoPlus => incomplete, CEX funder is INFERENCE", () => {
    const v = buildWalletView(load(`wallet/${W}.json`));
    expect(v.address).toBe(W);
    expect(v.chain).toBe("solana");
    expect(v.summary).toBe("no_flags_incomplete");
    expect(v.goplus.label).toBe("UNKNOWN");
    expect(v.unknown).toContain("goplus_address");
    expect(v.balances.label).toBe("FACT");
    expect(v.balances.rows[0]).toMatchObject({ chain: "solana", native: "SOL", ok: true });
    expect(v.funding.hops.length).toBeGreaterThan(0);
    expect(v.funding.hops.every((h) => h.label === "INFERENCE" || h.label === "UNKNOWN")).toBe(true);
    expect(v.flags.find((f) => f.code === "funded_from_cex")?.label).toBe("INFERENCE");
    expect(v.explorer).toMatch(/^https:\/\/solscan\.io\//);
    expect(v.detected).toEqual({ kind: "wallet", basis: "sol_system_owned" });
  });
  it("never upgrades: partial_view with any UNKNOWN part is forced to incomplete", () => {
    const v = buildWalletView(kindEnv({ summary: "no_flags_partial_view", unknown: ["funding"], goplus: { status: "OK" } }));
    expect(v.summary).toBe("no_flags_incomplete");
    expect(buildWalletView(kindEnv({ summary: "clean" })).summary).toBe("no_flags_incomplete");
    expect(buildWalletView(kindEnv({ summary: "no_flags_partial_view", unknown: [], goplus: { status: "OK" } })).summary).toBe("no_flags_partial_view");
  });
  it("hostile links are dropped, codes validated", () => {
    const v = buildWalletView(kindEnv({ links: { explorer: "javascript:alert(1)" }, flags: [{ code: "<img>", severity: "critical" }, { code: "goplus_mixer", severity: "boom" }],
      funding: { status: "OK", hops: [{ status: "OK", tx_link: "https://evil.example/tx", from_kind: "cex" }] } }));
    expect(v.explorer).toBeNull();
    expect(v.flags).toEqual([{ severity: "info", code: "goplus_mixer", source: "UNKNOWN", label: "UNKNOWN", hop: null }]);
    expect(v.funding.hops[0].txLink).toBeNull();
  });
  it("walletPath + codeText fallback (a new GoPlus code still shows)", () => {
    expect(walletPath("auto", W)).toBe(`/wallet?address=${W}&chain=auto`);
    expect(codeText(en.wallet.flagNames, "goplus_brand_new_flag")).toBe("goplus brand new flag");
    expect(codeText(en.wallet.flagNames, "goplus_mixer")).toBe(en.wallet.flagNames.goplus_mixer);
  });
});

describe("wallet i18n: 11 locales, every code has text, never SAFE", () => {
  const raw = async (l: string) => (l === "en" ? en : deepMerge(en, (await import(`@/i18n/locales/${l}.ts`)).default));
  it.each(LOCALES as unknown as string[])("%s", async (l) => {
    const d = await raw(l);
    const w = d.wallet;
    if (l !== "en") expect(w.notToken).not.toBe(en.wallet.notToken);
    for (const k of Object.keys(en.wallet.basis)) expect(w.basis[k as keyof typeof w.basis]).toBeTruthy();
    for (const k of Object.keys(en.wallet.flagNames)) expect(w.flagNames[k as keyof typeof w.flagNames]).toBeTruthy();
    expect(JSON.stringify(w)).not.toMatch(NEVER_SAFE);
    expect(w.goplusUnknown).toContain("{status}");
    expect(w.goplusUnknown).toContain("UNKNOWN");
    expect(w.unknownKind.note).toContain("UNKNOWN");
  });
});

describe("parseKind: Avalanche-only contract is not sent to the token path", () => {
  it("token_supported false -> route unknown, chain avalanche, basis localized in every locale", () => {
    const env = { status: "ok", result: { kind: "contract", basis: "evm_code_unsupported_chain", chain: "avalanche", token_supported: false, route: "unknown" } } as unknown as Envelope;
    expect(parseKind(env)).toMatchObject({ kind: "contract", route: "unknown", chain: "avalanche", basis: "evm_code_unsupported_chain" });
    for (const l of LOCALES) {
      const f = path.join(__dirname, "..", "src", "i18n", l === "en" ? "en.ts" : `locales/${l}.ts`);
      const src = fs.readFileSync(f, "utf8");
      expect(src, l).toMatch(/chains: \{[^}]*avalanche: "Avalanche C[^"]*"/);
      expect(src, l).toMatch(/evm_code_unsupported_chain: "[^"]*Avalanche[^"]*UNKNOWN/);
    }
  });
});
