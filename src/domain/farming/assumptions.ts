export const ASSUMPTIONS_AS_OF = "2026-11-14";

const binance = [0.1, 0.5] as const;

/**
 * V estimates circulating launch market cap from DefiLlama's circulating market caps.
 * With 10–20% of supply circulating at launch, a mostly unlocked airdrop of
 * 5–10% of total supply can represent a large share of the launch float.
 * Assume a conservative 25% of circulating launch cap for the airdrop pool.
 */
export const FARM_ASSUMPTIONS = {
  asOf: ASSUMPTIONS_AS_OF,
  airdropShareOfLaunchCap: 0.25,
  farmerHaircut: 0.5,
  hourlyRateUsd: 25,
  capitalApr: { yieldBearing: 0.02, nonYielding: 0.05 },
  horizonMonths: 12,
  monthsPerYear: 12,
  weeksPerYear: 52,
  minutesPerHour: 60,
  farmThreshold: 1.5,
  thinThreshold: 0.75,
  depositsUsd: [1_000, 10_000],
  tradeVolumeUsd: 200,
  tradingFeeRate: 0.0006,
  setupMinutes: 5,
  bridgeMinutes: 10,
  // Active minutes for entry, each recurring check, and exit.
  minutes: {
    lending: [12, 6, 10],
    dex: [15, 8, 12],
    derivatives: [15, 12, 10],
    yield: [12, 5, 9],
    staking: [10, 4, 10],
    rwa: [45, 6, 15],
    prediction: [12, 9, 8],
    bridge: [16, 4, 6],
    generic: [12, 5, 8],
  },
  // Planning estimates as of asOf, in USD per transaction and per bridge (including gas).
  chainFees: {
    Aptos: [0.03, 0.55],
    Arbitrum: [0.09, 0.35],
    Arc: [0.05, 0.5],
    Avalanche: [0.15, 0.65],
    Base: [0.05, 0.3],
    Berachain: [0.08, 0.5],
    Binance: binance,
    Bitcoin: [2, 7],
    BSC: binance,
    Ethereum: [3, 8],
    Flare: [0.03, 0.5],
    Hemi: [0.14, 0.85],
    "Hyperliquid L1": [0.12, 0.8],
    Ink: [0.05, 0.4],
    Katana: [0.07, 0.45],
    Linea: [0.12, 0.5],
    Mantle: [0.1, 0.5],
    Monad: [0.04, 0.4],
    Optimism: [0.07, 0.35],
    Plasma: [0.04, 0.45],
    "Plume Mainnet": [0.06, 0.5],
    Polygon: [0.06, 0.5],
    "Robinhood Chain": [0.06, 0.45],
    Solana: [0.02, 0.4],
    Sonic: [0.04, 0.45],
    Starknet: [0.12, 0.65],
    Stellar: [0.01, 0.45],
    Sui: [0.04, 0.55],
    Unichain: [0.05, 0.35],
    "zkSync Era": [0.12, 0.6],
  },
  defaultChainFees: [0.45, 2.5],
} as const;
