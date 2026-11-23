import { formatUsd } from "../shared/money.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import { FARM_ASSUMPTIONS as assumptions } from "./assumptions.ts";
import type { FarmTables } from "./playbook-data.ts";

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
  bridgeCostUsd: number;
  oneTimeCostUsd: number;
  recurringCostUsd: number;
  totalCostUsd: number;
  totalMinutes: number;
}

const horizonYears = assumptions.horizonMonths / assumptions.monthsPerYear;
const occurrences = {
  once: 1,
  weekly: Math.floor(assumptions.weeksPerYear * horizonYears),
  monthly: assumptions.horizonMonths,
};

function estimate(
  chain: string | null,
  bridge: boolean,
  reviewTransactions: number,
  { chains, fallback }: FarmTables["gas"],
) {
  const fees = chain !== null && Object.hasOwn(chains, chain) ? chains[chain] : undefined;
  const [transactionUsd, bridgeUsd] = fees ?? fallback;
  const cost = roundUsd(bridgeUsd + (bridge ? 0 : 2 + reviewTransactions) * transactionUsd);
  return { chain, transactionUsd, bridgeUsd, cost, feeAssumed: fees === undefined };
}

function chooseChain(
  chains: readonly string[],
  bridge: boolean,
  reviewTransactions: number,
  gas: FarmTables["gas"],
) {
  let cheapest: ReturnType<typeof estimate> | undefined;
  for (const chain of chains) {
    const candidate = estimate(chain, bridge, reviewTransactions, gas);
    if (
      !cheapest ||
      candidate.cost < cheapest.cost ||
      (candidate.cost === cheapest.cost && compareText(chain, cheapest.chain ?? "") < 0)
    ) {
      cheapest = candidate;
    }
  }
  return cheapest ?? estimate(null, bridge, reviewTransactions, gas);
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
  protocol: Pick<Protocol, "category" | "chains" | "name">,
  { playbooks, gas }: FarmTables,
  depositUsd: number = DEFAULT_DEPOSIT_USD,
): FarmPlan {
  if (!Number.isFinite(depositUsd) || depositUsd <= 0) {
    throw new Error("The farm plan needs a positive, finite deposit size.");
  }
  const category = protocol.category?.trim().toLowerCase() ?? "";
  const [group, playbook] = Object.entries(playbooks).find(([, book]) =>
    book.categories.includes(category),
  ) ?? ["generic", playbooks.generic];
  const bridge = group === "bridge";
  const repeats = occurrences[playbook.cadence];
  const { chain, transactionUsd, bridgeUsd, feeAssumed } = chooseChain(
    protocol.chains,
    bridge,
    playbook.reviewGas ? repeats : 0,
    gas,
  );
  const [entryMinutes, reviewMinutes, exitMinutes] = playbook.minutes;
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
    bridgeCostUsd: bridgeUsd,
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
