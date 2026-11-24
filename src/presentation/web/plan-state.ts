export const sliderLimits = { share: 100, haircut: 100, rate: 250, yield: 50, carry: 50 };
export type Sliders = Partial<Record<keyof typeof sliderLimits, number>>;

export interface PlanState {
  budgetUsd: number;
  hoursPerWeek: number;
  chains: string[];
  sliders: Sliders;
}

function limit(value: string | null, fallback: number): number {
  const number = Number(value);
  return value?.trim() && Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function parsePlanState(hash: string): PlanState {
  const query = hash.split(/\?(.*)/s, 2)[1];
  const params = new URLSearchParams(query);
  // Split the raw list so an encoded comma can be part of a chain name.
  const list = /(?:^|&)chains=([^&]*)/.exec(query ?? "")?.[1] ?? "";
  const chains = list.split(",").map((part) => new URLSearchParams(`c=${part}`).get("c") ?? "");
  const sliders: Sliders = {};
  for (const key of Object.keys(sliderLimits) as (keyof Sliders)[]) {
    const value = limit(params.get(key), -1);
    if (value >= 0 && value <= sliderLimits[key]) sliders[key] = value;
  }
  return {
    budgetUsd: limit(params.get("budget"), 5_000),
    hoursPerWeek: limit(params.get("hours"), 3),
    chains: [...new Set(chains.filter(Boolean))],
    sliders,
  };
}

export function planHash({ budgetUsd, hoursPerWeek, chains, sliders }: PlanState): string {
  const list = chains.map(encodeURIComponent).join(",");
  const params = new URLSearchParams({ budget: String(budgetUsd), hours: String(hoursPerWeek) });
  for (const key of Object.keys(sliderLimits) as (keyof Sliders)[]) {
    if (sliders[key] !== undefined) params.set(key, String(sliders[key]));
  }
  return `#/plan?${params}${list ? `&chains=${list}` : ""}`;
}
