import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildReport } from "@/lib/report";
import { verdictKind } from "@/lib/verdict";
import { redact } from "@/lib/redact";
import { fmtUtc } from "@/lib/time";
import { en } from "@/i18n/en";
import { getDict } from "@/i18n";
import type { Envelope } from "@/lib/envelope";

const FX = path.join(__dirname, "..", "fixtures", "envelopes");
const load = (rel: string): Envelope => JSON.parse(fs.readFileSync(path.join(FX, rel), "utf8"));

describe("verdict mapping", () => {
  it("maps engine strings to the four badges", () => {
    expect(verdictKind("HARD PASS").kind).toBe("hard_pass");
    expect(verdictKind("HARD PASS (do not open / do not connect)").kind).toBe("hard_pass");
    expect(verdictKind("WATCH").kind).toBe("watch");
    expect(verdictKind("WATCH (INCOMPLETE)").kind).toBe("watch_incomplete");
    expect(verdictKind("WATCH (INCOMPLETE: phishing DB UNKNOWN)").kind).toBe("watch_incomplete");
    expect(verdictKind("NO HARD FLAGS - ONLY WITH CAVEATS").kind).toBe("no_hard_flags");
    expect(verdictKind("NO HARD FLAGS - ONLY WITH CAVEATS", true).kind).toBe("watch_incomplete");
  });
  it("never upgrades unknown verdicts (incl. a hypothetical SAFE)", () => {
    expect(verdictKind("SAFE")).toEqual({ kind: "watch_incomplete", recognised: false });
    expect(verdictKind(undefined).kind).toBe("watch_incomplete");
  });
  it("no locale contains the word SAFE", () => {
    expect(JSON.stringify(en)).not.toMatch(/\bSAFE\b/);
    expect(JSON.stringify(getDict("ru"))).not.toMatch(/\bSAFE\b/);
    expect(en.report.verdicts.no_hard_flags).toBe("NO MAJOR FLAGS");
    expect(en.report.verdicts.hard_pass).toBe("AVOID"); // a red "HARD PASS" was misread as "passed"
    expect(JSON.stringify(en)).not.toMatch(/\bSSRF\b|allowlist/i); // no guard jargon in any UI string
  });
});

describe("buildReport", () => {
  it("HARD PASS fixture: flags grouped, failed source pinned as UNKNOWN", () => {
    const v = buildReport(load("bsc/0x0000000000000000000000000000000000000037.json"));
    expect(v.verdict.kind).toBe("hard_pass");
    expect(v.flagsBySeverity.critical).toHaveLength(4);
    expect(v.flagsBySeverity.high).toHaveLength(5);
    expect(v.unknown.map((u) => u.key)).toEqual(["blockscout"]);
    expect(v.unknown[0].reason).toMatch(/Blockscout/);
    expect(v.flagsBySeverity.critical[0].fetchedAt).toBe("2026-10-19T14:40:43Z");
    expect(v.flagsBySeverity.critical[0].label).toBe("FACT");
  });
  it("WATCH (INCOMPLETE): failed goplus => UNKNOWN metrics/rows, never 0", () => {
    const v = buildReport(load("eth/0x1111111111111111111111111111111111111111.json"));
    expect(v.verdict.kind).toBe("watch_incomplete");
    expect(v.unknown.find((u) => u.key === "goplus")?.status).toBe("FAIL");
    expect(v.flagsBySeverity.medium[0].label).toBe("INFERENCE");
    const lp = v.metrics.find((m) => m.key === "lp_locked_or_burned_pct");
    expect(lp?.value).toBeNull();
    expect(lp?.label).toBe("UNKNOWN");
  });
  it("NO HARD FLAGS + WATCH real envelopes", () => {
    expect(buildReport(load("auto/Fake111111111111111111111111111111111111128.json")).verdict.kind).toBe("no_hard_flags");
    const tron = buildReport(load("tron/TFake11111111111111111111111111124.json"));
    expect(tron.verdict.kind).toBe("watch");
    expect(tron.unknown).toHaveLength(0);
  });
  it("error envelope has no result and keeps the error", () => {
    const v = buildReport(load("base/0x2222222222222222222222222222222222222222.json"));
    expect(v.status).toBe("timeout");
    expect(v.error?.code).toBe("timeout");
  });
  it("skips placeholder strings in flags (docs example)", () => {
    const ex = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "token-envelope.example.json"), "utf8"));
    const v = buildReport(ex);
    expect(v.flagsBySeverity.critical).toHaveLength(2);
  });
});

describe("utils", () => {
  it("redacts key-like URL path segments and query strings", () => {
    expect(redact("rpc https://bsc-mainnet.nodereal.io/v1/0123456789abcdef0123456789abcdef failed")).toBe("rpc https://bsc-mainnet.nodereal.io/v1/*** failed");
    expect(redact("https://x.io/a?apikey=SECRET")).toBe("https://x.io/a?***");
    expect(redact("0x0000000000000000000000000000000000000037")).toBe("0x0000000000000000000000000000000000000037");
  });
  it("formats times in UTC only", () => {
    expect(fmtUtc("2026-10-19T14:40:43Z")).toBe("2026-10-19 14:40:43 UTC");
    expect(fmtUtc("2026-10-19T16:40:43+02:00")).toBe("2026-10-19 14:40:43 UTC");
    expect(fmtUtc(null)).toBe("UNKNOWN");
  });
});
