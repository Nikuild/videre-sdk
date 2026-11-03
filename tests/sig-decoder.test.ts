import { describe, expect, it } from "vitest";
import { decodeSignature, PERMIT2 } from "@/lib/sig-decoder";

const NOW = 1_800_000_000;
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const S = "0x1111111111111111111111111111111111111111", O = "0x2222222222222222222222222222222222222222";
const tokens = [{ chainId: 1, address: USDC, symbol: "USDC", decimals: 6, source: "test", license: "test" }];
const MAX = (2n ** 256n - 1n).toString(), MAX160 = (2n ** 160n - 1n).toString();

describe("sig decoder", () => {
  it("EIP-2612 permit unlimited", () => {
    const d = decodeSignature({ domain: { chainId: 1, verifyingContract: USDC }, primaryType: "Permit",
      message: { owner: O, spender: S, value: MAX, nonce: 0, deadline: NOW + 100 } }, { tokens, now: NOW });
    expect(d).toMatchObject({ kind: "eip2612_permit", spender: S, owner: O, unlimited: true, expired: false });
    expect(d.tokens[0]).toMatchObject({ symbol: "USDC", verified: true });
  });
  it("Permit2 single, long validity, verified token", () => {
    const d = decodeSignature(JSON.stringify({ domain: { chainId: "1", verifyingContract: PERMIT2 }, primaryType: "PermitSingle",
      message: { details: { token: USDC, amount: MAX160, expiration: NOW + 400 * 86400, nonce: 0 }, spender: S, sigDeadline: NOW + 60 } }), { tokens, now: NOW });
    expect(d.kind).toBe("permit2_single"); expect(d.unlimited).toBe(true); expect(d.notes).toContain("long_validity");
  });
  it("Permit2 batch + unexpected verifying contract", () => {
    const d = decodeSignature({ domain: { chainId: 1, verifyingContract: S }, primaryType: "PermitBatch",
      message: { details: [{ token: USDC, amount: "5", expiration: NOW + 10 }, { token: O, amount: "7", expiration: NOW + 10 }], spender: S, sigDeadline: NOW + 5 } }, { tokens, now: NOW });
    expect(d.tokens.map((t) => t.verified)).toEqual([true, false]); expect(d.unlimited).toBe(false);
    expect(d.notes).toContain("permit2_unexpected_verifying_contract");
  });
  it("Permit2 transfer and batch transfer, expired", () => {
    const one = decodeSignature({ domain: { chainId: 1, verifyingContract: PERMIT2 }, primaryType: "PermitTransferFrom",
      message: { permitted: { token: USDC, amount: "100" }, spender: S, nonce: 1, deadline: NOW - 1 } }, { now: NOW });
    expect(one).toMatchObject({ kind: "permit2_transfer", expired: true });
    const many = decodeSignature({ domain: { chainId: 1, verifyingContract: PERMIT2 }, primaryType: "PermitTransferFrom",
      message: { permitted: [{ token: USDC, amount: "1" }, { token: O, amount: MAX }], spender: S, nonce: 1, deadline: NOW + 1 } }, { now: NOW });
    expect(many).toMatchObject({ kind: "permit2_batch_transfer", unlimited: true });
  });
  it("Seaport order giving everything away", () => {
    const d = decodeSignature({ domain: { chainId: 1, verifyingContract: "0x00000000000000adc04c56bf30ac9d3c0aaf14dc" }, primaryType: "OrderComponents",
      message: { offerer: O, offer: [{ itemType: 2, token: S, identifierOrCriteria: "1", startAmount: "1", endAmount: "1" }],
        consideration: [{ itemType: 0, token: "0x0000000000000000000000000000000000000000", startAmount: "1", endAmount: "1", recipient: S }], endTime: NOW + 10 } }, { now: NOW });
    expect(d).toMatchObject({ kind: "seaport_order", owner: O, spender: S.toLowerCase() });
    expect(d.notes).toContain("seaport_nothing_back_to_offerer");
  });
  it("eth_sign raw hash", () => {
    expect(decodeSignature("0x" + "ab".repeat(32)).notes).toContain("blind_hash_signature");
  });
  it("SIWE with URI mismatch", () => {
    const msg = `example.com wants you to sign in with your Ethereum account:\n${O}\n\nSign in\n\nURI: https://evil.test/login\nVersion: 1\nChain ID: 1\nNonce: abc12345\nIssued At: 2026-01-01T00:00:00Z\nExpiration Time: 2020-01-01T00:00:00Z`;
    const d = decodeSignature(msg, { now: NOW });
    expect(d).toMatchObject({ kind: "siwe", chainId: 1, owner: O, expired: true });
    expect(d.notes).toContain("siwe_domain_uri_mismatch");
  });
  it("garbage -> invalid / unknown", () => {
    expect(decodeSignature("hello").kind).toBe("invalid");
    expect(decodeSignature({ primaryType: "Mail", message: {} }).kind).toBe("typed_data_unknown");
  });
});
