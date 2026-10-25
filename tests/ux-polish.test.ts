import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { humanEvidence, humanFlag, humanWhy, isIssuerPowerFlag } from "@/lib/humanize";
import { humanError, sanitizeTech } from "@/lib/human-error";
import { validateSimForm, SIM_SAMPLE } from "@/lib/simulate";
import { verdictKind } from "@/lib/verdict";
import { buildReport } from "@/lib/report";
import { buildUrlView } from "@/lib/url-report";
import { en } from "@/i18n/en";
import type { AnyEnvelope, Envelope } from "@/lib/envelope";

const FX = path.join(__dirname, "..", "fixtures", "envelopes");

describe("ux polish: plain-language flags", () => {
  it("raw GoPlus fields become human labels", () => {
    expect(humanEvidence("transfer_pausable=1")).toBe("The owner can pause all transfers");
    expect(humanEvidence("is_blacklisted=1")).toBe("The owner can block (blacklist) individual wallets");
    expect(humanEvidence("3 holder wallets siphoned")).toBeNull(); // free text stays as the engine wrote it
  });
  it("analyst annotations are turned into context, not shown verbatim", () => {
    const h = humanFlag("owner can pause transfers / trading toggle (issuer power on established token - explain it)", "transfer_pausable=1");
    expect(h.title).toBe("Owner can freeze trading");
    expect(h.context).toMatch(/Common for large, long-running tokens/);
    expect(JSON.stringify(h)).not.toMatch(/explain it/);
    expect(isIssuerPowerFlag("blacklist function", "is_blacklisted=1")).toBe(true);
  });
  it("why line reads like a sentence", () => {
    const w = humanWhy("0 high / 3 medium flag(s) - gates remain: owner can pause transfers / trading toggle (issuer power on established token - explain it); blacklist function (issuer power on established token - explain it); anti-whale limits modifiable");
    expect(w).toBe("3 warnings to look into: owner can freeze trading; owner can block wallets; owner can change buy/wallet limits");
  });
});

describe("ux polish: verdict labels", () => {
  it("AVOID / NO MAJOR FLAGS are recognised (history rows) and old engine strings still map", () => {
    expect(verdictKind("AVOID").kind).toBe("hard_pass");
    expect(verdictKind("HARD PASS").kind).toBe("hard_pass");
    expect(verdictKind("NO MAJOR FLAGS").kind).toBe("no_hard_flags");
    expect(JSON.stringify(en.report.verdicts)).not.toMatch(/SAFE|PASS/);
  });
});

describe("ux polish: human errors", () => {
  it("never shows guard jargon", () => {
    const h = humanError(en.errors, "rpc_unavailable", "no public RPC answered for Ethereum - simulation UNKNOWN (rpc #1 refused by allowlist/SSRF guard (host resolves to a non-public address))");
    expect(h.title).toMatch(/couldn't reach the blockchain/);
    expect(JSON.stringify(h)).not.toMatch(/SSRF|allowlist/i);
    expect(sanitizeTech("host is not on the simulate allowlist")).toBe("host is not on the simulate approved list");
    expect(humanError(en.errors, "non_public_host", null).next).toMatch(/suspicious/);
    expect(humanError(en.errors, "rate_limited", null, 42).next).toMatch(/42 s/);
    expect(humanError(en.errors, "weird_code", null).title).toBe(en.errors.generic.title);
  });
});

describe("ux polish: simulate form", () => {
  it("empty submit reports BOTH From and To", () => {
    const v = validateSimForm("eth", "call", {});
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.field).toBe("from");
    expect(v.errors?.map((e) => e.field)).toEqual(["from", "to"]);
  });
  it("sample transaction validates", () => {
    const v = validateSimForm(SIM_SAMPLE.chain, "call", SIM_SAMPLE);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.body.data).toMatch(/^0x095ea7b3/);
  });
});

describe("ux polish: url report", () => {
  it("unregistered look-alike gets a plain 'does not exist' line and a brand warning", () => {
    const env = JSON.parse(fs.readFileSync(path.join(FX, "url", "exampleswap_airdrop_claim_test.json"), "utf8")) as AnyEnvelope;
    const v = buildUrlView(env);
    expect(v.notRegistered).toBe(true);
    expect(v.flagsBySeverity.high[0].human.title).toBe("Imitates a known brand");
    expect(v.verdict.kind).toBe("watch");
  });
  it("token report keeps the raw flag for technical detail", () => {
    const env = JSON.parse(fs.readFileSync(path.join(FX, "bsc", "0x0000000000000000000000000000000000000037.json"), "utf8")) as Envelope;
    const v = buildReport(env);
    const all = Object.values(v.flagsBySeverity).flat();
    expect(all.every((f) => f.human.title.length > 0 && f.flag.length > 0)).toBe(true);
  });
});
