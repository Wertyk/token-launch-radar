import { formatUsd } from "../shared/money.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import { FARM_ASSUMPTIONS as assumptions } from "./assumptions.ts";
import { formatFarmStep } from "./board-steps.ts";
import { type ExitThreshold, farmGroup } from "./exit-rules.ts";
import { expectedHoldYears } from "./hold.ts";
import type { FarmTables } from "./playbook-data.ts";

type Cadence = "once" | "weekly" | "monthly" | "at launch";

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

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function farmCapitalApr(group: string): number {
  const yieldBearing = ["lending", "dex", "yield", "allocator", "staking", "rwa"].includes(group);
  return assumptions.capitalApr[yieldBearing ? "yieldBearing" : "nonYielding"];
}

function formatEntryShare(depositUsd: number, tvlUsd: number): string {
  const percent = (100 * depositUsd) / tvlUsd;
  const rounded = percent.toPrecision(2);
  const [, exponent] = rounded.split("e");
  const decimals = Math.max(0, 1 - Number(exponent));
  const display = exponent && decimals <= 20 ? Number(rounded).toFixed(decimals) : rounded;
  const share = `${display}% of snapshot TVL`;
  if (percent >= 0.001) return share;

  const ratio = Number((tvlUsd / depositUsd).toPrecision(2));
  const scale = Math.min(4, Math.floor(Math.log10(ratio) / 3));
  return `${share} (about 1 in ${ratio / 1000 ** scale}${" KMBT"[scale]} of TVL)`;
}

export function makeFarmPlan(
  protocol: Pick<Protocol, "category" | "chains" | "tvl_usd">,
  { playbooks, gas, funding, uncollateralized, checklist }: FarmTables,
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
  const group = farmGroup(protocol.category);
  const playbook = playbooks[group] ?? playbooks.generic;
  const copy = protocol.category?.toLowerCase().includes("uncollateralized")
    ? uncollateralized
    : playbook;
  const bridge = group === "bridge";
  const holdYears = expectedHoldYears(launchProbability12);
  const holdWeeks = holdYears * assumptions.weeksPerYear;
  const reviewCounts = {
    once: 1,
    "at launch": 1,
    weekly: Math.floor(holdWeeks),
    monthly: Math.floor(assumptions.monthsPerYear * holdYears),
  };
  const repeats = reviewCounts[playbook.cadence];
  const [entry, review, exit] = playbook.transactions;
  const gasTransactions = (bridge ? 0 : entry) + review * repeats + exit;
  const tradingFees =
    group === "derivatives" ? assumptions.tradeVolumeUsd * assumptions.tradingFeeRate : 0;
  const quote = (chain: string | null) => {
    const fees = chain !== null && Object.hasOwn(gas.chains, chain) ? gas.chains[chain] : undefined;
    const [transactionUsd, bridgeUsd] = fees ?? gas.fallback;
    const entryCost = roundUsd(entry * (bridge ? bridgeUsd : transactionUsd));
    const reviewCost = roundUsd(tradingFees + review * transactionUsd);
    const exitCost = roundUsd(exit * transactionUsd);
    const claimCost = roundUsd(transactionUsd);
    // Round the same step costs, then weight claim gas by the chance of launch.
    const fixedCost = (bridge ? 0 : roundUsd(bridgeUsd)) + entryCost + exitCost;
    const oneTimeCostUsd = roundUsd(fixedCost + claimCost * launchProbability12);
    const recurringCostUsd = roundUsd(reviewCost * repeats);
    const totalCostUsd = roundUsd(oneTimeCostUsd + recurringCostUsd);
    return {
      chain,
      transactionUsd,
      bridgeUsd,
      entryCost,
      reviewCost,
      exitCost,
      claimCost,
      oneTimeCostUsd,
      recurringCostUsd,
      totalCostUsd,
      feeAssumed: fees === undefined,
    };
  };
  const {
    chain,
    transactionUsd,
    bridgeUsd,
    entryCost,
    reviewCost,
    exitCost,
    claimCost,
    oneTimeCostUsd,
    recurringCostUsd,
    totalCostUsd,
    feeAssumed,
  } =
    protocol.chains
      .map(quote)
      .sort(
        (a, b) => a.totalCostUsd - b.totalCostUsd || compareText(a.chain ?? "", b.chain ?? ""),
      )[0] ?? quote(null);
  const fields: Record<string, string> = {
    deposit: formatUsd(depositUsd),
    chain: chain ?? "a verified chain",
    gas: `about ${formatUsd((gasTransactions + 1) * transactionUsd)} for gas`,
    share: formatEntryShare(depositUsd, protocol.tvl_usd),
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
  const [eligibilityMinutes, sizeMinutes, claimMinutes, recordMinutes] = checklist.minutes;
  const fundingStep = bridge ? null : step(funding.bridge, bridgeUsd, assumptions.bridgeMinutes);
  const recurring = step(copy.review, reviewCost, reviewMinutes, playbook.cadence);
  const floor = `TVL drops under ${formatUsd(protocol.tvl_usd / 2)}`;
  const drawdown = exitThreshold?.change.toFixed(1).replace("-", "−");
  const trigger = exitThreshold
    ? `Exit if 7-day TVL change falls below ${drawdown}% (bottom tenth of ${exitThreshold.label} in this snapshot) or ${floor}.`
    : `Exit if ${floor}. No listed pre-token 7-day TVL data.`;
  const steps = [
    step(
      chain === null ? funding.unlisted : funding.wallet,
      0,
      assumptions.setupMinutes - eligibilityMinutes,
    ),
    step(checklist.eligibility, 0, eligibilityMinutes),
    step(
      playbook.sizing?.action ?? checklist.size,
      0,
      sizeMinutes + (playbook.sizing?.extraMinutes ?? 0),
    ),
    ...(fundingStep ? [fundingStep] : []),
    step(copy.enter, entryCost, entryMinutes - sizeMinutes - recordMinutes),
    recurring,
    step(checklist.records, 0, recordMinutes),
    step(checklist.claim, claimCost, claimMinutes, "at launch"),
    {
      ...step(copy.exit, exitCost, exitMinutes - claimMinutes),
      exitCondition: `${trigger} ${copy.exitCondition}`,
    },
  ];
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
    capitalApr: farmCapitalApr(group),
    oneTimeCostUsd,
    recurringCostUsd,
    totalCostUsd,
    totalMinutes: steps.reduce((sum, item) => sum + item.minutes * reviewCounts[item.cadence], 0),
  };
}

export function renderFarmStep(step: FarmStep): string {
  return formatFarmStep(step, formatUsd);
}
