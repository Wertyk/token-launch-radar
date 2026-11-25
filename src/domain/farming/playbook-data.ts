import { formatUsd } from "../shared/money.ts";
import { FARM_ASSUMPTIONS as assumptions } from "./assumptions.ts";

interface Playbook {
  label: string;
  categories: readonly string[];
  minutes: readonly [number, number, number];
  transactions: readonly [entry: number, review: number, exit: number];
  capitalApr: number;
  enter: string;
  review: string;
  cadence: "weekly" | "monthly";
  exit: string;
  exitCondition: string;
  sizing?: { action: string; extraMinutes: number };
}

type ChainFees = readonly [transactionUsd: number, bridgeUsd: number];

export interface FarmTables {
  playbooks: Readonly<Record<string, Playbook>> & { generic: Playbook };
  gas: { chains: Readonly<Record<string, ChainFees>>; fallback: ChainFees };
  funding: { wallet: string; unlisted: string; bridge: string };
  checklist: {
    eligibility: string;
    size: string;
    claim: string;
    records: string;
    minutes: readonly [eligibility: number, size: number, claim: number, records: number];
  };
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
      label: "Lending",
      categories: ["lending", "uncollateralized lending", "collateral markets"],
      minutes: [12, 6, 10],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter:
        "Supply {deposit} on {chain}. Record the supply rate and available liquidity before depositing.",
      review:
        "Check available withdrawal liquidity and the supply rate. If borrowing, track health factor and the liquidation buffer.",
      cadence: "monthly",
      exit: "Repay any debt before withdrawing the supplied assets. Verify the amount received.",
      exitCondition: "Unwind sooner if the health factor breaches your limit.",
    },
    cdp: {
      label: "CDP",
      categories: ["cdp", "cdp manager"],
      minutes: [18, 8, 14],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter:
        "Before posting {deposit} on {chain}, check accepted collateral, the stability fee and any minimum debt.",
      review:
        "Compare your collateral ratio with the liquidation ratio. Check oracle prices and leave enough buffer for a price drop.",
      cadence: "weekly",
      exit: "Repay the minted debt before reclaiming collateral. Record the stability fees paid.",
      exitCondition: "Close early if the collateral buffer breaches your limit.",
    },
    dex: {
      label: "DEX and liquidity",
      categories: ["dex", "dexs", "liquidity manager"],
      minutes: [15, 8, 12],
      transactions: [1, 1, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter:
        "Add {deposit} to a liquidity pool on {chain}. Save the fee tier, range and entry amounts.",
      review:
        "Track pool share and impermanent loss against holding the assets. Rebalance if the position leaves its range.",
      cadence: "weekly",
      exit: "Remove liquidity and compare proceeds, including fees, with holding the original assets.",
      exitCondition: "Close early if fees fail to cover impermanent loss.",
    },
    derivatives: {
      label: "Derivatives and basis",
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
        "Post {deposit} as margin on {chain} after checking maintenance and liquidation terms.",
      review: `Check funding and margin headroom on each leg. If a qualifying round trip makes sense, budget ${formatUsd(assumptions.tradeVolumeUsd)} gross volume at ${(assumptions.tradingFeeRate * 100).toFixed(2)}% in trading fees.`,
      cadence: "weekly",
      exit: "Close any open legs and withdraw available margin. Reconcile trading fees and funding.",
      exitCondition: "Close early if funding or margin breaches your limit.",
    },
    yield: {
      label: "Vaults and allocators",
      categories: ["yield", "yield aggregator", "leveraged farming", "farm", "risk curators"],
      minutes: [12, 5, 9],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter:
        "Before depositing {deposit} into a vault on {chain}, verify who can reallocate assets and how redemptions work.",
      review:
        "Compare allocation weights with your entry. Check curator permissions, strategy changes and liquidity to redeem.",
      cadence: "monthly",
      exit: "Redeem vault shares or enter the withdrawal queue. Check the assets received against the share price.",
      exitCondition: "Request redemption sooner if the mandate or curator changes.",
    },
    allocator: {
      label: "Capital allocators",
      categories: ["onchain capital allocator"],
      minutes: [16, 8, 12],
      transactions: [2, 0, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter:
        "Review destination vaults before allocating {deposit} on {chain}. Budget for a separate approval if needed and cap the allowance at the deposit.",
      review:
        "Check allocation weights, curator permissions and strategy shifts. Track liquidity in the underlying vaults as well as the allocator.",
      cadence: "monthly",
      exit: "Request withdrawal from the allocator and check which underlying vaults determine when the funds settle.",
      exitCondition:
        "Request withdrawal sooner if concentration or redemption delays breach your limits.",
      sizing: {
        action:
          "Compare {deposit} with the allocator's size and any published deposit caps in underlying vaults. It is {share}.",
        extraMinutes: 2,
      },
    },
    staking: {
      label: "Staking and restaking",
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
        "Stake {deposit} on {chain} after checking validator or operator commission and unbonding terms.",
      review:
        "Track the withdrawal queue and slashing terms, including which operators or services can trigger a slash.",
      cadence: "monthly",
      exit: "Request unstaking and schedule the claim after the unbonding period. Record any slashing losses.",
      exitCondition: "Allow for unbonding and exit sooner after a slash.",
    },
    rwa: {
      label: "RWA",
      categories: ["rwa"],
      minutes: [45, 6, 15],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.yieldBearing,
      enter:
        "Check eligibility and any KYC requirements before subscribing with {deposit} on {chain}.",
      review:
        "If a peg applies, compare the price with redeemable value. Check the next redemption window and issuer liquidity.",
      cadence: "monthly",
      exit: "Request redemption at the first available window and track settlement through the issuer.",
      exitCondition: "Submit early if issuer terms or access changes.",
    },
    stablecoin: {
      label: "Stablecoins",
      categories: ["stablecoin", "dual-token stablecoin", "stablecoin wrapper"],
      minutes: [14, 5, 12],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.nonYielding,
      enter:
        "Before converting {deposit} on {chain}, verify reserves or backing, who can redeem, and minimum redemption size.",
      review:
        "Track the peg and the next redemption window. Compare executable exit quotes with the published redemption value.",
      cadence: "weekly",
      exit: "Redeem through an eligible route or compare available swap quotes if direct redemption is inaccessible.",
      exitCondition: "Exit sooner if the peg breaches your limit or redemption is suspended.",
    },
    prediction: {
      label: "Prediction markets",
      categories: ["prediction market", "prediction markets"],
      minutes: [12, 9, 8],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.nonYielding,
      enter:
        "Set a loss limit for the {deposit} budget on {chain}. Read the resolution rules before buying shares.",
      review:
        "Check the resolution source, any dispute deadline and available bids for an early exit.",
      cadence: "weekly",
      exit: "Claim settled proceeds or close against available bids. Record the loss or payout.",
      exitCondition: "Close sooner at resolution or when the loss limit is hit.",
    },
    bridge: {
      label: "Bridges",
      categories: ["bridge", "canonical bridge", "cross chain bridge"],
      minutes: [16, 4, 6],
      transactions: [1, 0, 0],
      capitalApr: assumptions.capitalApr.nonYielding,
      enter:
        "Quote a {deposit} transfer from {chain}. Confirm transfer limits, finality, the destination asset and minimum received before sending.",
      review:
        "Check finality and claim deadlines if a transfer is pending. Follow the documented recovery path if it stalls.",
      cadence: "monthly",
      exit: "Reconcile the destination balance once the transfer settles. Save both transaction IDs.",
      exitCondition: "Stop sending new funds if finality exceeds the documented window.",
      sizing: {
        action:
          "Compare {deposit} with any published route liquidity and transfer limits. This amount is {share}.",
        extraMinutes: 2,
      },
    },
    generic: {
      label: "Other products",
      categories: [],
      minutes: [12, 5, 8],
      transactions: [1, 0, 1],
      capitalApr: assumptions.capitalApr.nonYielding,
      enter: "Use a documented deposit or transfer for {deposit} on {chain} and save the receipt.",
      review:
        "Check balances and changes to access or withdrawal terms. Confirm any eligibility requirements before repeating an action.",
      cadence: "monthly",
      exit: "Use the documented withdrawal or recovery route and reconcile the proceeds.",
      exitCondition: "Exit sooner if access or withdrawal terms change.",
    },
  };
  const funding = {
    wallet: "Set aside {deposit} and keep {gas} on {chain}.",
    unlisted: "Verify a supported chain before setting aside {deposit} and {gas}.",
    bridge:
      "If your funds sit on another chain, bridge {deposit} to {chain}. Verify the receiving asset first.",
  };
  const uncollateralized = {
    enter: "Supply {deposit} on {chain} after checking the supply rate and withdrawal terms.",
    review: "Check the borrower concentration, overdue loans and available withdrawal liquidity.",
    exit: "Withdraw the supplied funds through an eligible redemption route.",
    exitCondition: "Request withdrawal sooner if a borrower misses payments.",
  };
  const checklist: FarmTables["checklist"] = {
    eligibility:
      "Check whether there is an official points or rewards page. If so, verify the wallet, chain and actions meet its eligibility terms.",
    size: "Compare {deposit} with the pool, vault or market size if published. This deposit is {share}.",
    claim:
      "If eligible at launch, claim on the plan chain. Compare the claim's USD value with the expected drop, then decide whether to hold or sell.",
    records:
      "Keep deposit, withdrawal and claim receipts with dates, USD values and fees for cost basis.",
    minutes: [2, 3, 3, 2],
  };
  return { playbooks, gas, funding, uncollateralized, checklist };
}
