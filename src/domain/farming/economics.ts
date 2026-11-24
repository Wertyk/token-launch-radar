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

export interface EconomicsAssumptions {
  horizonMonths: number;
  monthsPerYear: number;
  minutesPerHour: number;
  hourlyRateUsd: number;
  airdropShareOfLaunchCap: number;
  farmerHaircut: number;
  capitalApr?: { yieldBearing: number; nonYielding: number };
}

export function farmEconomicsTerms(
  plan: Pick<FarmPlan, "totalCostUsd" | "totalMinutes" | "capitalApr">,
  valueUsd: number,
  tvlUsd: number,
  launchProbability: number,
  settings: EconomicsAssumptions = assumptions,
) {
  const fixedCosts =
    plan.totalCostUsd + (plan.totalMinutes / settings.minutesPerHour) * settings.hourlyRateUsd;
  const horizonYears = settings.horizonMonths / settings.monthsPerYear;
  const { yieldBearing, nonYielding } = settings.capitalApr ?? assumptions.capitalApr;
  // Playbooks carry the baseline rate. Preserve custom playbook rates.
  let capitalApr = plan.capitalApr;
  if (capitalApr === assumptions.capitalApr.yieldBearing) capitalApr = yieldBearing;
  else if (capitalApr === assumptions.capitalApr.nonYielding) capitalApr = nonYielding;
  const capitalCarry = capitalApr * horizonYears;
  const k =
    (valueUsd * settings.airdropShareOfLaunchCap * launchProbability * settings.farmerHaircut) /
    tvlUsd;
  return { fixedCosts, horizonYears, capitalCarry, k };
}

export function estimateFarmEconomics(
  plan: Pick<FarmPlan, "totalCostUsd" | "totalMinutes" | "capitalApr">,
  valueUsd: number,
  tvlUsd: number,
  launchProbability: number,
  settings: EconomicsAssumptions = assumptions,
): FarmEconomics {
  const { fixedCosts, horizonYears, capitalCarry, k } = farmEconomicsTerms(
    plan,
    valueUsd,
    tvlUsd,
    launchProbability,
    settings,
  );
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
  deposits: [{ depositUsd, expectedValueUsd, costUsd, verdict }],
  breakEvenDepositUsd,
}: FarmEconomics): string {
  const breakEven =
    breakEvenDepositUsd === "never" ? "never" : `≈ ${formatUsd(breakEvenDepositUsd)}`;
  return `Economics at ${formatUsd(depositUsd)} over ${assumptions.horizonMonths} months · expected airdrop ≈ ${formatUsd(expectedValueUsd)} vs cost ≈ ${formatUsd(costUsd)} → ${verdict}. Break-even deposit ${breakEven}. Assumes ${assumptions.airdropShareOfLaunchCap * 100}% of circulating launch cap because a mostly unlocked airdrop can account for much of a small launch float.`;
}
