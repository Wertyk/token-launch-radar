import { formatUsd } from "../shared/money.ts";
import { FARM_ASSUMPTIONS as assumptions } from "./assumptions.ts";
import type { FarmPlan } from "./plans.ts";

type Verdict = "FARM" | "THIN" | "SKIP";

interface DepositEconomics {
  depositUsd: number;
  expectedValueUsd: number;
  costUsd: number;
  verdict: Verdict;
}

export interface FarmEconomics {
  launchProbability12: number;
  airdropYieldApr: number;
  deposits: [DepositEconomics, DepositEconomics];
  breakEvenDepositUsd: number | "never";
}

export function estimateFarmEconomics(
  plan: Pick<FarmPlan, "totalCostUsd" | "totalMinutes" | "capitalApr">,
  valueUsd: number,
  tvlUsd: number,
  launchProbability: number,
): FarmEconomics {
  const fixedCosts =
    plan.totalCostUsd +
    (plan.totalMinutes / assumptions.minutesPerHour) * assumptions.hourlyRateUsd;
  const horizonYears = assumptions.horizonMonths / assumptions.monthsPerYear;
  const capitalCarry = plan.capitalApr * horizonYears;
  const k =
    (valueUsd *
      assumptions.airdropShareOfLaunchCap *
      launchProbability *
      assumptions.farmerHaircut) /
    tvlUsd;
  const atDeposit = (depositUsd: number): DepositEconomics => {
    const expectedValueUsd = k * depositUsd;
    const costUsd = fixedCosts + depositUsd * capitalCarry;
    const ratio = expectedValueUsd / costUsd;
    const verdict =
      ratio >= assumptions.farmThreshold
        ? "FARM"
        : ratio >= assumptions.thinThreshold
          ? "THIN"
          : "SKIP";
    return { depositUsd, expectedValueUsd, costUsd, verdict };
  };
  const [small, large] = assumptions.depositsUsd;
  return {
    launchProbability12: launchProbability,
    airdropYieldApr: k / horizonYears,
    deposits: [atDeposit(small), atDeposit(large)],
    breakEvenDepositUsd: k > capitalCarry ? fixedCosts / (k - capitalCarry) : "never",
  };
}

export function renderEconomics({
  deposits: [atDeposit],
  breakEvenDepositUsd,
}: FarmEconomics): string {
  const { depositUsd, expectedValueUsd, costUsd, verdict } = atDeposit;
  const breakEven =
    breakEvenDepositUsd === "never" ? "never" : `≈ ${formatUsd(breakEvenDepositUsd)}`;
  return `Economics at ${formatUsd(depositUsd)} over ${assumptions.horizonMonths} months · expected airdrop ≈ ${formatUsd(expectedValueUsd)} vs cost ≈ ${formatUsd(costUsd)} → ${verdict}. Break-even deposit ${breakEven}. Assumes ${assumptions.airdropShareOfLaunchCap * 100}% of circulating launch cap because a mostly unlocked airdrop can account for much of a small launch float.`;
}
