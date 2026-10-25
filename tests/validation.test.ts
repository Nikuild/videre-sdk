import { describe, expect, it } from "vitest";
import { validateInput, extractFromUrl } from "@/lib/validation";

const EVM = "0x0000000000000000000000000000000000000037";
const SOL = "Fake111111111111111111111111111111111111128";
const TRON = "TFake11111111111111111111111111124";

describe("validateInput", () => {
  it("accepts full addresses", () => {
    expect(validateInput(EVM, "bsc")).toMatchObject({ ok: true, family: "evm", chain: "bsc" });
    expect(validateInput(SOL, "auto")).toMatchObject({ ok: true, family: "solana" });
    expect(validateInput(TRON, "tron")).toMatchObject({ ok: true, family: "tron" });
    expect(validateInput(`  ${EVM}\n`, "eth")).toMatchObject({ ok: true, address: EVM });
  });
  it("rejects truncated addresses", () => {
    for (const a of ["0xa148…fec3", "0xa148...fec3", "JUPy…DvCN", "TR7N..Lj6t"]) expect(validateInput(a, "auto")).toMatchObject({ ok: false, code: "truncated_address" });
    expect(validateInput("0xa148E9589d3E9EB", "auto")).toMatchObject({ ok: false, code: "evm_too_short" });
    expect(validateInput("JUPyiwrYJFsk", "auto")).toMatchObject({ ok: false, code: "b58_too_short" });
  });
  it("rejects wrong length / format / chain mismatch", () => {
    expect(validateInput(EVM + "00", "auto")).toMatchObject({ ok: false, code: "evm_bad" });
    expect(validateInput("", "auto")).toMatchObject({ ok: false, code: "missing_address" });
    expect(validateInput(EVM, "solana")).toMatchObject({ ok: false, code: "chain_mismatch" });
    expect(validateInput(SOL, "eth")).toMatchObject({ ok: false, code: "chain_mismatch" });
    expect(validateInput(EVM, "dogechain")).toMatchObject({ ok: false, code: "bad_chain" });
    expect(validateInput("0xa148 E9589d3E9EB3754510D71708B078F205fec3", "auto")).toMatchObject({ ok: false });
  });
  it("extracts addresses from explorer / dex URLs", () => {
    expect(validateInput(`https://bscscan.com/token/${EVM}`, "auto")).toMatchObject({ ok: true, address: EVM, chain: "bsc", fromUrl: true });
    expect(validateInput(`https://dexscreener.com/solana/${SOL}`, "auto")).toMatchObject({ ok: true, address: SOL, chain: "solana" });
    expect(validateInput("https://example.com/no-address-here", "auto")).toMatchObject({ ok: false, code: "url_no_address" });
    expect(validateInput("https://bscscan.com/token/0xa148…fec3", "auto")).toMatchObject({ ok: false, code: "truncated_address" });
    expect(extractFromUrl("not a url")).toBeNull();
  });
});
