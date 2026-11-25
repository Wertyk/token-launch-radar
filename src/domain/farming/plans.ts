import { formatUsd } from "../shared/money.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import { FARM_ASSUMPTIONS as assumptions } from "./assumptions.ts";
import { formatFarmStep } from "./board-steps.ts";
import { type ExitThreshold, farmGroup } from "./exit-rules.ts";
import { expectedHoldYears } from "./hold.ts";
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
  holdWeeks: number;
  reviewCounts: Record<Cadence, number>;
  exitThreshold: ExitThreshold | null;
  capitalApr: number;
  oneTimeCostUsd: number;
  recurringCostUsd: number;
  totalCostUsd: number;
  totalMinutes: number;
}

function chooseChain(
  chains: readonly string[],
  transactions: number,
  transfers: number,
  gas: FarmTables["gas"],
) {
  const quote = (chain: string | null) => {
    const fees = chain !== null && Object.hasOwn(gas.chains, chain) ? gas.chains[chain] : undefined;
    const [transactionUsd, bridgeUsd] = fees ?? gas.fallback;
    const cost = roundUsd(transfers * bridgeUsd + transactions * transactionUsd);
    return { chain, transactionUsd, bridgeUsd, cost, feeAssumed: fees === undefined };
  };
  return (
    chains
      .map(quote)
      .sort((a, b) => a.cost - b.cost || compareText(a.chain ?? "", b.chain ?? ""))[0] ??
    quote(null)
  );
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function makeFarmPlan(
  protocol: Pick<Protocol, "category" | "chains" | "tvl_usd">,
  { playbooks, gas, funding, uncollateralized }: FarmTables,
  {
    depositUsd = assumptions.depositsUsd[0],
    launchProbability12 = 0,
    exitThreshold = null,
  }: {
    depositUsd?: number;
    launchProbability12?: number;
    exitThreshold?: ExitThreshold | null;
  } = {},
): FarmPlan {
  if (!Number.isFinite(depositUsd) || depositUsd <= 0) {
    throw new Error("The farm plan needs a positive, finite deposit size.");
  }
  const group = farmGroup(protocol.category, playbooks);
  const playbook = playbooks[group] ?? playbooks.generic;
  const copy = protocol.category?.toLowerCase().includes("uncollateralized")
    ? uncollateralized
    : playbook;
  const bridge = group === "bridge";
  const holdYears = expectedHoldYears(launchProbability12);
  const holdWeeks = holdYears * assumptions.weeksPerYear;
  const reviewCounts = {
    once: 1,
    weekly: Math.floor(holdWeeks),
    monthly: Math.floor(assumptions.monthsPerYear * holdYears),
  };
  const repeats = reviewCounts[playbook.cadence];
  const [entry, review, exit] = playbook.transactions;
  const gasTransactions = (bridge ? 0 : entry) + review * repeats + exit;
  const { chain, transactionUsd, bridgeUsd, feeAssumed } = chooseChain(
    protocol.chains,
    gasTransactions,
    bridge ? entry : 1,
    gas,
  );
  const fields: Record<string, string> = {
    deposit: formatUsd(depositUsd),
    chain: chain ?? "a verified chain",
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
    action: action.replace(/\{(\w+)\}/g, (_, key: string) => fields[key] ?? ""),
    chain,
    costUsd: roundUsd(costUsd),
    minutes,
    cadence,
  });
  const [entryMinutes, reviewMinutes, exitMinutes] = playbook.minutes;
  const tradingFees =
    group === "derivatives" ? assumptions.tradeVolumeUsd * assumptions.tradingFeeRate : 0;
  const fundingStep = bridge ? null : step(funding.bridge, bridgeUsd, assumptions.bridgeMinutes);
  const recurring = step(
    copy.review,
    tradingFees + review * transactionUsd,
    reviewMinutes,
    playbook.cadence,
  );
  const floor = `TVL drops under ${formatUsd(protocol.tvl_usd / 2)}`;
  const drawdown = exitThreshold?.change.toFixed(1).replace("-", "−");
  const trigger = exitThreshold
    ? `Exit if 7-day TVL change falls below ${drawdown}% (bottom tenth of ${exitThreshold.label} in this snapshot) or ${floor}.`
    : `Exit if ${floor}. No listed pre-token 7-day TVL data.`;
  const steps = [
    step(chain === null ? funding.unlisted : funding.wallet, 0, assumptions.setupMinutes),
    ...(fundingStep ? [fundingStep] : []),
    step(copy.enter, entry * (bridge ? bridgeUsd : transactionUsd), entryMinutes),
    recurring,
    {
      ...step(copy.exit, exit * transactionUsd, exitMinutes),
      exitCondition: `${trigger} ${copy.exitCondition}`,
    },
  ];
  const oneTimeCostUsd = roundUsd(
    steps.reduce((sum, item) => sum + item.costUsd, 0) - recurring.costUsd,
  );
  const recurringCostUsd = roundUsd(recurring.costUsd * repeats);
  return {
    chain,
    depositUsd,
    steps,
    fundingStep,
    exitThreshold,
    reviewCounts,
    holdWeeks,
    flags: feeAssumed ? ["fee-assumed"] : [],
    assumptionsAsOf: assumptions.asOf,
    capitalApr: playbook.capitalApr,
    oneTimeCostUsd,
    recurringCostUsd,
    totalCostUsd: roundUsd(oneTimeCostUsd + recurringCostUsd),
    totalMinutes: steps.reduce((sum, item) => sum + item.minutes * reviewCounts[item.cadence], 0),
  };
}

export function renderFarmStep(step: FarmStep): string {
  return formatFarmStep(step, formatUsd);
}
