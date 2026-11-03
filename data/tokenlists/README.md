# Token lists (data only)

| File | Source | License | Notes |
|---|---|---|---|
| uniswap-default.json | https://tokens.uniswap.org — github.com/Uniswap/default-token-list | GPL-3.0 (upstream repo license) | Subset: chainIds 1, 10, 56, 137, 8453, 42161. Every record has `source` and `license`. |

These files are **not** part of the published npm package (`files: ["dist", ...]`) and are not imported by `src/`.
The decoder takes a token list as a parameter (`decodeSignature(payload, { tokens })`).
Not used as sources: CoinGecko, GeckoTerminal, DefiLlama, Etherscan, ScamSniffer, NodeReal.
Not used: Superchain (Optimism) token list — upstream repo has no license file.
