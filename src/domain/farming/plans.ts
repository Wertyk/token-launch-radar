import { formatUsd } from "../shared/money.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import { FARM_ASSUMPTIONS as assumptions } from "./assumptions.ts";

export { ASSUMPTIONS_AS_OF } from "./assumptions.ts";
export const DEFAULT_DEPOSIT_USD = assumptions.depositsUsd[0];

type Cadence = "once" | "weekly" | "monthly";

export interface FarmStep {
  action: string;
  chain: string | null;
  costUsd: number;
  minutes: number;
  cadence: Cadence;
  exitCondition?: string;
}

export interface FarmPlan {
  chain: string | null;
  depositUsd: number;
  steps: FarmStep[];
  flags: "fee-assumed"[];
  assumptionsAsOf: string;
  horizonMonths: number;
  capitalApr: number;
  oneTimeCostUsd: number;
  recurringCostUsd: number;
  totalCostUsd: number;
  totalMinutes: number;
}

interface Playbook {
  capitalApr: number;
  enter: string;
  review: string;
  cadence: Exclude<Cadence, "once">;
  reviewGas?: boolean;
  exit: string;
  exitCondition: string;
}

type Group = keyof typeof assumptions.minutes;

const PLAYBOOKS: Record<Group, Playbook> = {
  lending: {
    capitalApr: assumptions.capitalApr.yieldBearing,
    enter: "Supply collateral. Log the rate and liquidation limit if borrowing.",
    review: "Log the supply rate and check the health factor of any debt.",
    cadence: "monthly",
    exit: "Repay any debt and withdraw the collateral.",
    exitCondition: "At the horizon or sooner if collateral nears liquidation.",
  },
  dex: {
    capitalApr: assumptions.capitalApr.yieldBearing,
    enter: "Add liquidity to one pool. Save its fee tier, price range and entry amounts.",
    review: "Compare pool value plus fees against holding. Rebalance if the range breaks.",
    cadence: "weekly",
    reviewGas: true,
    exit: "Remove liquidity and compare proceeds with holding the entry amounts.",
    exitCondition: "At the horizon or when fees fail to cover divergence loss.",
  },
  derivatives: {
    capitalApr: assumptions.capitalApr.nonYielding,
    enter: "Post margin and record funding and liquidation terms.",
    review: `If eligible, open and close a small position within ${formatUsd(assumptions.tradeVolumeUsd)} of gross volume at ${(assumptions.tradingFeeRate * 100).toFixed(2)}% in trading fees. Log funding.`,
    cadence: "weekly",
    reviewGas: true,
    exit: "Close open positions and withdraw available margin.",
    exitCondition: "At the horizon or sooner if funding or margin hits your limit.",
  },
  yield: {
    capitalApr: assumptions.capitalApr.yieldBearing,
    enter: "Deposit into a vault. Record shares, strategy, fees and withdrawal terms.",
    review: "Check share price, strategy changes and available exit liquidity.",
    cadence: "monthly",
    exit: "Redeem vault shares and record assets received.",
    exitCondition: "When withdrawals open at the horizon or after a strategy change.",
  },
  staking: {
    capitalApr: assumptions.capitalApr.yieldBearing,
    enter: "Stake with a validator or pool. Record commission and the unbonding period.",
    review: "Check validator uptime, rewards and slashing notices.",
    cadence: "monthly",
    exit: "Request unstaking and schedule the claim after unbonding.",
    exitCondition: "Allow for unbonding before the horizon or exit after a slash.",
  },
  rwa: {
    capitalApr: assumptions.capitalApr.yieldBearing,
    enter:
      "Allow time for eligibility checks and KYC. If approved, subscribe and log the redemption window.",
    review: "Check issuer updates, access restrictions and redemption liquidity.",
    cadence: "monthly",
    exit: "Submit a redemption and track settlement.",
    exitCondition: "At the first eligible window near the horizon or after a terms change.",
  },
  prediction: {
    capitalApr: assumptions.capitalApr.nonYielding,
    enter: "Read one market’s resolution rules. Set a loss limit before buying shares.",
    review: "Check resolution updates and available bids for the position.",
    cadence: "weekly",
    exit: "Claim settled proceeds or close against available bids.",
    exitCondition: "At resolution, the loss limit or the horizon.",
  },
  bridge: {
    capitalApr: assumptions.capitalApr.nonYielding,
    enter: "Quote the destination asset and minimum received. Send only after verifying both.",
    review: "Check unresolved transfers and follow the documented recovery path if needed.",
    cadence: "monthly",
    exit: "Reconcile the destination balance and save both transaction IDs.",
    exitCondition: "Once the transfer settles or recovery completes.",
  },
  generic: {
    capitalApr: assumptions.capitalApr.nonYielding,
    enter: "Use a documented deposit or transfer and save the receipt.",
    review: "Check balances and changes to access or withdrawal terms.",
    cadence: "monthly",
    exit: "Withdraw through the documented route and reconcile proceeds.",
    exitCondition: "At the horizon or when access or withdrawal terms change.",
  },
};

const categories: Record<Group, readonly string[]> = {
  dex: ["dex", "dexs", "liquidity manager"],
  lending: ["lending", "uncollateralized lending", "cdp", "cdp manager", "collateral markets"],
  staking: [
    "liquid staking",
    "staking pool",
    "restaking",
    "liquid restaking",
    "restaked btc",
    "staking",
  ],
  yield: [
    "yield",
    "yield aggregator",
    "leveraged farming",
    "farm",
    "onchain capital allocator",
    "risk curators",
  ],
  derivatives: [
    "derivatives",
    "interest rate derivatives",
    "basis trading",
    "options",
    "options vault",
    "perps",
  ],
  bridge: ["bridge", "canonical bridge", "cross chain bridge"],
  rwa: ["rwa"],
  prediction: ["prediction market", "prediction markets"],
  generic: [],
};

