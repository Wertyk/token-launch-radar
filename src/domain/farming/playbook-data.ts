import { formatUsd } from "../shared/money.ts";
import { FARM_ASSUMPTIONS as assumptions } from "./assumptions.ts";

interface Playbook {
  categories: readonly string[];
  minutes: readonly [number, number, number];
  transactions: readonly [entry: number, review: number, exit: number];
  capitalApr: number;
  enter: string;
  review: string;
  cadence: "weekly" | "monthly";
  exit: string;
  exitCondition: string;
}

type ChainFees = readonly [transactionUsd: number, bridgeUsd: number];

export interface FarmTables {
  playbooks: Readonly<Record<string, Playbook>> & { generic: Playbook };
  gas: { chains: Readonly<Record<string, ChainFees>>; fallback: ChainFees };
}

const binance = [0.1, 0.5] as const;

// Planning estimates in USD per transaction and per bridge (including gas).
const gas: FarmTables["gas"] = {
  chains: {
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
  fallback: [0.45, 2.5],
};

export function farmTables(): FarmTables {
  const playbooks: FarmTables["playbooks"] = {
    lending: {
      categories: [
        "lending",
        "uncollateralized lending",
        "cdp",
        "cdp manager",
        "collateral markets",
      ],
      minutes: [12, 6, 10],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter: "Supply collateral. Log the rate and liquidation limit if borrowing.",
      review: "Log the supply rate and check the health factor of any debt.",
      cadence: "monthly",
      exit: "Repay any debt and withdraw the collateral.",
      exitCondition: "At the horizon or sooner if collateral nears liquidation.",
    },
    dex: {
      categories: ["dex", "dexs", "liquidity manager"],
      minutes: [15, 8, 12],
      transactions: [1, 1, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter: "Add liquidity to one pool. Save its fee tier, price range and entry amounts.",
      review: "Compare pool value plus fees against holding. Rebalance if the range breaks.",
      cadence: "weekly",
      exit: "Remove liquidity and compare proceeds with holding the entry amounts.",
      exitCondition: "At the horizon or when fees fail to cover divergence loss.",
    },
    derivatives: {
      categories: [
        "derivatives",
        "interest rate derivatives",
        "basis trading",
        "options",
        "options vault",
        "perps",
      ],
      minutes: [15, 12, 10],
      transactions: [1, 2, 1],
      capitalApr: assumptions.capitalApr.nonYielding,
      enter: "Post margin and record funding and liquidation terms.",
      review: `If eligible, open and close a small position within ${formatUsd(assumptions.tradeVolumeUsd)} of gross volume at ${(assumptions.tradingFeeRate * 100).toFixed(2)}% in trading fees. Log funding.`,
      cadence: "weekly",
      exit: "Close open positions and withdraw available margin.",
      exitCondition: "At the horizon or sooner if funding or margin hits your limit.",
    },
    yield: {
      categories: [
        "yield",
        "yield aggregator",
        "leveraged farming",
        "farm",
        "onchain capital allocator",
        "risk curators",
      ],
      minutes: [12, 5, 9],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter: "Deposit into a vault. Record shares, strategy, fees and withdrawal terms.",
      review: "Check share price, strategy changes and available exit liquidity.",
      cadence: "monthly",
      exit: "Redeem vault shares and record assets received.",
      exitCondition: "When withdrawals open at the horizon or after a strategy change.",
    },
    staking: {
      categories: [
        "liquid staking",
        "staking pool",
        "restaking",
        "liquid restaking",
        "restaked btc",
        "staking",
      ],
      minutes: [10, 4, 10],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter: "Stake with a validator or pool. Record commission and the unbonding period.",
      review: "Check validator uptime, rewards and slashing notices.",
      cadence: "monthly",
      exit: "Request unstaking and schedule the claim after unbonding.",
      exitCondition: "Allow for unbonding before the horizon or exit after a slash.",
    },
    rwa: {
      categories: ["rwa"],
      minutes: [45, 6, 15],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter:
        "Allow time for eligibility checks and KYC. If approved, subscribe and log the redemption window.",
      review: "Check issuer updates, access restrictions and redemption liquidity.",
      cadence: "monthly",
      exit: "Submit a redemption and track settlement.",
      exitCondition: "At the first eligible window near the horizon or after a terms change.",
    },
    prediction: {
      categories: ["prediction market", "prediction markets"],
      minutes: [12, 9, 8],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.nonYielding,
      enter: "Read one market’s resolution rules. Set a loss limit before buying shares.",
      review: "Check resolution updates and available bids for the position.",
      cadence: "weekly",
      exit: "Claim settled proceeds or close against available bids.",
      exitCondition: "At resolution, the loss limit or the horizon.",
    },
    bridge: {
      categories: ["bridge", "canonical bridge", "cross chain bridge"],
      minutes: [16, 4, 6],
      transactions: [1, 0, 0],
      capitalApr: assumptions.capitalApr.nonYielding,
      enter: "Quote the destination asset and minimum received. Send only after verifying both.",
      review: "Check unresolved transfers and follow the documented recovery path if needed.",
      cadence: "monthly",
      exit: "Reconcile the destination balance and save both transaction IDs.",
      exitCondition: "Once the transfer settles or recovery completes.",
    },
    generic: {
      categories: [],
      minutes: [12, 5, 8],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.nonYielding,
      enter: "Use a documented deposit or transfer and save the receipt.",
      review: "Check balances and changes to access or withdrawal terms.",
      cadence: "monthly",
      exit: "Withdraw through the documented route and reconcile proceeds.",
      exitCondition: "At the horizon or when access or withdrawal terms change.",
    },
  };
  return { playbooks, gas };
}
