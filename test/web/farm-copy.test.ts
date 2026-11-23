import { expect, test } from "vitest";
import { clockShareAt, farmAssumptions, formatUsd } from "../../src/application/browser-api.ts";
import { buildRadar, recomputeRadar } from "../../src/application/build-radar.ts";
import { farmTables } from "../../src/domain/farming/playbook-data.ts";
import type { BoardRow } from "../../src/presentation/web/board.ts";
import { boardRows, boardView } from "../../src/presentation/web/board-view.ts";
import { methodView } from "../../src/presentation/web/method-view.ts";
import { protocolView } from "../../src/presentation/web/protocol-view.ts";
import { defaultState } from "../../src/presentation/web/state.ts";
import { protocol } from "../domain/protocol-fixture.ts";

test("labels the board fee column with its horizon", () => {
  expect(boardView([])).toContain('data-sort="cost">12-mo fees');
});

test("renders the labor rate and farmer haircut beside the protocol verdicts", () => {
  const tracked = protocol({
    slug: "tracked",
    name: "Traded & Co",
    mcap_usd: 8_000_000,
    gecko_id: "tracked",
  });
  const { board } = recomputeRadar(
    {
      protocols: [tracked, protocol()],
      as_of: "2026-11-14",
      floor_usd: 0,
      source: "Test snapshot",
      watchlist: [],
    },
    1,
    { points: [], medianAgeDays: null },
    farmTables(),
  );
  const [row] = board;
  if (!row) throw new Error("Expected a ranked protocol.");
  const card = {
    age: null,
    back: "#/",
    usd: formatUsd,
    farm: farmAssumptions,
    diagnostics: {
      interval_p10_usd: 100,
      interval_p90_usd: 1000,
      influence: { slug: "tracked", family_key: "gecko:tracked", rank_delta: -2 },
      twins: ["tracked"],
      launch_p12: 0.25,
    },
    families: new Map([["tracked", { representative: tracked, mcap_usd: 8_000_000 }]]),
    launchClock: { points: [{ ageDays: 100, share: 0.4, count: 2 }], medianAgeDays: 80 },
    clockShareAt,
  };
  const html = protocolView(row, card);
  expect(html).toMatch(/\$10,000 SKIP<\/span><\/div>\s*<p[^>]*>\$25\/h[^<]*50%[^<]*haircut/);
  expect(html).toContain("P10–P90");
  expect(html).toContain("$100–$1,000");
  expect(html).toContain("Without Traded &amp; Co, rank moves by 2");
  expect(html).not.toContain("gecko:tracked");
  expect(html).toContain("$8,000,000");
  expect(html).toContain("25.0%");
  expect(html).toContain("80 days");
  expect(html).not.toContain("xmlns");

  const noMovement = protocolView(row, {
    ...card,
    diagnostics: {
      ...card.diagnostics,
      influence: { ...card.diagnostics.influence, rank_delta: 0 },
    },
  });
  expect(noMovement).toContain("No single comparable moves this rank");
  expect(noMovement).not.toContain("Without Traded &amp; Co");
});

test("draws a separate P10–P90 band below the board value", () => {
  const row: BoardRow = {
    slug: "sample",
    name: "Sample",
    rank: 1,
    value: 10,
    tvl: 100,
    growth: null,
    age: null,
    cost: 0,
    time: 0,
    watchlist: false,
    category: null,
    chains: [],
    interval: [2, 100],
  };
  const html = boardRows([row], defaultState, Math.log1p(100), formatUsd);
  expect(html).toContain('title="P10–P90: $2–$100"');
  expect(html).toContain('<rect class="band" x="23.80" y="5" width="76.20" height="3"></rect>');
  expect(html).not.toContain("xmlns");
});

test("shows the published validation, ablation, coverage and dated assumptions in Method", () => {
  const snapshot = {
    as_of: "2026-11-14",
    floor_usd: 10,
    source: "Method test",
    watchlist: ["sample"],
    protocols: [
      protocol({ slug: "sample" }),
      protocol({ slug: "tracked", mcap_usd: 8_000_000, gecko_id: "tracked" }),
    ],
  };
  const data = buildRadar(snapshot);
  const html = methodView(data, farmAssumptions, formatUsd);
  for (const text of [
    "λ",
    "Leave one family out",
    "Seeded five-fold",
    "Walk-forward",
    "Spearman",
    "−TVL",
    "−Age",
    "−Momentum",
    "+Category",
    "OLS",
    "P10–P90",
    "F(t)",
    "parentProtocol",
    farmAssumptions.asOf,
  ]) {
    expect(html).toContain(text);
  }
  expect(html.match(/<table/g)).toHaveLength(7);
});
