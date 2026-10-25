import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { en } from "@/i18n/en";
import { getDict, LOCALES } from "@/i18n";
import { knownMatch, knownText, simRoleText, sourceText } from "@/lib/known-text";
import { humanFlag } from "@/lib/humanize";

const FX = path.join(__dirname, "..", "fixtures");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") ? [p] : []; });
}
const strings = new Set<string>();
const roles = new Set<string>();
// roles: Simulate A envelopes only (Simulate B roles are field names, see signature-text)
function collect(x: unknown, sim: boolean, key = "") {
  if (typeof x === "string") { strings.add(x); if (sim && key === "roles") roles.add(x); }
  else if (Array.isArray(x)) x.forEach((y) => collect(y, sim, key));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) collect(v, sim, k);
}
for (const f of walk(FX)) collect(JSON.parse(readFileSync(f, "utf8")), !/signature/.test(f));
const k = en.known;

// one sample per rule (placeholders filled) -> every rule is exercised even without a fixture
const SAMPLES = Object.values(k.text).map((tpl) => tpl.replace("{brand}", "exampleswap").replace("{list}", "exampleswap.test, app.exampleswap.test").replace("{status}", "4byte timeout").replace("{engine}", "Videre"));

describe("known engine / backend constants -> active-locale text", () => {
  it("RU-review strings are present in fixtures and matched", () => {
    for (const needle of ["sum over DexScreener pairs", "simulation at fetch time only", "concentration computed by Videre", "paid promotion", "first-funder walk (earliest", "contains brand", "RDAP 404", "Simulation shows what", "fees excluded", "matched the verified contract ABI"]) {
      const hits = [...strings].filter((s) => s.includes(needle));
      expect(hits.length, needle).toBeGreaterThan(0);
      for (const h of hits) expect(knownMatch(h, k), h).not.toBeNull();
    }
  });
  it("EN reproduces every matched fixture string byte for byte", () => {
    let n = 0;
    for (const s of strings) { const m = knownMatch(s, k); if (m !== null) { n++; expect(m).toBe(s.trim()); } }
    for (const s of SAMPLES) expect(knownMatch(s, k)).toBe(s);
    expect(n).toBeGreaterThan(10);
  });
  it("EN: sources, roles and the new flag titles are unchanged", () => {
    for (const s of strings) if (s.includes("local resolver")) expect(sourceText(s, k)).toBe(s);
    expect(roles.size).toBeGreaterThan(3);
    for (const r of roles) expect(simRoleText(r, k)).toBe(r);
    for (const f of ["deployer funding from high-volume (INFERENCE)", "funded from high-volume (INFERENCE)", "funded from cex (INFERENCE)", "deployer funding from bridge (INFERENCE)", "funded from swap (INFERENCE)", "funded from bridge (INFERENCE)"]) {
      expect(humanFlag(f, "", en.flags).title).toBe(f.charAt(0).toUpperCase() + f.slice(1));
    }
  });
  it("unknown strings pass through verbatim", () => {
    expect(knownText("some new engine note", k)).toBe("some new engine note");
    expect(knownText(null, k)).toBe("");
    expect(simRoleText("weird role", k)).toBe("weird role");
  });
  for (const l of LOCALES.filter((x) => x !== "en")) {
    it(`${l}: every constant translated, placeholders filled, roles and flags translated`, async () => {
      const t = await getDict(l);
      for (const s of SAMPLES) {
        const m = knownMatch(s, t.known)!;
        expect(m, `${l} ${s}`).toBeTruthy();
        expect(m, `${l} ${s}`).not.toBe(s);
        expect(m).not.toMatch(/\{\w+\}/);
      }
      expect(knownMatch(SAMPLES[Object.keys(k.text).indexOf("brand_not_official")], t.known)).toContain("exampleswap.test, app.exampleswap.test");
      expect(sourceText("dns.google (DoH) + local resolver", t.known)).not.toContain("local resolver");
      for (const r of roles) if (r !== "token") expect(simRoleText(r, t.known), `${l} ${r}`).not.toBe(r); // "token" is the same word in several locales
      expect(humanFlag("funded from high-volume (INFERENCE)", "", t.flags).title).not.toBe("Funded from high-volume (INFERENCE)");
      expect(humanFlag("deployer funding from high-volume (INFERENCE)", "", t.flags).title).not.toBe("Deployer funding from high-volume (INFERENCE)");
    });
  }
  it("engine rename: concentration note matches the current and the pre-rename engine name", () => {
    const tail = " from the source's top-holder list (CEX/lockers are NOT excluded; identity = INFERENCE)";
    for (const name of ["Videre", "s" + "camcheck"]) {
      const raw = `concentration computed by ${name}${tail}`;
      expect(knownMatch(raw, k)).toBe(raw);
    }
    expect(knownMatch(`concentration computed by someone${tail}`, k)).toBeNull();
  });
});
