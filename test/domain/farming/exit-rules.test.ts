import { expect, test } from "vitest";
import { farmExitThresholds } from "../../../src/domain/farming/exit-rules.ts";
import { makeFarmPlan } from "../../../src/domain/farming/plans.ts";
import { farmTables } from "../../../src/domain/farming/playbook-data.ts";
import { protocol } from "../protocol-fixture.ts";

const tables = farmTables();

test("uses the nearest-rank bottom decile and pools groups with fewer than ten observations", () => {
  const entries = Array.from(
    { length: 11 },
    (_, i) =>
      ({
        protocol: protocol({
          slug: `loan-${i}`,
          category: "Lending",
          listed_at: "2026-01-01",
          change_7d: i - 10,
        }),
        status: "pre-token",
      }) as const,
  );
  entries.reverse();
  const dated = protocol({ listed_at: "2026-01-01" });
  const others = [
    {
      protocol: { ...dated, category: "Risk Curators", change_7d: -23.4 },
      status: "pre-token",
    },
    {
      protocol: { ...dated, category: "RWA", change_7d: null },
      status: "pre-token",
    },
    { protocol: { ...dated, listed_at: null, change_7d: -99 }, status: "pre-token" },
    { protocol: { ...dated, change_7d: -98 }, status: "traded" },
  ] as const;
  const thresholds = farmExitThresholds([...entries, ...others], tables.playbooks);
  // The 2nd of 11 sorted lending changes is -9. The 2nd of 12 pooled changes is -10.
  expect(thresholds.get("lending")).toEqual({ change: -9, label: "Lending" });
  expect(thresholds.get("yield")).toEqual({ change: -10, label: "pooled categories" });
  expect(thresholds.get("rwa")).toEqual({ change: -10, label: "pooled categories" });
});

test("prints the snapshot threshold and half of the row's TVL in the exit action", () => {
  const record = protocol({ category: "Lending", tvl_usd: 137_600_000 });
  const plan = makeFarmPlan(record, tables, {
    exitThreshold: { change: -12.4, label: "Lending" },
  });
  expect(plan.steps.at(-1)?.exitCondition).toContain(
    "Exit if 7-day TVL change falls below −12.4% (bottom tenth of Lending in this snapshot) or TVL drops under $68,800,000",
  );
  const empty = makeFarmPlan(record, tables);
  expect(empty.steps.at(-1)?.exitCondition).toContain("TVL drops under $68,800,000");
  expect(empty.steps.at(-1)?.exitCondition).toContain("No listed pre-token 7-day TVL data");
});
