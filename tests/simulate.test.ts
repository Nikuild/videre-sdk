import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { en } from "@/i18n/en";
import { getDict } from "@/i18n";
import { buildSimView, isSimEnvelope, toWei, validateSimForm, type SimEnvelope } from "@/lib/simulate";
import { shortcutAction } from "@/lib/shortcuts";

const FROM = "0x0000000000000000000000000000000000000004";
const TO = "0x0000000000000000000000000000000000000001";
const DATA = "0x095ea7b3" + "0".repeat(24) + "0000000000000000000000000000000000000105" + "f".repeat(64);
const FX = path.join(import.meta.dirname, "..", "fixtures", "envelopes", "simulate");
const fx = (n: string) => JSON.parse(readFileSync(path.join(FX, `${n}.json`), "utf8")) as SimEnvelope;

describe("simulate form validation", () => {
  it("accepts tx fields and normalises (value in native units -> wei)", () => {
    const v = validateSimForm("eth", "call", { from: FROM, to: TO, value: "0.5", data: DATA });
    expect(v).toEqual({ ok: true, body: { chain: "eth", mode: "call", from: FROM.toLowerCase(), to: TO.toLowerCase(), value: "500000000000000000", data: DATA } });
    expect(validateSimForm("base", "call", { from: FROM, to: TO }).ok).toBe(true); // plain transfer, value 0
  });
  it.each([
    [{ from: "", to: TO }, "from", "required"],
    [{ from: "-" + FROM.slice(1), to: TO }, "from", "leading_dash"],
    [{ from: "0x28C6…1d60", to: TO }, "from", "truncated_address"],
    [{ from: "0x" + "ab".repeat(32), to: TO }, "from", "looks_like_key"],
    [{ from: FROM, to: "0x1234" }, "to", "bad_address"],
    [{ from: FROM, to: TO, data: "0xzz" }, "data", "bad_hex"],
    [{ from: FROM, to: TO, data: "0x095ea7b" }, "data", "bad_hex"],
    [{ from: FROM, to: TO, data: "0x0102" }, "data", "short_selector"],
    [{ from: FROM, to: TO, data: "--help" }, "data", "leading_dash"],
    [{ from: FROM, to: TO, data: "0x" + "00".repeat(49153) }, "data", "too_long"],
    [{ from: FROM, to: TO, value: "-1" }, "value", "bad_value"],
    [{ from: FROM, to: TO, value: "1e18" }, "value", "bad_value"],
    [{ from: FROM, to: TO, value: "0.0000000000000000001" }, "value", "bad_value"],
  ])("call mode rejects %j", (fields, field, code) => {
    expect(validateSimForm("eth", "call", fields)).toMatchObject({ ok: false, field, code });
  });
  it("raw and hash modes", () => {
    expect(validateSimForm("eth", "raw", { raw_tx: "0x" + "ab".repeat(32) })).toMatchObject({ ok: false, code: "looks_like_key" });
    expect(validateSimForm("eth", "raw", { raw_tx: "0x02f8" })).toMatchObject({ ok: false, code: "bad_raw" });
    expect(validateSimForm("eth", "raw", { raw_tx: "0x02f8 74" })).toMatchObject({ ok: false, code: "bad_hex" });
    expect(validateSimForm("eth", "raw", { raw_tx: "0x02" + "aa".repeat(60) }).ok).toBe(true);
    expect(validateSimForm("bsc", "hash", { tx_hash: "0x1234" })).toMatchObject({ ok: false, code: "bad_hash" });
    expect(validateSimForm("bsc", "hash", { tx_hash: "-0x" + "a".repeat(64) })).toMatchObject({ ok: false, code: "leading_dash" });
    expect(validateSimForm("arbitrum", "hash", { tx_hash: "0x" + "A".repeat(64), block: "parent" }))
      .toEqual({ ok: true, body: { chain: "arbitrum", mode: "hash", tx_hash: "0x" + "a".repeat(64), block: "parent" } });
  });
  it("only the four stage-A chains", () => {
    for (const c of ["polygon", "solana", "tron", "auto"]) expect(validateSimForm(c, "hash", { tx_hash: "0x" + "a".repeat(64) })).toMatchObject({ ok: false, field: "chain" });
  });
  it("toWei", () => {
    expect(toWei("")).toBe("0");
    expect(toWei("1")).toBe("1000000000000000000");
    expect(toWei("0.000000000000000001")).toBe("1");
    expect(toWei("abc")).toBeNull();
  });
  it("every error code has an EN message", () => {
    for (const c of ["required", "leading_dash", "bad_address", "truncated_address", "looks_like_key", "bad_hex", "too_long", "short_selector", "bad_value", "bad_hash", "bad_raw", "bad_chain"])
      expect(en.simulate.errors[c]).toBeTruthy();
  });
});

