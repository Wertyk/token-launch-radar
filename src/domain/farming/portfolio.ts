import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";
import { FARM_ASSUMPTIONS } from "./assumptions.ts";
import type { EconomicsAssumptions } from "./economics.ts";
import { depositAmounts, farmEconomicsTerms } from "./economics.ts";
import type { FarmPlan } from "./plans.ts";
import { makeFarmPlan } from "./plans.ts";
import type { FarmTables } from "./playbook-data.ts";

const deposits = [1_000, 2_500, 5_000, 10_000];

interface PortfolioRow {
  protocol: Pick<Protocol, "slug" | "name" | "category" | "chains" | "tvl_usd">;
  rank: number;
  launch_value_usd: number;
  plan: FarmPlan;
  economics: { launchProbability12: number };
}

interface PortfolioOptions {
  budgetUsd: number;
  hoursPerWeek: number;
  chains?: readonly string[];
  assumptions: EconomicsAssumptions & { tables: FarmTables };
}

type Rejection = "over-budget" | "over-hours" | "chain-excluded" | "non-positive";

interface Position {
  slug: string;
  chain: string | null;
  depositUsd: number;
  feesUsd: number;
  hoursPerWeek: number;
  expectedValueUsd: number;
  costUsd: number;
  netUsd: number;
}

export function scheduleFarmMinutes(
  { steps, reviewCounts, holdWeeks }: FarmPlan,
  settings: Pick<typeof FARM_ASSUMPTIONS, "weeksPerYear" | "monthsPerYear">,
): number[] {
  const weeks = Array<number>(Math.max(1, Math.ceil(holdWeeks))).fill(0);
  const weeksPerMonth = settings.weeksPerYear / settings.monthsPerYear;
  for (const { cadence, minutes, exitCondition } of steps) {
    if (cadence === "once") {
      const week = exitCondition ? weeks.length - 1 : 0;
      weeks[week] = (weeks[week] ?? 0) + minutes;
      continue;
    }
    const period = cadence === "weekly" ? 1 : weeksPerMonth;
    // Reviews land at the end of each full period.
    for (let occurrence = 1; occurrence <= reviewCounts[cadence]; occurrence++) {
      const week = Math.ceil(occurrence * period) - 1;
      weeks[week] = (weeks[week] ?? 0) + minutes;
    }
  }
  return weeks;
}

export function planPortfolio(rows: readonly PortfolioRow[], options: PortfolioOptions) {
  return optimizePortfolio(rows, options, {
    compareText,
    depositAmounts,
    farmEconomicsTerms,
    makeFarmPlan,
    farmAssumptions: FARM_ASSUMPTIONS,
  });
}

