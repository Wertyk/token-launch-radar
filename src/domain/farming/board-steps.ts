import type { formatUsd } from "../shared/money.ts";
import type { FARM_ASSUMPTIONS } from "./assumptions.ts";

interface StepCopy {
  action: string;
  chain: string | null;
  costUsd: number;
  minutes: number;
  cadence: string;
  exitCondition?: string;
}

interface EconomicsCopy {
  deposits: readonly [
    { depositUsd: number; netUsd: number; netPerHourUsd: number; verdict: string },
    ...unknown[],
  ];
  breakEvenDepositUsd: number | "never";
}

type Shorten = (text: string, max: number) => string;

export function formatFarmStep(
  { action, chain, costUsd, minutes, cadence, exitCondition }: StepCopy,
  usd: typeof formatUsd,
  shortenText: Shorten,
): string {
  const exit = exitCondition ? ` | Exit · ${shortenText(exitCondition, 100)}` : "";
  return `${shortenText(action, 280)} | ${shortenText(chain ?? "Chain unlisted", 110)} | Est. fee ${usd(costUsd)} | ${minutes} minutes | ${cadence}${exit}`;
}

export function formatEconomics(
  {
    deposits: [{ depositUsd, netUsd, netPerHourUsd, verdict }],
    breakEvenDepositUsd,
  }: EconomicsCopy,
  usd: typeof formatUsd,
  { horizonMonths, airdropShareOfLaunchCap }: typeof FARM_ASSUMPTIONS,
): string {
  const breakEven = breakEvenDepositUsd === "never" ? "never" : `≈ ${usd(breakEvenDepositUsd)}`;
  return `Economics at ${usd(depositUsd)} over ${horizonMonths} months · ${usd(netUsd)} net · ${usd(netPerHourUsd)}/h → ${verdict}. Break-even deposit ${breakEven} (where net reaches $0 after cash fees and capital carry). Assumes ${airdropShareOfLaunchCap * 100}% of circulating launch cap because a mostly unlocked airdrop can account for much of a small launch float.`;
}

export function boardFarmSteps(
  { plan, economics }: { plan: { steps: readonly StepCopy[] }; economics: EconomicsCopy },
  deps: {
    formatUsd: typeof formatUsd;
    shorten: Shorten;
    farmAssumptions: typeof FARM_ASSUMPTIONS;
  },
): string[] {
  return [
    ...plan.steps.map((step) => formatFarmStep(step, deps.formatUsd, deps.shorten)),
    formatEconomics(economics, deps.formatUsd, deps.farmAssumptions),
  ];
}