describe("simulate strings & fixtures never say SAFE", () => {
  it("new EN / RU strings (nav + simulate) contain no 'safe' in any case", () => {
    for (const d of [en, getDict("ru")]) {
      expect(JSON.stringify(d.simulate)).not.toMatch(/\bsafe\b/i);
      expect(JSON.stringify(d.nav)).not.toMatch(/\bsafe\b/i);
    }
    expect(getDict("ru").simulate.submit).toBe("Запустить симуляцию"); // RU scaffold present
    expect(getDict("ru").simulate.result.forkAt).not.toBe(en.simulate.result.forkAt); // RU fully translated (fallback is covered in i18n.test.ts)
  });
  it("no wallet-connect wording in new strings", () => {
    expect(JSON.stringify(en.simulate)).not.toMatch(/connect (your )?wallet|walletconnect|sign in/i);
  });
  it("fixtures: no SAFE, no keys, UTC only", () => {
    for (const f of readdirSync(FX)) {
      const s = readFileSync(path.join(FX, f), "utf8");
      expect(s, f).not.toMatch(/\bSAFE\b/i);
      expect(s, f).not.toMatch(/api[-_]?key=(?!\*\*\*)/i);
      expect(s, f).not.toMatch(/T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/);
    }
  });
});

describe("human-language view model", () => {
  it("unlimited approval is surfaced", () => {
    const env = fx("approve_unlimited_eth");
    expect(isSimEnvelope(env)).toBe(true);
    const v = buildSimView(env.result!);
    expect(v.approvals).toHaveLength(1);
    expect(v.approvals[0]).toMatchObject({ amount: "UNLIMITED", unlimited: true, what: "XCOIN", spender: "0x0000000000000000000000000000000000000105" });
    expect(v.unlimited).toHaveLength(1);
    expect(v.youSend).toHaveLength(0);
  });
  it("swap: what leaves and what arrives", () => {
    const v = buildSimView(fx("swap_eth").result!);
    expect(v.youSend.map((f) => f.what)).toEqual(["XMEME"]);
    expect(v.youReceive.map((f) => f.what)).toEqual(["XWETH"]);
    expect(v.youSend[0].label).toBe("FACT");
  });
  it("UNKNOWN envelope has no result (never zeros)", () => {
    const env = fx("rpc_unknown_bsc");
    expect(env.status).toBe("unknown");
    expect(env.result).toBeNull();
  });
});

describe("shortcuts reused on the simulate form", () => {
  it("Enter submits in a field, / focuses, Esc cancels only while running", () => {
    expect(shortcutAction({ key: "Enter" }, { editable: true, isCheckInput: true }, { running: false })).toBe("submit");
    expect(shortcutAction({ key: "/" }, { editable: false, isCheckInput: false }, { running: false })).toBe("focus");
    expect(shortcutAction({ key: "Escape" }, { editable: false, isCheckInput: false }, { running: true })).toBe("cancel");
    expect(shortcutAction({ key: "Escape" }, { editable: false, isCheckInput: false }, { running: false })).toBeNull();
  });
});