export function optimizePortfolio(
  rows: readonly PortfolioRow[],
  { budgetUsd, hoursPerWeek, chains, assumptions }: PortfolioOptions,
  api: {
    compareText: typeof compareText;
    depositAmounts: typeof depositAmounts;
    farmEconomicsTerms: typeof farmEconomicsTerms;
    makeFarmPlan: typeof makeFarmPlan;
    farmAssumptions: typeof FARM_ASSUMPTIONS;
  },
) {
  const { compareText, depositAmounts, farmEconomicsTerms, makeFarmPlan, farmAssumptions } = api;
  if (assumptions.horizonMonths !== farmAssumptions.horizonMonths) {
    throw new Error("The farm planner only supports a 12-month horizon.");
  }
  const permitted = chains && new Set(chains);
  const usedMinutesByWeek = Array<number>(farmAssumptions.weeksPerYear).fill(0);
  const weeklyCapMinutes = hoursPerWeek * assumptions.minutesPerHour;
  const minutesPerAverageWeeklyHour = usedMinutesByWeek.length * assumptions.minutesPerHour;
  const candidates = rows.map(({ protocol, rank, plan, economics, launch_value_usd }) => {
    const supported = [...new Set(protocol.chains)].sort(compareText);
    const choices = supported.length ? supported : [null];
    const plans = choices.flatMap((chain) => {
      if (permitted && (chain === null || !permitted.has(chain))) return [];
      const option =
        chain === plan.chain || chain === null
          ? plan
          : makeFarmPlan({ ...protocol, chains: [chain] }, assumptions.tables, {
              depositUsd: plan.depositUsd,
              launchProbability12: economics.launchProbability12,
              exitThreshold: plan.exitThreshold,
            });
      return [{ option, schedule: scheduleFarmMinutes(option, farmAssumptions) }];
    });
    return {
      slug: protocol.slug,
      rank,
      plans,
      valueUsd: launch_value_usd,
      tvlUsd: protocol.tvl_usd,
      probability: economics.launchProbability12,
    };
  });

  const funded = new Set<string>();
  const selected = new Set<string>();
  const positions: Position[] = [];
  let feesCents = 0;
  const totals = {
    depositUsd: 0,
    feesUsd: 0,
    cashUsd: 0,
    hoursPerWeek: 0,
    expectedValueUsd: 0,
    costUsd: 0,
    netUsd: 0,
  };

  function offers({ slug, plans, valueUsd, tvlUsd, probability }: (typeof candidates)[number]) {
    return plans.flatMap(({ option, schedule }) => {
      const { chain, fundingStep } = option;
      const waived = chain !== null && funded.has(chain) ? fundingStep : null;
      const feeCents = Math.round((option.totalCostUsd - (waived?.costUsd ?? 0)) * 100);
      const totalMinutes = option.totalMinutes - (waived?.minutes ?? 0);
      const weeklyMinutes = waived
        ? schedule.map((minutes, week) => (week === 0 ? minutes - waived.minutes : minutes))
        : schedule;
      const withinHours = weeklyMinutes.every(
        (minutes, week) => (usedMinutesByWeek[week] ?? 0) + minutes <= weeklyCapMinutes,
      );
      const terms = farmEconomicsTerms(
        { totalCostUsd: feeCents / 100, totalMinutes, capitalApr: option.capitalApr },
        valueUsd,
        tvlUsd,
        probability,
        assumptions,
      );
      return deposits.map((depositUsd) => {
        const { expectedValueUsd, costUsd, netUsd } = depositAmounts(terms, depositUsd);
        const position: Position = {
          slug,
          chain,
          depositUsd,
          feesUsd: feeCents / 100,
          hoursPerWeek: totalMinutes / minutesPerAverageWeeklyHour,
          expectedValueUsd,
          costUsd,
          netUsd,
        };
        return {
          position,
          feeCents,
          weeklyMinutes,
          fundsChain: fundingStep !== null,
          score: netUsd / (depositUsd + position.feesUsd),
          affordable: totals.depositUsd + depositUsd + (feesCents + feeCents) / 100 <= budgetUsd,
          withinHours,
        };
      });
    });
  }

  for (;;) {
    let best: ReturnType<typeof offers>[number] | undefined;
    for (const candidate of candidates) {
      if (selected.has(candidate.slug)) continue;
      for (const offer of offers(candidate)) {
        if (!(offer.position.netUsd > 0 && offer.affordable && offer.withinHours)) continue;
        if (
          !best ||
          offer.score > best.score ||
          (offer.score === best.score && compareText(candidate.slug, best.position.slug) < 0)
        ) {
          best = offer;
        }
      }
    }
    if (!best) break;
    const { position } = best;
    positions.push(position);
    selected.add(position.slug);
    if (position.chain !== null && best.fundsChain) funded.add(position.chain);
    feesCents += best.feeCents;
    for (const [week, minutes] of best.weeklyMinutes.entries()) {
      usedMinutesByWeek[week] = (usedMinutesByWeek[week] ?? 0) + minutes;
    }
    totals.depositUsd += position.depositUsd;
    totals.expectedValueUsd += position.expectedValueUsd;
    totals.costUsd += position.costUsd;
    totals.netUsd += position.netUsd;
  }

  totals.feesUsd = feesCents / 100;
  totals.cashUsd = totals.depositUsd + totals.feesUsd;
  totals.hoursPerWeek =
    usedMinutesByWeek.reduce((sum, minutes) => sum + minutes, 0) / minutesPerAverageWeeklyHour;

  const remaining = candidates.filter(({ slug }) => !selected.has(slug));
  const rejected = remaining
    .sort((a, b) => a.rank - b.rank || compareText(a.slug, b.slug))
    .slice(0, 15)
    .map((candidate) => {
      const options = offers(candidate);
      const positive = options.filter(({ position }) => position.netUsd > 0);
      const feasible = positive.length ? positive : options;
      const affordable = feasible.filter((offer) => offer.affordable);
      let reason: Rejection = "non-positive";
      if (!options.length) reason = "chain-excluded";
      else if (!affordable.length) reason = "over-budget";
      else if (!affordable.some((offer) => offer.withinHours)) reason = "over-hours";
      return { slug: candidate.slug, reason };
    });

  const closest = positions.length
    ? []
    : remaining
        .flatMap((candidate) => {
          let best: Position | undefined;
          for (const { position, affordable, withinHours } of offers(candidate)) {
            if (affordable && withinHours && (!best || position.netUsd > best.netUsd)) {
              best = position;
            }
          }
          return best ? [{ ...best, shortfallUsd: Math.max(0, -best.netUsd) }] : [];
        })
        .sort((a, b) => a.shortfallUsd - b.shortfallUsd || compareText(a.slug, b.slug))
        .slice(0, 5);

  return { positions, totals, rejected, closest };
}
