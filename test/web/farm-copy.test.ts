import { expect, test } from "vitest";
import { farmAssumptions, formatUsd, logValue } from "../../src/application/browser-api.ts";
import { buildRadar, recomputeRadar } from "../../src/application/build-radar.ts";
import { farmTables } from "../../src/domain/farming/playbook-data.ts";
import { impliedValueEffects, summarizeEffects } from "../../src/domain/valuation/input-effects.ts";
import type { BoardRow } from "../../src/presentation/web/board.ts";
import { boardRows, boardTable } from "../../src/presentation/web/board-view.ts";
import { formatOdds } from "../../src/presentation/web/format.ts";
import { methodNotes } from "../../src/presentation/web/method-extras.ts";
import { methodView } from "../../src/presentation/web/method-view.ts";
import { protocolView } from "../../src/presentation/web/protocol-view.ts";
import { protocol } from "../domain/protocol-fixture.ts";

test("labels the board plan and verdict columns and places both launch inputs next to implied value", () => {
  const html = boardTable();
  expect(html).toContain('data-sort="cost">Plan');
  expect(html).toContain('data-sort="verdict">Verdict');
  expect(html).toContain('data-sort="netPerHour">Net/h');
  expect(html).toMatch(/Implied value<\/button>.*Launch value<\/button>.*Odds 12m<\/button>/);
});

test("renders the labor rate and farmer haircut beside the protocol verdicts", () => {
  const tracked = protocol({
    slug: "tracked",
    name: "Traded & Co",
    mcap_usd: 8_000_000,
    gecko_id: "tracked",
  });
  const { board, model, odds } = recomputeRadar(
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
    { terms: [] },
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
    effects: impliedValueEffects(row.protocol, "2026-11-14", model, odds),
  };
  const html = protocolView(
    {
      ...row,
      launchProbability12: 0.625,
      oddsAge: 80,
    },
    { ...card, diagnostics: { ...card.diagnostics, ...{ launch_p12: 0.25 } } },
  );
  for (const { depositUsd, expectedValueUsd, verdict, netUsd, netPerHourUsd } of row.economics
    .deposits) {
    expect(html).toContain(
      `<td>${formatUsd(depositUsd)}</td><td>${formatUsd(expectedValueUsd)}</td><td>${formatUsd(netUsd)}</td><td>${formatUsd(netPerHourUsd)}</td><td>${verdict}</td>`,
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
  expect(html).toContain("Before depositing $1,000 into a vault on Base");
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
    launchValue: 20,
    odds: 0.5,
    tvl: 100,
    growth: null,
    age: null,
    rankRange: [1, 1],
    verdict: "THIN",
    netPerHour: 1,
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

test("shows whole validation tables in their Method columns with the dated assumptions", () => {
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
  const effectSummary = summarizeEffects(new Map([["sample", [6, -10, 55]]]));
  const html = methodView(
    { ...data, model, effectSummary, boardSize: data.board.length },
    (panel) => methodNotes(data.houseRule, farmAssumptions, formatUsd, formatOdds, panel),
  );
  for (const text of [
    "λ",
    "Leave one family out",
    "Seeded five-fold",
    "Walk-forward",
    "Spearman",
    "Value selection trials (full data)",
    "Odds selection trials (full data)",
    "10-fold Brier",
    "Base rate",
    "Raw PAVA clock",
    "Clock-only model (step 0)",
    "Not kept",
    "Held-out range honesty",
    "Walk-forward uses dated families only.",
    "F(a)",
    "Brier scores current token status.",
    "assumes the cross-section behaves like a cohort.",
    "parentProtocol",
    farmAssumptions.asOf,
  ]) {
    expect(html).toContain(text);
  }
  expect(html.match(/<table/g)).toHaveLength(10);
  const headings = (column: string) =>
    [...column.matchAll(/<h2>([^<]+)<\/h2>/g)].map(([, title]) => title);
  const [value, odds = "", evidence = ""] = html.split(/<div class="method-(?:odds|evidence)">/);
  expect(headings(value ?? "")).toEqual([
    "Launch value model",
    "Out-of-sample validation",
    "Value selection trials (full data)",
  ]);
  expect(headings(odds)).toEqual(["Token-status model", "Odds selection trials (full data)"]);
  expect(headings(evidence).slice(0, 4)).toEqual([
    "How each input moves the implied value",
    "Held-out token status",
    "Held-out range honesty",
    "Growth placebo",
  ]);
  expect(html).not.toContain("Predicted launch value vs current market cap");
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
