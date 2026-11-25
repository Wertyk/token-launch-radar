import { expect, test } from "vitest";
import { farmAssumptions, formatUsd, logValue } from "../../src/application/browser-api.ts";
import { buildRadar } from "../../src/application/build-radar.ts";
import { daysBetween, parseSnapshot } from "../../src/domain/snapshot.ts";
import {
  nearestComparables,
  protocolClock,
  protocolFacts,
} from "../../src/presentation/web/protocol-extras.ts";
import { protocolView } from "../../src/presentation/web/protocol-view.ts";
import { readKitSnapshot } from "../radar-fixtures.ts";

test("the card reconstructs launch and implied values within 2% using the kept value terms", () => {
  const snapshot = parseSnapshot(readKitSnapshot());
  const { board, model, odds, rowDiagnostics } = buildRadar(snapshot);
  const extras = { nearestComparables, protocolClock, protocolFacts };
  let undated = 0;
  for (const row of board) {
    const { slug, tvl_usd, listed_at } = row.protocol;
    const age = listed_at === null ? null : daysBetween(listed_at, snapshot.as_of);
    const { oddsAge: ageDays } = row;
    const html = protocolView(
      row,
      {
        age,
        back: "#/",
        model,
        lnValue: logValue(row.features, model),
        usd: formatUsd,
        farm: farmAssumptions,
        diagnostics: rowDiagnostics.get(slug),
        families: new Map(),
        maxOddsAge: odds.maxAgeDays,
      },
      extras,
    );
    const equation = html.match(/<p class="value-equation">([^<]+)<\/p>/)?.[1];
    const parts = equation?.match(
      /^ln V ≈ (-?\d+\.\d{4}) ([+−]) (\d+\.\d{4}) × ln\(\$(\d+(?:\.\d+)?(?:e-\d+)?)([KMBT]?)\) ≈ (-?\d+\.\d{3}) → (\$[\d,]+) × P₁₂\((\d+) d\) (\d{1,3}\.\d{1,2})% → (\$[\d,]+)$/,
    );
    if (!parts) throw new Error(`${slug}: cannot read the displayed equation: ${equation}`);
    const [, intercept, sign, slope, tvl, unit, log, launch, oddsAge, percent, value] = parts;
    const displayedTvl = Number(tvl) * 1000 ** ["", "K", "M", "B", "T"].indexOf(unit ?? "");
    const tvlSlope = (sign === "−" ? "-" : "") + slope;
    expect(intercept, slug).toBe(model.coefficients.intercept.toFixed(4));
    expect(tvlSlope, slug).toBe(model.coefficients.lnTvl.toFixed(4));
    expect(Math.abs(displayedTvl / tvl_usd - 1), slug).toBeLessThanOrEqual(0.005);
    const logFromTerms = Number(intercept) + Number(tvlSlope) * Math.log(displayedTvl);
    for (const displayedLog of [logFromTerms, Number(log)]) {
      expect(Math.abs(Math.exp(displayedLog) / row.launch_value_usd - 1), slug).toBeLessThanOrEqual(
        0.02,
      );
      expect(
        Math.abs((Math.exp(displayedLog) * (Number(percent) / 100)) / row.implied_value_usd - 1),
        slug,
      ).toBeLessThanOrEqual(0.02);
    }
    expect(Number(oddsAge), slug).toBe(Math.round(ageDays));
    expect(launch, slug).toBe(formatUsd(row.launch_value_usd));
    const oddsDigits = row.launchProbability12 < 0.05 ? 2 : 1;
    expect(percent, slug).toBe((row.launchProbability12 * 100).toFixed(oddsDigits));
    expect(value, slug).toBe(formatUsd(row.implied_value_usd));
    const x = ((ageDays / odds.maxAgeDays) * 100).toFixed(2);
    const y = ((1 - row.launchProbability12) * 40).toFixed(2);
    expect(html, slug).toContain(`<circle cx="${x}" cy="${y}"`);
    expect(html, slug).not.toContain('class="waterfall"');
    expect(html.indexOf('<ol class="waterfall">'), slug).toBeLessThan(
      html.indexOf('<p class="value-equation">'),
    );
    if (listed_at === null) {
      expect(html).toContain(`${odds.medianAgeDays} days (population median)`);
      undated++;
    }
  }
  expect(undated).toBeGreaterThan(0);
}, 20_000);
