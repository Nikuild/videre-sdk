import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildUrlView } from "@/lib/url-report";
import { buildClusterView } from "@/lib/cluster";
import { buildTickerView } from "@/lib/ticker";
import { classifyInput, urlReportPath, validateUrlTarget } from "@/lib/validation";
import { en } from "@/i18n/en";
import type { AnyEnvelope } from "@/lib/envelope";

const FX = path.join(__dirname, "..", "fixtures", "envelopes");
const raw = (rel: string) => fs.readFileSync(path.join(FX, rel), "utf8");
const load = (rel: string): AnyEnvelope => JSON.parse(raw(rel));
const KEY_PATTERNS = [/nodereal\.io\/v\d+\/(?!\*\*\*)[A-Za-z0-9]{8,}/, /(apikey|api_key|access_token)=(?!\*\*\*)[^&"\s]+/i];
const STAGE3 = ["url/app_exampleswap_test_swap.json", "url/exampleswap_airdrop_claim_test.json", "cluster/bsc/0x0000000000000000000000000000000000000080.json",
  "cluster/bsc/0x0000000000000000000000000000000000000037.json", "cluster/eth/0x0000000000000000000000000000000000000052.json", "cluster/solana/Fake1111111111111111111111111111111111111187.json",
  "ticker/XUSD.json", "ticker/XSOL.json", "ticker/FIXH.json"];

describe("input routing (home)", () => {
  it("full address / explorer link -> token; other links and bare domains -> url", () => {
    expect(classifyInput("0x0000000000000000000000000000000000000037", "auto")).toMatchObject({ kind: "token", chain: "auto" });
    expect(classifyInput("https://bscscan.com/token/0x0000000000000000000000000000000000000037", "auto")).toMatchObject({ kind: "token", chain: "bsc" });
    expect(classifyInput("exampleswap-airdrop-claim.test", "auto")).toEqual({ kind: "url", target: "exampleswap-airdrop-claim.test", host: "exampleswap-airdrop-claim.test" });
    expect(classifyInput("https://app.exampleswap.test/swap", "auto")).toMatchObject({ kind: "url", host: "app.exampleswap.test" });
    expect(classifyInput("Fake111111111111111111111111111111111111128", "auto")).toMatchObject({ kind: "token" });
  });
  it("still refuses truncated addresses and bad urls", () => {
    expect(classifyInput("0xa148…fec3", "auto")).toMatchObject({ kind: "error", code: "truncated_address" });
    expect(classifyInput("ab...cd", "auto")).toMatchObject({ kind: "error", code: "truncated_address" });
    expect(classifyInput("http://127.0.0.1/x", "auto")).toMatchObject({ kind: "error", code: "url_ip" });
    expect(validateUrlTarget("javascript:alert(1)")).toMatchObject({ ok: false });
    expect(validateUrlTarget("ftp://x.com")).toEqual({ ok: false, code: "url_scheme" });
    expect(validateUrlTarget("bücher.de")).toMatchObject({ ok: true, host: "xn--bcher-kva.de" });
  });
  it("url report path is a single reversible segment", () => {
    const p = urlReportPath("https://app.exampleswap.test/swap?x=1");
    expect(p).toBe("/r/url/https%3A%2F%2Fapp.exampleswap.test%2Fswap%3Fx%3D1");
    expect(decodeURIComponent(p.slice("/r/url/".length))).toBe("https://app.exampleswap.test/swap?x=1");
  });
});

describe("url report", () => {
  it("look-alike: WATCH, look-alike flag is INFERENCE, RDAP 404 -> UNKNOWN age (never 0)", () => {
    const v = buildUrlView(load("url/exampleswap_airdrop_claim_test.json"));
    expect(v.verdict.kind).toBe("watch");
    expect(v.host).toBe("exampleswap-airdrop-claim.test");
    const la = v.flagsBySeverity.high.find((f) => /look-alike/.test(f.flag))!;
    expect(la.label).toBe("INFERENCE");
    expect(la.fetchedAt).toMatch(/Z$/);
    const age = v.facts.find((f) => f.key === "age_days")!;
    expect(age.value).toBeNull();
    expect(age.label).toBe("UNKNOWN");
    expect(v.facts.find((f) => f.key === "phishing_list")?.label).toBe("FACT");
  });
  it("official domain: NO HARD FLAGS with caveats, registry facts with source + UTC fetched_at", () => {
    const v = buildUrlView(load("url/app_exampleswap_test_swap.json"));
    expect(v.verdict.kind).toBe("no_hard_flags");
    const reg = v.facts.find((f) => f.key === "registered")!;
    expect(reg.value).toMatch(/^2020-01-01/);
    expect(reg.source).toBe("rdap.org");
    expect(reg.fetchedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(v.facts.find((f) => f.key === "phishing_list")?.value).toMatch(/absence ≠ safe/);
  });
});

describe("cluster graph", () => {
  const v = buildClusterView(load("cluster/bsc/0x0000000000000000000000000000000000000080.json"));
  it("every non-seed node and the mother wallet are INFERENCE with a confidence", () => {
    expect(v.nodes.length).toBe(18);
    expect(v.edges.length).toBeGreaterThan(10);
    const seed = v.nodes.filter((n) => n.label === "FACT");
    expect(seed).toHaveLength(1);
    expect(seed[0].isTarget).toBe(true);
    for (const n of v.nodes.filter((x) => x.label !== "FACT")) {
      expect(n.label).toBe("INFERENCE");
      expect(["high", "medium", "low"]).toContain(n.confidence);
    }
    expect(v.mother?.label).toBe("INFERENCE");
    expect(v.nodes.find((n) => n.isMother)?.label).toBe("INFERENCE");
  });
  it("deterministic layout inside the viewBox, edges reference known nodes", () => {
    const ids = new Set(v.nodes.map((n) => n.id));
    for (const n of v.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(v.width);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(v.height);
    }
    for (const e of v.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
    expect(new Set(v.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(v.nodes.length); // no overlapping nodes
  });
  it("png fallback url is same-origin only; unknown held % stays UNKNOWN", () => {
    expect(v.pngUrl).toMatch(/^\/api\/v1\/cluster\/png\?/);
    expect(buildClusterView({ ...load("cluster/bsc/0x0000000000000000000000000000000000000080.json"), png_url: "https://evil.example/x.png" }).pngUrl).toBeNull();
    const single = buildClusterView(load("cluster/bsc/0x0000000000000000000000000000000000000037.json"));
    expect(single.nodes).toHaveLength(1);
    expect(single.heldPct).toBeNull();
    expect(single.soldPct).toBeNull(); // engine reports 0 with 0 members counted -> UNKNOWN, never 0%
    expect(single.unknowns.join(" ")).toMatch(/UNKNOWN/);
  });
  it("forces INFERENCE even if a backend omitted labels", () => {
    const env = load("cluster/bsc/0x0000000000000000000000000000000000000080.json");
    const d = (env.result as { section: { data: { nodes: Record<string, unknown>[] } } }).section.data;
    d.nodes.forEach((n) => { delete n.label; n.confidence = "n/a"; });
    const w = buildClusterView(env);
    expect(w.nodes.filter((n) => !n.isTarget).every((n) => n.label === "INFERENCE" && n.confidence === "low")).toBe(true);
  });
});

describe("same-ticker panel", () => {
  it("XUSD: reference is most liquid, copies are INFERENCE with confidence", () => {
    const v = buildTickerView(load("ticker/XUSD.json"));
    expect(v.ok).toBe(true);
    expect(v.reference).toMatchObject({ found: true, verdict: "most liquid listing" });
    const fakes = v.rows.filter((r) => r.verdict === "probable copy");
    expect(fakes.length).toBe(v.summary.probable);
    expect(fakes.length).toBeGreaterThan(0);
    for (const r of v.rows) expect(r.label === "INFERENCE" || r.label === "UNKNOWN").toBe(true);
    for (const r of fakes) expect(["high", "medium", "low"]).toContain(r.confidence);
  });
  it("reference not found is surfaced, failed panel is UNKNOWN", () => {
    expect(buildTickerView(load("ticker/FIXH.json")).reference?.found).toBe(false);
    const f = buildTickerView({ status: "timeout", error: { code: "timeout", message: "x" } });
    expect(f.ok).toBe(false);
    expect(f.rows).toHaveLength(0);
  });
});

describe("stage 3 invariants on fixtures", () => {
  it("no keys, no server paths, no SAFE, UTC-only timestamps", () => {
    for (const f of STAGE3) {
      const s = raw(f);
      for (const p of KEY_PATTERNS) expect(s, `${f} ${p}`).not.toMatch(p);
      expect(s, f).not.toMatch(/(^|["'\s])\/(?:home|root|srv|opt|tmp|var|work[a-z]*)\/[\w.-]+\//); // no absolute server paths
      expect(s, f).not.toMatch(/\bSAFE\b/);
      const times = s.match(/"\d{4}-\d\d-\d\dT[^"]*"/g) || [];
      for (const t of times) expect(t, f).toMatch(/(Z|\+00:00)"$/);
    }
    for (const k of ["url", "ticker", "cluster"] as const) expect(JSON.stringify(en[k])).not.toMatch(/\bSAFE\b/);
  });
});
