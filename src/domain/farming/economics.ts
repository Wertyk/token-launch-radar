import { formatUsd } from "../shared/money.ts";
import { FARM_ASSUMPTIONS as assumptions } from "./assumptions.ts";
import { formatEconomics } from "./board-steps.ts";
import type { FarmPlan } from "./plans.ts";

type Verdict = "FARM" | "THIN" | "SKIP";

interface DepositEconomics {
  depositUsd: number;
  expectedValueUsd: number;
  costUsd: number;
  netUsd: number;
  netPerHourUsd: number;
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
  const hours = plan.totalMinutes / settings.minutesPerHour;
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
  return { cashFees: plan.totalCostUsd, hours, horizonYears, capitalCarry, k };
}

export function estimateFarmEconomics(
  plan: Pick<FarmPlan, "totalCostUsd" | "totalMinutes" | "capitalApr">,
  valueUsd: number,
  tvlUsd: number,
  launchProbability: number,
  settings: EconomicsAssumptions = assumptions,
): FarmEconomics {
  const terms = farmEconomicsTerms(plan, valueUsd, tvlUsd, launchProbability, settings);
  const { cashFees, horizonYears, capitalCarry, k } = terms;
  const atDeposit = (depositUsd: number): DepositEconomics => {
    const amounts = depositAmounts(terms, depositUsd);
    const { netUsd, netPerHourUsd } = amounts;
    const verdict =
      netUsd <= 0 ? "SKIP" : netPerHourUsd >= settings.hourlyRateUsd ? "FARM" : "THIN";
    return { depositUsd, ...amounts, verdict };
  };
  const [small, large] = assumptions.depositsUsd;
  return {
    launchProbability12: launchProbability,
    airdropYieldApr: k / horizonYears,
    deposits: [atDeposit(small), atDeposit(large)],
    breakEvenDepositUsd: k > capitalCarry ? cashFees / (k - capitalCarry) : "never",
  };
}

export function depositAmounts(
  { cashFees, capitalCarry, hours, k }: ReturnType<typeof farmEconomicsTerms>,
  depositUsd: number,
) {
  const expectedValueUsd = k * depositUsd;
  const carryUsd = capitalCarry * depositUsd;
  const costUsd = cashFees + carryUsd;
  const netUsd = expectedValueUsd - cashFees - carryUsd;
  const netPerHourUsd = netUsd === 0 ? 0 : netUsd / hours;
  return { expectedValueUsd, costUsd, netUsd, netPerHourUsd };
}

export function renderEconomics(economics: FarmEconomics): string {
  return formatEconomics(economics, formatUsd, assumptions);
}
