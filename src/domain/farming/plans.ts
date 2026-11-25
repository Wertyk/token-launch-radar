import { formatUsd } from "../shared/money.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import { FARM_ASSUMPTIONS as assumptions } from "./assumptions.ts";
import { formatFarmStep } from "./board-steps.ts";
import type { FarmTables } from "./playbook-data.ts";

type Cadence = "once" | "weekly" | "monthly";

interface FarmStep {
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
export const occurrences = {
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

export function shorten(text: string, max: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function makeFarmPlan(
  protocol: Pick<Protocol, "category" | "chains" | "name">,
  { playbooks, gas, funding, uncollateralized }: FarmTables,
  depositUsd: number = assumptions.depositsUsd[0],
): FarmPlan {
  if (!Number.isFinite(depositUsd) || depositUsd <= 0) {
    throw new Error("The farm plan needs a positive, finite deposit size.");
  }
  const category = protocol.category?.trim().toLowerCase() ?? "";
  const [group, playbook] = Object.entries(playbooks).find(([, book]) =>
    book.categories.includes(category),
  ) ?? ["generic", playbooks.generic];
  const copy = category.includes("uncollateralized") ? uncollateralized : playbook;
  const bridge = group === "bridge";
  const repeats = occurrences[playbook.cadence];
  const [entryTransactions, reviewTransactions, exitTransactions] = playbook.transactions;
  const gasTransactions =
    (bridge ? 0 : entryTransactions) + reviewTransactions * repeats + exitTransactions;
  const { chain, transactionUsd, bridgeUsd, feeAssumed } = chooseChain(
    protocol.chains,
    gasTransactions,
    bridge ? entryTransactions : 1,
    gas,
  );
  const [entryMinutes, reviewMinutes, exitMinutes] = playbook.minutes;
  const tradingFees =
    group === "derivatives" ? assumptions.tradeVolumeUsd * assumptions.tradingFeeRate : 0;
  const fields: Record<string, string> = {
    deposit: formatUsd(depositUsd),
    protocol: shorten(protocol.name, 140),
    chain: shorten(chain ?? "a verified chain", 110),
    gas: gasTransactions
      ? `about ${formatUsd(gasTransactions * transactionUsd)} for gas`
      : "gas as needed",
  };
  const step = (
    action: string,
    costUsd: number,
    minutes: number,
    cadence: Cadence = "once",
  ): FarmStep => ({
    action: action.replace(
      /\{(deposit|protocol|chain|gas)\}/g,
      (_, key: string) => fields[key] ?? "",
    ),
    chain,
    costUsd,
    minutes,
    cadence,
  });
  const fundingStep: FarmStep | null = bridge
    ? null
    : step(funding.bridge, bridgeUsd, assumptions.bridgeMinutes);
  const steps = [
    step(chain === null ? funding.unlisted : funding.wallet, 0, assumptions.setupMinutes),
  ];
  if (fundingStep) steps.push(fundingStep);
  steps.push(
    step(
      copy.enter,
      roundUsd(entryTransactions * (bridge ? bridgeUsd : transactionUsd)),
      entryMinutes,
    ),
    step(
      copy.review,
      roundUsd(tradingFees + reviewTransactions * transactionUsd),
      reviewMinutes,
      playbook.cadence,
    ),
    {
      ...step(copy.exit, roundUsd(exitTransactions * transactionUsd), exitMinutes),
      exitCondition: copy.exitCondition,
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

export function renderFarmStep(step: FarmStep): string {
  return formatFarmStep(step, formatUsd, shorten);
}
