// Supported chains (mirror of the API chain choices).
export const EVM_CHAINS = ["eth", "bsc", "base", "arbitrum", "polygon", "optimism", "robinhood"] as const;
export const ALL_CHAINS = [...EVM_CHAINS, "solana", "tron"] as const;
export const CHAIN_CHOICES = ["auto", ...ALL_CHAINS] as const;

export type Chain = (typeof CHAIN_CHOICES)[number];

export const CHAIN_LABELS: Record<Chain, string> = {
  auto: "Auto-detect",
  eth: "Ethereum",
  bsc: "BNB Chain",
  base: "Base",
  arbitrum: "Arbitrum",
  polygon: "Polygon",
  optimism: "Optimism",
  robinhood: "Robinhood Chain",
  solana: "Solana",
  tron: "Tron",
};

export function isChain(x: string): x is Chain {
  return (CHAIN_CHOICES as readonly string[]).includes(x);
}

export function isEvmChain(x: string): boolean {
  return (EVM_CHAINS as readonly string[]).includes(x);
}
