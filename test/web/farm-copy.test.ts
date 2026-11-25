import { expect, test } from "vitest";
import { farmAssumptions, formatUsd, logValue } from "../../src/application/browser-api.ts";
import { buildRadar, recomputeRadar } from "../../src/application/build-radar.ts";
import { farmTables } from "../../src/domain/farming/playbook-data.ts";
import type { BoardRow } from "../../src/presentation/web/board.ts";
import { boardRows, boardTable } from "../../src/presentation/web/board-view.ts";
import { formatOdds } from "../../src/presentation/web/format.ts";
import { methodNotes, termTrials } from "../../src/presentation/web/method-extras.ts";
import { methodView } from "../../src/presentation/web/method-view.ts";
import {
  nearestComparables,
  protocolClock,
  protocolFacts,
} from "../../src/presentation/web/protocol-extras.ts";
import { protocolView } from "../../src/presentation/web/protocol-view.ts";
import { scatterCoverage } from "../../src/presentation/web/scatter-view.ts";
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
      protocols: [
        tracked,
        protocol({
          name: "Sample & Co",
          category: "Yield",
          chains: ["Base"],
          listed_at: "2026-11-01",
        }),
      ],
      as_of: "2026-11-14",
      floor_usd: 0,
      source: "Test snapshot",
      watchlist: [],
    },
    { lambda: 1, terms: [] },
    [],
    farmTables(),
  );
  const [row] = board;
  if (!row) throw new Error("Expected a ranked protocol.");
  const card = {
    age: null,
    model,
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
    maxOddsAge: 100,
  };
  const extras = { nearestComparables, protocolClock, protocolFacts };
  const html = protocolView(
    {
      ...row,
      launchProbability12: 0.625,
      oddsAge: 80,
    },
    { ...card, diagnostics: { ...card.diagnostics, ...{ launch_p12: 0.25 } } },
    extras,
  );
  for (const { depositUsd, verdict, netUsd, netPerHourUsd } of row.economics.deposits) {
    expect(html).toContain(
      `${formatUsd(depositUsd)} ${verdict} · ${formatUsd(netUsd)} net · ${formatUsd(netPerHourUsd)}/h`,
    );
  }
  expect(html).toContain("$25/h for labor · 50% farmer haircut");
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
  const html = boardRows([row], "#/", Math.log1p(100), formatUsd);
  expect(html).toContain('title="P10–P90: $2–$100"');
  expect(html).toContain('<rect class="band" x="23.80" y="5" width="76.20" height="3"></rect>');
  expect(html).not.toContain("xmlns");
});

test("shows the published validation, selection, scatter and dated assumptions in Method", () => {
  const snapshot = {
    as_of: "2026-11-14",
    floor_usd: 10,
    source: "Method test",
    watchlist: ["sample"],
    protocols: [
      protocol({ slug: "sample", listed_at: "2026-11-01" }),
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
    selection: {
      ...data.model.selection,
      steps: [
        {
          baseline: [1.1, 2.2],
          trials: [{ term: "age" as const, scores: [1, 2.3], kept: false }],
        },
      ],
    },
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
    { ...data, model, scatter },
    (panel) => methodNotes(data.houseRule, farmAssumptions, formatUsd, formatOdds, panel),
    termTrials,
  );
  for (const text of [
    "λ",
    "Leave one family out",
    "Seeded five-fold",
    "Walk-forward",
    "Spearman",
    "Value term selection",
    "Odds term selection",
    "10-fold Brier",
    "Base rate",
    "Raw PAVA clock",
    "Clock-only model (step 0)",
    "Not kept",
    "Predicted launch value vs current market cap",
    "1/2 inside held-out P10–P90 · LOO median error ×2.11 vs ×2.22 flat",
    "Actual market cap (log USD)",
    "Predicted (log USD)",
    "Current traded-family market caps proxy for launch value.",
    "F(a)",
    "Brier scores current token status.",
    "assumes the cross-section behaves like a cohort.",
    "parentProtocol",
    farmAssumptions.asOf,
  ]) {
    expect(html).toContain(text);
  }
  expect(html.match(/<table/g)).toHaveLength(8);
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
  expect(html.indexOf("Token-status model")).toBeLessThan(html.indexOf("House watchlist rule"));
  expect(html).toContain(
    tableRows([
      ["Leave one family out", "×2.11 · 0.711", "×2.22 · 0.322", "×2.33 · 0.533"],
      ["Seeded five-fold", "×3.11 · 0.611", "×3.22 · 0.422", "×3.33 · 0.233"],
      ["Walk-forward", "×4.11 · 0.511", "×4.22 · 0.222", "×4.33 · 0.433"],
    ]),
  );
  expect(html).toContain(
    tableRows([
      ["1", "Current terms", "1.1000", "2.2000", "—"],
      ["1", "age", "1.0000", "2.3000", "Not kept"],
    ]),
  );
});