const groups = new Map(
  (Object.keys(categories) as Group[]).flatMap((group) =>
    categories[group].map((label) => [label, group] as const),
  ),
);
const chainFees: Readonly<Record<string, readonly [number, number]>> = assumptions.chainFees;
const horizonYears = assumptions.horizonMonths / assumptions.monthsPerYear;
const occurrences = {
  once: 1,
  weekly: Math.floor(assumptions.weeksPerYear * horizonYears),
  monthly: assumptions.horizonMonths,
};

function estimate(chain: string | null, bridge: boolean, reviewTransactions: number) {
  const fees = chain !== null && Object.hasOwn(chainFees, chain) ? chainFees[chain] : undefined;
  const [transactionUsd, bridgeUsd] = fees ?? assumptions.defaultChainFees;
  const cost = roundUsd(bridgeUsd + (bridge ? 0 : 2 + reviewTransactions) * transactionUsd);
  return { chain, transactionUsd, bridgeUsd, cost, feeAssumed: fees === undefined };
}

function chooseChain(chains: readonly string[], bridge: boolean, reviewTransactions: number) {
  let cheapest: ReturnType<typeof estimate> | undefined;
  for (const chain of chains) {
    const candidate = estimate(chain, bridge, reviewTransactions);
    if (
      !cheapest ||
      candidate.cost < cheapest.cost ||
      (candidate.cost === cheapest.cost && compareText(chain, cheapest.chain ?? "") < 0)
    ) {
      cheapest = candidate;
    }
  }
  return cheapest ?? estimate(null, bridge, reviewTransactions);
}

function shorten(text: string, max: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function makeFarmPlan(
  protocol: Protocol,
  depositUsd: number = DEFAULT_DEPOSIT_USD,
): FarmPlan {
  if (!Number.isFinite(depositUsd) || depositUsd <= 0) {
    throw new Error("The farm plan needs a positive, finite deposit size.");
  }
  const group = groups.get(protocol.category?.trim().toLowerCase() ?? "") ?? "generic";
  const playbook = PLAYBOOKS[group];
  const bridge = group === "bridge";
  const repeats = occurrences[playbook.cadence];
  const { chain, transactionUsd, bridgeUsd, feeAssumed } = chooseChain(
    protocol.chains,
    bridge,
    playbook.reviewGas ? repeats : 0,
  );
  const [entryMinutes, reviewMinutes, exitMinutes] = assumptions.minutes[group];
  const tradingFees =
    group === "derivatives" ? assumptions.tradeVolumeUsd * assumptions.tradingFeeRate : 0;
  const deposit = formatUsd(depositUsd);
  const steps: FarmStep[] = [
    {
      action:
        chain === null
          ? `Verify a supported chain before setting aside ${deposit} and gas.`
          : `Set aside ${deposit} in a compatible wallet or account and check its gas balance.`,
      chain,
      costUsd: 0,
      minutes: assumptions.setupMinutes,
      cadence: "once",
    },
  ];
  if (!bridge) {
    steps.push({
      action: "If funding from another chain, verify the receiving asset and bridge funds.",
      chain,
      costUsd: bridgeUsd,
      minutes: assumptions.bridgeMinutes,
      cadence: "once",
    });
  }
  steps.push(
    {
      action: `${shorten(protocol.name, 140)} — ${playbook.enter}`,
      chain,
      costUsd: bridge ? bridgeUsd : transactionUsd,
      minutes: entryMinutes,
      cadence: "once",
    },
    {
      action: playbook.review,
      chain,
      costUsd: roundUsd(tradingFees + (playbook.reviewGas ? transactionUsd : 0)),
      minutes: reviewMinutes,
      cadence: playbook.cadence,
    },
    {
      action: playbook.exit,
      chain,
      costUsd: bridge ? 0 : transactionUsd,
      minutes: exitMinutes,
      cadence: "once",
      exitCondition: playbook.exitCondition,
    },
  );

  let oneTimeCostUsd = 0;
  let recurringCostUsd = 0;
  let totalMinutes = 0;
  for (const { costUsd, minutes, cadence } of steps) {
    const count = occurrences[cadence];
    if (cadence === "once") oneTimeCostUsd += costUsd;
    else recurringCostUsd += costUsd * count;
    totalMinutes += minutes * count;
  }
  return {
    chain,
    depositUsd,
    steps,
    flags: feeAssumed ? ["fee-assumed"] : [],
    assumptionsAsOf: assumptions.asOf,
    horizonMonths: assumptions.horizonMonths,
    capitalApr: playbook.capitalApr,
    oneTimeCostUsd: roundUsd(oneTimeCostUsd),
    recurringCostUsd: roundUsd(recurringCostUsd),
    totalCostUsd: roundUsd(oneTimeCostUsd + recurringCostUsd),
    totalMinutes,
  };
}

export function renderFarmStep(step: FarmStep): string {
  const action = shorten(step.action, 280);
  const chain = shorten(step.chain ?? "Chain unlisted", 110);
  const exit = step.exitCondition ? ` | Exit · ${shorten(step.exitCondition, 100)}` : "";
  return `${action} | ${chain} | Est. fee ${formatUsd(step.costUsd)} | ${step.minutes} minutes | ${step.cadence}${exit}`;
}
