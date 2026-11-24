import { expect, test } from "vitest";
import {
  farmAssumptions,
  formatUsd,
  launchProbability12,
  logValue,
} from "../../src/application/browser-api.ts";
import { buildRadar, recomputeRadar } from "../../src/application/build-radar.ts";
import { farmTables } from "../../src/domain/farming/playbook-data.ts";
import type { BoardRow } from "../../src/presentation/web/board.ts";
import { boardRows, boardTable } from "../../src/presentation/web/board-view.ts";
import { methodFarmAssumptions, methodView } from "../../src/presentation/web/method-view.ts";
import {
  nearestComparables,
  protocolClock,
  protocolFacts,
} from "../../src/presentation/web/protocol-extras.ts";
import { protocolView } from "../../src/presentation/web/protocol-view.ts";
import { scatterCoverage } from "../../src/presentation/web/scatter-view.ts";
import { defaultState } from "../../src/presentation/web/state.ts";
import { protocol } from "../domain/protocol-fixture.ts";

test("labels the board fee horizon and places both launch inputs next to implied value", () => {
  const html = boardTable();
  expect(html).toContain('data-sort="cost">12-mo fees');
  expect(html).toMatch(/Implied value<\/button>.*Launch value<\/button>.*Odds 12m<\/button>/);
});

test("renders the labor rate and farmer haircut beside the protocol verdicts", () => {
  const tracked = protocol({
    slug: "tracked",
    name: "Traded & Co",
    mcap_usd: 8_000_000,
    gecko_id: "tracked",
  });
  const { board, model } = recomputeRadar(
    {
      protocols: [tracked, protocol({ name: "Sample & Co", category: "Yield", chains: ["Base"] })],
      as_of: "2026-11-14",
      floor_usd: 0,
      source: "Test snapshot",
      watchlist: [],
    },
    1,
    { points: [{ ageDays: 0, share: 0.1, count: 1 }], medianAgeDays: 0 },
    farmTables(),
  );
  const [row] = board;
  if (!row) throw new Error("Expected a ranked protocol.");
  const card = {
    age: null,
    coefficients: model.coefficients,
    lnValue: logValue(row.features, model),
    back: "#/",
    usd: formatUsd,
    farm: farmAssumptions,
    diagnostics: {
      interval_p10_usd: 100,
      interval_p90_usd: 1000,
      influence: { slug: "tracked", family_key: "gecko:tracked", rank_delta: -2 },
      twins: ["tracked"],
    },
    families: new Map([["tracked", { representative: tracked, mcap_usd: 8_000_000 }]]),
    launchClock: { points: [{ ageDays: 100, share: 0.4, count: 2 }], medianAgeDays: 80 },
    launchProbability12,
  };
  const extras = { nearestComparables, protocolClock, protocolFacts };
  const html = protocolView(
    { ...row, launchProbability12: 0.625 },
    { ...card, diagnostics: { ...card.diagnostics, ...{ launch_p12: 0.25 } } },
    extras,
  );
  expect(html).toMatch(/\$10,000 SKIP<\/span><\/div>\s*<p[^>]*>\$25\/h[^<]*50%[^<]*haircut/);
  expect(html).toContain("P10–P90");
  expect(html).toContain("$100–$1,000");
  expect(html).toContain("Without Traded &amp; Co, rank moves by 2");
  expect(html).not.toContain("gecko:tracked");
  expect(html).toContain("$8,000,000");
  expect(html).toContain("P₁₂ · 62.5%");
  expect(html).toContain("80 days");
  expect(html).toContain('<th scope="col">When</th>');
  expect(html).toContain("Deposit $1,000 into Sample &amp; Co&#39;s vault on Base.");
  expect(html).not.toContain("xmlns");

  const noMovement = protocolView(
    row,
    {
      ...card,
      diagnostics: {
        ...card.diagnostics,
        influence: { ...card.diagnostics.influence, rank_delta: 0 },
      },
    },
    extras,
  );
  expect(noMovement).toContain("No single comparable moves this rank");
  expect(noMovement).not.toContain("Without Traded &amp; Co");
});

