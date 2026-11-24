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
  funding: { wallet: string; unlisted: string; bridge: string };
  uncollateralized: Pick<Playbook, "enter" | "review" | "exit" | "exitCondition">;
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
      enter:
        "Supply {deposit} as collateral through {protocol} on {chain}. Log the rate and liquidation limit if borrowing.",
      review:
        "Check {protocol}'s supply rate for the position opened with {deposit} and the health factor of any debt.",
      cadence: "monthly",
      exit: "Repay any debt and withdraw collateral from the {protocol} position opened with {deposit} on {chain}.",
      exitCondition: "At the horizon or sooner if collateral nears liquidation.",
    },
    dex: {
      categories: ["dex", "dexs", "liquidity manager"],
      minutes: [15, 8, 12],
      transactions: [1, 1, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter:
        "Add {deposit} of liquidity to a {protocol} pool on {chain}. Save its fee tier, range and entry amounts.",
      review:
        "Compare the value and fees of the {protocol} pool position opened with {deposit} against holding. Rebalance if the range breaks.",
      cadence: "weekly",
      exit: "Remove liquidity from the {protocol} pool position opened with {deposit} on {chain}. Compare proceeds with holding.",
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
      enter:
        "Post {deposit} as margin at {protocol} on {chain} and record funding and liquidation terms.",
      review: `Use the margin posted with {deposit} at {protocol} for an eligible round trip within ${formatUsd(assumptions.tradeVolumeUsd)} of gross volume at ${(assumptions.tradingFeeRate * 100).toFixed(2)}% in trading fees. Log funding.`,
      cadence: "weekly",
      exit: "Close any {protocol} positions on {chain} and withdraw available margin from the account funded with {deposit}.",
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
      enter:
        "Deposit {deposit} into {protocol}'s vault on {chain}. Record shares, strategy, fees and withdrawal terms.",
      review:
        "For the {deposit} {protocol} vault entry, check share price, strategy changes and exit liquidity.",
      cadence: "monthly",
      exit: "Redeem {protocol} vault shares from the {deposit} entry on {chain}. Record assets received.",
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
      enter:
        "Stake {deposit} with {protocol} on {chain}. Record validator or pool commission and the unbonding period.",
      review:
        "For the {protocol} stake opened with {deposit}, check validator uptime, rewards and slashing notices.",
      cadence: "monthly",
      exit: "Request unstaking for the {protocol} position opened with {deposit} on {chain} and schedule the claim after unbonding.",
      exitCondition: "Allow for unbonding before the horizon or exit after a slash.",
    },
    rwa: {
      categories: ["rwa"],
      minutes: [45, 6, 15],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter:
        "Complete {protocol}'s eligibility checks and KYC. If approved, subscribe with {deposit} on {chain} and log the redemption window.",
      review:
        "For the {protocol} subscription placed with {deposit}, check issuer updates, access restrictions and redemption liquidity.",
      cadence: "monthly",
      exit: "Submit a redemption for the {protocol} subscription placed with {deposit} on {chain} and track settlement.",
      exitCondition: "At the first eligible window near the horizon or after a terms change.",
    },
    prediction: {
      categories: ["prediction market", "prediction markets"],
      minutes: [12, 9, 8],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.nonYielding,
      enter:
        "Budget {deposit} for {protocol} on {chain}. Read the market’s resolution rules and set a loss limit before buying shares.",
      review:
        "Check resolution updates and available bids for the {protocol} position opened with {deposit}.",
      cadence: "weekly",
      exit: "Claim settled proceeds from the {protocol} position opened with {deposit} on {chain} or close against available bids.",
      exitCondition: "At resolution, the loss limit or the horizon.",
    },
    bridge: {
      categories: ["bridge", "canonical bridge", "cross chain bridge"],
      minutes: [16, 4, 6],
      transactions: [1, 0, 0],
      capitalApr: assumptions.capitalApr.nonYielding,
      enter:
        "Quote a {deposit} transfer through {protocol} from {chain}. Verify the destination asset and minimum received before sending.",
      review:
        "Check the {deposit} transfer through {protocol} and follow the documented recovery path if unresolved.",
      cadence: "monthly",
      exit: "Reconcile the destination balance after the {deposit} transfer through {protocol} and save both transaction IDs.",
      exitCondition: "Once the transfer settles or recovery completes.",
    },
    generic: {
      categories: [],
      minutes: [12, 5, 8],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.nonYielding,
      enter:
        "Use a documented {protocol} deposit or transfer for {deposit} on {chain} and save the receipt.",
      review:
        "Check balances and changes to access or withdrawal terms after the original {deposit} deposit or transfer through {protocol}.",
      cadence: "monthly",
      exit: "Withdraw through the documented {protocol} route on {chain} for the plan started with {deposit} and reconcile proceeds.",
      exitCondition: "At the horizon or when access or withdrawal terms change.",
    },
  };
  const funding = {
    wallet: "Set aside {deposit} for {protocol} and keep {gas} on {chain}.",
    unlisted: "Verify a chain supported by {protocol} before setting aside {deposit} and {gas}.",
    bridge:
      "If your funds sit on another chain, bridge {deposit} to {chain} for {protocol}. Verify the receiving asset first.",
  };
  const uncollateralized = {
    enter:
      "Supply {deposit} to {protocol} on {chain}. Record the supply rate and withdrawal terms.",
    review:
      "Check the supply rate and withdrawal liquidity for the {protocol} position opened with {deposit}.",
    exit: "Withdraw the supplied funds from the {protocol} position opened with {deposit} on {chain}.",
    exitCondition: "At the horizon, when withdrawals are available.",
  };
  return { playbooks, gas, funding, uncollateralized };
}
