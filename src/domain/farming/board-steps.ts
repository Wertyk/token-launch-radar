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
  deposits: readonly {
    depositUsd: number;
    netUsd: number;
    netPerHourUsd: number;
    verdict: string;
  }[];
  breakEvenDepositUsd: number | "never";
}

function shorten(text: string, max: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

export function formatFarmStep(
  { action, chain, costUsd, minutes, cadence, exitCondition }: StepCopy,
  usd: typeof formatUsd,
): string {
  const exit = exitCondition ? ` | ${shorten(exitCondition, 245)}` : "";
  return `${shorten(action, 190)} | ${shorten(chain ?? "Chain unlisted", 100)} | Est. fee ${usd(costUsd)} | ${minutes} minutes | ${cadence}${exit}`;
}

export function formatEconomics(
  { deposits, breakEvenDepositUsd }: EconomicsCopy,
  holdWeeks: number,
  usd: typeof formatUsd,
  { airdropShareOfLaunchCap }: typeof FARM_ASSUMPTIONS,
): string {
  const net = deposits.map(
    ({ depositUsd, netUsd, netPerHourUsd, verdict }) =>
      `${usd(depositUsd)}: ${usd(netUsd)} net, ${usd(netPerHourUsd)}/h ${verdict}`,
  );
  const breakEven = breakEvenDepositUsd === "never" ? "never" : `≈ ${usd(breakEvenDepositUsd)}`;
  return `Economics for an expected ${holdWeeks.toFixed(1)}-week hold · ${net.join(" · ")}. Break-even deposit ${breakEven} (net reaches $0 after cash fees and capital carry). Assumes ${airdropShareOfLaunchCap * 100}% of circulating launch cap for the drop pool. Hold until launch or one year, whichever comes first.`;
}

export function boardFarmSteps(
  {
    plan,
    economics,
  }: { plan: { steps: readonly StepCopy[]; holdWeeks: number }; economics: EconomicsCopy },
  {
    formatUsd: usd,
    farmAssumptions,
  }: { formatUsd: typeof formatUsd; farmAssumptions: typeof FARM_ASSUMPTIONS },
): string[] {
  return [
    ...plan.steps.map((step) => formatFarmStep(step, usd)),
    formatEconomics(economics, plan.holdWeeks, usd, farmAssumptions),
  ];
}