test("draws a separate P10–P90 band below the board value", () => {
  const row: BoardRow = {
    slug: "sample",
    name: "Sample",
    rank: 1,
    value: 10,
    launchValue: 20,
    odds: 0.5,
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

test("shows the published validation, ablation, scatter and dated assumptions in Method", () => {
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
  const score = (medianMultiplier: number, spearman: number) => ({
    n: 8,
    medianMultiplier,
    spearman,
  });
  const validation = (
    model: ReturnType<typeof score>,
    flatMultiple: ReturnType<typeof score>,
    categoryMultiple: ReturnType<typeof score>,
  ) => ({ model, flatMultiple, categoryMultiple });
  const model = {
    ...data.model,
    validation: {
      leaveOneFamilyOut: validation(score(2.11, 0.711), score(2.22, 0.322), score(2.33, 0.533)),
      seededFiveFold: validation(score(3.11, 0.611), score(3.22, 0.422), score(3.33, 0.233)),
      walkForward: validation(score(4.11, 0.511), score(4.22, 0.222), score(4.33, 0.433)),
    },
    ablation: {
      full: score(2.11, 0.711),
      withoutTvl: score(5.12, -0.312),
      withoutAge: score(2.43, 0.603),
      withoutMomentum: score(4.14, 0.514),
      withCategory: score(3.15, 0.815),
      ols: score(2.16, 0.696),
    },
  };
  const launchClock = {
    medianAgeDays: 100,
    points: [
      { ageDays: 100, share: 0.25, count: 3 },
      { ageDays: 600, share: 0.75, count: 7 },
    ],
  };
  const looScatter = [
    { slug: "a", actual: Math.log(100), predicted: Math.log(1_000), p10: 0, p90: Math.log(500) },
    { slug: "b", actual: Math.log(10_000), predicted: Math.log(100), p10: 0, p90: Math.log(500) },
  ];
  const scatter = scatterCoverage(
    looScatter,
    new Map([
      ["a", { mcap_usd: 100 }],
      ["b", { mcap_usd: 10_000 }],
    ]),
  );
  const html = methodView(
    { ...data, model, launchClock, scatter },
    methodFarmAssumptions(farmAssumptions, formatUsd),
  );
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
    "Predicted launch value vs current market cap",
    "1/2 inside held-out P10–P90 · LOO median error ×2.11 vs ×2.22 flat",
    "Actual market cap (log USD)",
    "Predicted (log USD)",
    "Current traded-family market caps proxy for launch value.",
    "F(t)",
    "last rising segment’s constant conditional hazard",
    "The snapshot cannot validate future launch odds.",
    "parentProtocol",
    farmAssumptions.asOf,
  ]) {
    expect(html).toContain(text);
  }
  expect(html.match(/<table/g)).toHaveLength(6);
  expect(html.match(/<circle/g)).toHaveLength(2);
  expect(html).toContain('<circle class="inside" cx="59.00" cy="93.00"');
  expect(html).toContain(
    '<circle class="outside" cx="372.00" cy="178.00" r="3" fill="none" stroke="currentColor">',
  );
  expect(html).toContain(
    '<path class="identity" d="M59 178L372 8" stroke="currentColor" stroke-dasharray="4 3">',
  );
  expect(html).not.toMatch(/xmlns|https?:\/\//);
  const tableRows = (rows: string[][]) =>
    `<tbody>${rows.map((cells) => `<tr><td>${cells.join("</td><td>")}</td></tr>`).join("")}</tbody>`;
  expect(html).toContain(
    tableRows([
      ["100", "25.0%", "3"],
      ["600", "75.0%", "7"],
    ]),
  );
  expect(html).toContain("10 protocols · P₁₂(t) = [F(t+365) − F(t)] / [1 − F(t)]");
  expect(html.indexOf("Launch clock F(t)")).toBeLessThan(html.indexOf("House watchlist rule"));
  expect(html).toContain(
    tableRows([
      ["Leave one family out", "×2.11 · 0.711", "×2.22 · 0.322", "×2.33 · 0.533"],
      ["Seeded five-fold", "×3.11 · 0.611", "×3.22 · 0.422", "×3.33 · 0.233"],
      ["Walk-forward", "×4.11 · 0.511", "×4.22 · 0.222", "×4.33 · 0.433"],
    ]),
  );
  expect(html).toContain(
    tableRows([
      ["Full", "×2.11", "0.711"],
      ["−TVL", "×5.12", "-0.312"],
      ["−Age", "×2.43", "0.603"],
      ["−Momentum", "×4.14", "0.514"],
      ["+Category", "×3.15", "0.815"],
      ["OLS", "×2.16", "0.696"],
    ]),
  );
});
