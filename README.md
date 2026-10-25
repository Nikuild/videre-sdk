# Videre SDK

Open part of **Videre**, a read-only crypto risk checker for tokens, URLs, wallets and wallet clusters.
This package holds the **public contract** of the Videre API:

- report types and schemas (`Envelope`, `Section`, `Flag`, `Verdict`) for every check kind
  (token, URL, cluster, same ticker, wallet, simulate, signature decode, news);
- pure view-model builders that turn an API response into render-ready rows (`buildReport` and others);
- input validation for addresses, chains and URLs (EVM, Solana, Tron), run before any request is sent;
- a typed read-only HTTP client for the public endpoints;
- i18n: an EN base dictionary plus 10 locales (ru, uk, es, pt-br, de, fr, tr, zh-cn, ja, ko);
- small React primitives: `Label`, `VerdictBadge`, `CopyButton`, `Kbd` (React is an optional peer dependency).

> **Heuristics, not proof. No flags ≠ safe. Not investment advice.** Videre never prints "SAFE".

## Install

```bash
npm install @videre/sdk        # once published; for now:
git clone <this repo> && cd videre-sdk && npm install && npm run build
```

Requires Node ≥ 20.9. Build: `npm run build`; types: `npm run typecheck`; tests: `npm test`.

## Usage

```ts
import { createClient, buildReport, classifyInput, getDict } from "@videre/sdk";

const input = classifyInput("0x0000000000000000000000000000000000000001", "eth");
if (input.kind === "error") throw new Error(input.code);   // bad input never hits the API

const videre = createClient({ baseUrl: "https://videre.example.com" });
const env = await videre.token("0x0000000000000000000000000000000000000001", "eth");

const view = buildReport(env);          // verdict badge, UNKNOWN rows, flags, sources
const t = getDict("de");                // localized strings
console.log(view.verdict.kind, view.unknown.length);
```

The client sends GET requests only. It never signs, sends or approves anything and needs no API keys.
The public deployment applies its own rate limits; a `429` comes back as a `VidereApiError` with the error envelope.

## Report format: FACT / INFERENCE / UNKNOWN

Every section, flag and graph edge carries one of three epistemic labels (`Epistemic` in `src/lib/envelope.ts`):

| Label | Meaning | Example |
|---|---|---|
| `FACT` | Read directly from a chain, explorer or API at `fetched_at` (UTC) | contract verified, owner address, holder share, tx amount and time |
| `INFERENCE` | Derived from facts by a heuristic, always with a `confidence` | "same funder → likely same operator", "domain imitates a brand" |
| `UNKNOWN` | Source failed, needs a key, timed out, or was not queried | `status: "FAIL"`, `"NEEDS_KEY"` |

Rules the view models enforce:

1. Anything with `status` other than `OK` is **UNKNOWN**. UNKNOWN is never rendered as clean.
2. An incomplete report is never upgraded: with gaps, `NO MAJOR FLAGS` becomes `WATCH (INCOMPLETE)`.
3. Verdicts map onto four badges: `AVOID` (engine `HARD PASS`), `WATCH`, `WATCH (INCOMPLETE)`, `NO MAJOR FLAGS`.
4. Every value carries its `source` and a UTC timestamp. Times are rendered in UTC only.
5. Provider URLs in engine text are redacted (query strings and key-like path segments), and links pass an allowlist (`safeHref`).

A full example envelope is in `docs/token-envelope.example.json`; recorded responses for every kind are in `fixtures/envelopes/`.

## What is not included

This repository contains no detection logic. Not included:

- risk scoring and weights, how the verdict is computed;
- detection heuristics: honeypot, cluster or insider tracing, fake-team and site audit;
- lists and databases (known contracts, brands, sources);
- rate limiting and anti-abuse;
- backend, infrastructure, deployment configs, and anything related to provider keys.

The SDK only describes and renders what the API returns.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
