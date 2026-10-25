import { describe, expect, it } from "vitest";
import { createClient, VidereApiError } from "../src/client";

const fake = (status: number, body: unknown, seen: string[]) =>
  (async (url: string) => { seen.push(url); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;

describe("createClient", () => {
  it("builds GET URLs without hard-coded hosts", async () => {
    const seen: string[] = [];
    const c = createClient({ baseUrl: "https://videre.example.com/", fetch: fake(200, { status: "ok" }, seen) });
    await c.token("0x0000000000000000000000000000000000000001", "eth");
    await c.cluster("0x0000000000000000000000000000000000000001", "bsc", 2, 30);
    expect(seen[0]).toBe("https://videre.example.com/api/v1/token?address=0x0000000000000000000000000000000000000001&chain=eth");
    expect(seen[1]).toContain("/api/v1/cluster?");
    expect(seen[1]).toContain("depth=2&max_nodes=30");
  });
  it("raises VidereApiError on error envelopes and non-envelopes", async () => {
    const c = createClient({ baseUrl: "https://videre.example.com", fetch: fake(429, { status: "error", error: { code: "rate_limited", message: "limit" } }, []) });
    await expect(c.url("example.com")).rejects.toBeInstanceOf(VidereApiError);
    const d = createClient({ baseUrl: "https://videre.example.com", fetch: fake(502, "<html>", []) });
    await expect(d.ticker("AAA")).rejects.toThrow(/unexpected response/);
  });
});
