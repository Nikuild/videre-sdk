import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { en } from "@/i18n/en";
import { getDict, LOCALES } from "@/i18n";
import type { SigEnvelope, SigResult } from "@/lib/signature";
import { chainNameText, chainSourceText, checkReasonText, codedList, fill, grantSentence, grantSentenceOrFallback, grantWhatParts, patternText, plain, roleText } from "@/lib/signature-text";

const FX = path.join(__dirname, "..", "fixtures", "envelopes");
const envs: Record<string, SigResult> = Object.fromEntries(readdirSync(path.join(FX, "signature")).map((f) => [f.replace(".json", ""), (JSON.parse(readFileSync(path.join(FX, "signature", f), "utf8")) as SigEnvelope).result!]));
const extra: Record<string, SigResult> = JSON.parse(readFileSync(path.join(FX, "signature-grants-extra.json"), "utf8"));
const all = { ...envs, ...extra };
const d = en.signature.decoded;

describe("Simulate B text from structured fields (EN = backend English, byte for byte)", () => {
  for (const [name, r] of Object.entries(all)) {
    it(`${name}: grant sentence(s), pattern, unknowns, notes`, () => {
      for (const g of r.grants) {
        const p = grantSentence(g, d);
        expect(p, `${name} ${g.kind}`).not.toBeNull();
        expect(plain(p!)).toBe(g.summary_en);
      }
      expect(patternText(r, d)).toBe(r.pattern.name);
      expect(codedList(r.unknowns, r.unknown_codes, d.unknowns)).toEqual(r.unknowns);
      expect(codedList(r.notes, r.note_codes, d.notes)).toEqual(r.notes);
      if (r.risk.note) expect(d.riskNote).toBe(r.risk.note);
      if (r.hashes?.note) expect(d.hashNote).toBe(r.hashes.note);
      expect(chainSourceText(r.chain.source, d)).toBe(r.chain.source);
      expect(chainNameText(r, d)).toBe(r.chain.name);
    });
  }
  it("every code the fixtures carry has a template (no silent English fallback)", () => {
    for (const r of Object.values(all)) {
      for (const c of [...(r.unknown_codes ?? [])]) expect(d.unknowns[c.id], c.id).toBeTruthy();
      for (const c of [...(r.note_codes ?? [])]) expect(d.notes[c.id], c.id).toBeTruthy();
      expect(d.patterns[r.pattern.id], r.pattern.id).toBeTruthy();
      for (const a of r.addresses ?? []) for (const role of a.roles) expect(roleText(role, d), role).toBe(role); // EN role = backend role
    }
  });
  it("EN disclaimer = backend SIG_DISCLAIMER; addresses are separate parts (shortened on screen)", () => {
    expect(d.disclaimer).toBe(envs.permit_xcoin_eth.disclaimer);
    const p = grantSentence(envs.permit_xcoin_eth.grants[0], d)!;
    expect(p.filter((x) => x.addr).map((x) => x.text)).toEqual([envs.permit_xcoin_eth.grants[0].who]);
  });
  it("route reason codes render; unknown codes / kinds fall back to the backend English", () => {
    expect(checkReasonText({ reason: "address checks skipped (check_addresses=false)", reason_code: "checks_skipped" }, "Base", d)).toBe("address checks skipped (check_addresses=false)");
    expect(checkReasonText({ reason: "chain Base not covered by Videre", reason_code: "chain_not_covered" }, "Base", d)).toBe("chain Base not covered by Videre");
    expect(checkReasonText({ reason: "raw" }, "x", d)).toBe("raw");
    const g = { ...envs.permit_xcoin_eth.grants[0], kind: "brand_new_kind" };
    expect(grantSentenceOrFallback(g, d)).toEqual({ parts: [{ text: g.summary_en }], fallback: true });
    expect(grantSentence({ ...envs.eth_sign_opaque.grants[0], byte_len: undefined }, d)).toBeNull(); // older backend: no structured field
    expect(codedList(["x"], [{ id: "nope" }], d.unknowns)).toEqual(["x"]);
    expect(fill("{a} {b}", { a: "1" }).map((x) => x.text).join("")).toBe("1 {b}");
  });
  it("What cell", () => {
    expect(plain(grantWhatParts(envs.permit2_unlimited_base.grants[0], d)!)).toBe("UNLIMITED XCOIN");
    expect(plain(grantWhatParts(extra.permit_claimed_raw.grants[0], d)!)).toBe("5000 raw units of “Example Shiny” (claimed name) (decimals UNKNOWN)");
    expect(plain(grantWhatParts(extra.dai_revoke.grants[0], d)!)).toBe("XUSDB (revoke)");
    expect(plain(grantWhatParts(envs.approval_for_all_typed.grants[0], d)!)).toMatch(/^ALL items of 0x/);
  });
});

describe("Simulate B text in every locale", () => {
  for (const l of LOCALES.filter((x) => x !== "en")) {
    it(`${l}: every grant sentence is translated, no {placeholder} left, addresses intact`, () => {
      const dl = getDict(l).signature.decoded;
      for (const [name, r] of Object.entries(all)) {
        for (const g of r.grants) {
          const p = grantSentence(g, dl)!;
          const s = plain(p);
          expect(s, `${l} ${name}`).not.toMatch(/\{\w+\}/);
          expect(s, `${l} ${name}`).not.toBe(g.summary_en);
          if (g.who && g.kind !== "generic") expect(p.some((x) => x.addr && x.text === g.who), `${l} ${name} who`).toBe(true);
        }
        expect(patternText(r, dl)).not.toMatch(/\{(type|name|method)\}/);
        expect(patternText(r, dl), `${l} ${name} pattern`).not.toBe(r.pattern.name);
      }
      expect(dl.disclaimer).not.toBe(d.disclaimer);
      expect(dl.riskNote).not.toBe(d.riskNote);
      expect(roleText("spender", dl)).not.toBe("spender");
    });
  }
  it("RU permit sentence", () => {
    const s = plain(grantSentence(envs.permit_xcoin_eth.grants[0], getDict("ru").signature.decoded)!);
    expect(s).toMatch(/250 XCOIN/);
    expect(s).toMatch(/[А-Яа-я]{4,}/);
  });
});
