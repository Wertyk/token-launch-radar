import type { buildCensus } from "../census/census.ts";
import { compareText } from "../shared/order.ts";
import type { FarmTables } from "./playbook-data.ts";

const MIN_GROUP_CHANGES = 10;

export interface ExitThreshold {
  change: number;
  label: string;
}

export function farmGroup(category: string | null, playbooks: FarmTables["playbooks"]) {
  const label = category?.trim().toLowerCase() ?? "";
  return (
    Object.keys(playbooks).find((group) => playbooks[group]?.categories.includes(label)) ??
    "generic"
  );
}

export function farmExitThresholds(
  census: readonly Pick<ReturnType<typeof buildCensus>[number], "protocol" | "status">[],
  playbooks: FarmTables["playbooks"],
) {
  const changes = census
    .flatMap(({ protocol, status }) => {
      const { listed_at, change_7d, slug, category } = protocol;
      return status === "pre-token" && listed_at !== null && change_7d !== null
        ? [{ change: change_7d, slug, group: farmGroup(category, playbooks) }]
        : [];
    })
    .sort((a, b) => a.change - b.change || compareText(a.slug, b.slug));
  const decile = (group: typeof changes) => group[Math.ceil(group.length / 10) - 1]?.change;
  const pooled = decile(changes);
  const fallback = pooled === undefined ? null : { change: pooled, label: "pooled categories" };
  return new Map(
    Object.entries(playbooks).map(([group, { label }]) => {
      const sample = changes.filter((row) => row.group === group);
      const change = sample.length < MIN_GROUP_CHANGES ? undefined : decile(sample);
      return [group, change === undefined ? fallback : { change, label }];
    }),
  );
}
