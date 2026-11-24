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
  fundingStep: FarmStep | null;
  flags: "fee-assumed"[];
  assumptionsAsOf: string;
  horizonMonths: number;
  capitalApr: number;
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
  gasTransactions: number,
  bridgeTransfers: number,
  { chains, fallback }: FarmTables["gas"],
) {
  const fees = chain !== null && Object.hasOwn(chains, chain) ? chains[chain] : undefined;
  const [transactionUsd, bridgeUsd] = fees ?? fallback;
  const cost = roundUsd(bridgeTransfers * bridgeUsd + gasTransactions * transactionUsd);
  return { chain, transactionUsd, bridgeUsd, cost, feeAssumed: fees === undefined };
}

function chooseChain(
  chains: readonly string[],
  gasTransactions: number,
  bridgeTransfers: number,
  gas: FarmTables["gas"],
) {
  let cheapest: ReturnType<typeof estimate> | undefined;
  for (const chain of chains) {
    const candidate = estimate(chain, gasTransactions, bridgeTransfers, gas);
    if (
      !cheapest ||
      candidate.cost < cheapest.cost ||
      (candidate.cost === cheapest.cost && compareText(chain, cheapest.chain ?? "") < 0)
    ) {
      cheapest = candidate;
    }
  }
  return cheapest ?? estimate(null, gasTransactions, bridgeTransfers, gas);
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
  const [entryTransactions, reviewTransactions, exitTransactions] = playbook.transactions;
  const { chain, transactionUsd, bridgeUsd, feeAssumed } = chooseChain(
    protocol.chains,
    (bridge ? 0 : entryTransactions) + reviewTransactions * repeats + exitTransactions,
    bridge ? entryTransactions : 1,
    gas,
  );
  const [entryMinutes, reviewMinutes, exitMinutes] = playbook.minutes;
  const tradingFees =
    group === "derivatives" ? assumptions.tradeVolumeUsd * assumptions.tradingFeeRate : 0;
  const deposit = formatUsd(depositUsd);
  const step = (
    action: string,
    costUsd: number,
    minutes: number,
    cadence: Cadence = "once",
  ): FarmStep => ({
    action,
    chain,
    costUsd,
    minutes,
    cadence,
  });
  const fundingStep: FarmStep | null = bridge
    ? null
    : step(
        "If funding from another chain, verify the receiving asset and bridge funds.",
        bridgeUsd,
        assumptions.bridgeMinutes,
      );
  const steps = [
    step(
      chain === null
        ? `Verify a supported chain before setting aside ${deposit} and gas.`
        : `Set aside ${deposit} in a compatible wallet or account and check its gas balance.`,
      0,
      assumptions.setupMinutes,
    ),
  ];
  if (fundingStep) steps.push(fundingStep);
  steps.push(
    step(
      `${shorten(protocol.name, 140)} — ${playbook.enter}`,
      roundUsd(entryTransactions * (bridge ? bridgeUsd : transactionUsd)),
      entryMinutes,
    ),
    step(
      playbook.review,
      roundUsd(tradingFees + reviewTransactions * transactionUsd),
      reviewMinutes,
      playbook.cadence,
    ),
    {
      ...step(playbook.exit, roundUsd(exitTransactions * transactionUsd), exitMinutes),
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
    fundingStep,
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

export function scheduleFarmMinutes({ steps }: FarmPlan): number[] {
  const weeks = Array<number>(occurrences.weekly).fill(0);
  const addMinutes = (week: number, minutes: number) => {
    weeks[week] = (weeks[week] ?? 0) + minutes;
  };
  for (const { cadence, minutes, exitCondition } of steps) {
    if (cadence === "weekly") {
      for (let week = 0; week < weeks.length; week++) addMinutes(week, minutes);
    } else if (cadence === "monthly") {
      for (let month = 1; month <= occurrences.monthly; month++) {
        const monthEnd = Math.ceil((month * weeks.length) / occurrences.monthly) - 1;
        addMinutes(monthEnd, minutes);
      }
    } else {
      addMinutes(exitCondition === undefined ? 0 : weeks.length - 1, minutes);
    }
  }
  return weeks;
}

export function renderFarmStep({
  action,
  chain,
  costUsd,
  minutes,
  cadence,
  exitCondition,
}: FarmStep): string {
  const exit = exitCondition ? ` | Exit · ${shorten(exitCondition, 100)}` : "";
  return `${shorten(action, 280)} | ${shorten(chain ?? "Chain unlisted", 110)} | Est. fee ${formatUsd(costUsd)} | ${minutes} minutes | ${cadence}${exit}`;
}
