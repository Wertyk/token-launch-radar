import { expect, test } from "vitest";
import {
  farmAssumptions,
  formatUsd,
  launchProbability12,
  logValue,
} from "../../src/application/browser-api.ts";
import { buildRadar } from "../../src/application/build-radar.ts";
import { daysBetween, parseSnapshot } from "../../src/domain/snapshot.ts";
import {
  nearestComparables,
  protocolClock,
  protocolFacts,
} from "../../src/presentation/web/protocol-extras.ts";
import { protocolView } from "../../src/presentation/web/protocol-view.ts";
import { readKitSnapshot } from "../radar-fixtures.ts";

test("the card reconstructs launch and implied values within 2%, including filled inputs", () => {
  const snapshot = parseSnapshot(readKitSnapshot());
  const { board, model, launchClock, rowDiagnostics } = buildRadar(snapshot);
  const extras = { nearestComparables, protocolClock, protocolFacts };
  let withFilledGrowth = 0;
  let withFilledAge = 0;
  for (const row of board) {
    const { slug, tvl_usd, change_7d, listed_at } = row.protocol;
    const age = listed_at === null ? null : daysBetween(listed_at, snapshot.as_of);
    const html = protocolView(
      row,
      {
        age,
        back: "#/",
        coefficients: model.coefficients,
        lnValue: logValue(row.features, model),
        usd: formatUsd,
        farm: farmAssumptions,
        diagnostics: rowDiagnostics.get(slug),
        families: new Map(),
        launchClock,
        launchProbability12,
      },
      extras,
    );
    const equation = html.match(/<p class="value-equation">([^<]+)<\/p>/)?.[1];
    const parts = equation?.match(
      /^ln V ≈ (-?\d+\.\d{4}) ([+−]) (\d+\.\d{4}) × ln\(\$(\d+(?:\.\d+)?(?:e-\d+)?)([KMBT]?) × (\d+\.\d{3})\) ([+−]) (\d+\.\d{4}) × ln\((\d+) d\) ≈ (-?\d+\.\d{3}) → (\$[\d,]+) × P₁₂\((\d+) d\) (\d{1,3}\.\d)% → (\$[\d,]+)$/,
    );
    if (!parts) throw new Error(`${slug}: cannot read the displayed equation: ${equation}`);
    const [
      ,
      intercept,
      tvlSign,
      tvlSlope,
      tvl,
      unit,
      growth,
      ageSign,
      ageSlope,
      days,
      log,
      launch,
      clockDays,
      odds,
      value,
    ] = parts;
    const scale = ["", "K", "M", "B", "T"].indexOf(unit ?? "");
    const displayedTvl = Number(tvl) * 1000 ** scale;
    const signed = (sign: string | undefined, magnitude: string | undefined) =>
      (sign === "−" ? "-" : "") + magnitude;
    const logFromTerms =
      Number(intercept) +
      Number(signed(tvlSign, tvlSlope)) * Math.log(displayedTvl * Number(growth)) +
      Number(signed(ageSign, ageSlope)) * Math.log(Number(days));
    expect(intercept, slug).toBe(model.coefficients.intercept.toFixed(4));
    expect(signed(tvlSign, tvlSlope), slug).toBe(model.coefficients.lnTvl.toFixed(4));
    expect(signed(ageSign, ageSlope), slug).toBe(model.coefficients.lnAge.toFixed(4));
    expect(Math.abs(displayedTvl / tvl_usd - 1), slug).toBeLessThanOrEqual(0.005);
    expect(growth, slug).toBe((1 + Math.max(-50, Math.min(100, change_7d ?? 0)) / 100).toFixed(3));
    expect(Number(days), slug).toBe(
      Math.round(age === null ? Math.exp(model.medianLnAge) : Math.max(1, age)),
    );
    for (const displayedLog of [logFromTerms, Number(log)]) {
      expect(Math.abs(Math.exp(displayedLog) / row.launch_value_usd - 1), slug).toBeLessThanOrEqual(
        0.02,
      );
      expect(
        Math.abs((Math.exp(displayedLog) * (Number(odds) / 100)) / row.implied_value_usd - 1),
        slug,
      ).toBeLessThanOrEqual(0.02);
    }
    const clockAge = Math.max(0, age ?? launchClock.medianAgeDays ?? 0);
    expect(Number(clockDays), slug).toBe(Math.round(clockAge));
    expect(launch, slug).toBe(formatUsd(row.launch_value_usd));
    expect(odds, slug).toBe((row.launchProbability12 * 100).toFixed(1));
    expect(value, slug).toBe(formatUsd(row.implied_value_usd));
    const maxAge = Math.max(1, clockAge, launchClock.points.at(-1)?.ageDays ?? 0);
    const x = ((clockAge / maxAge) * 100).toFixed(2);
    const y = ((1 - row.launchProbability12) * 40).toFixed(2);
    expect(html, slug).toContain(`<circle cx="${x}" cy="${y}"`);
    expect(html, slug).toMatch(
      /<span>Launch value<\/span>.*<span>× launch odds 12m<\/span>.*<span>Implied value<\/span>/,
    );
    expect(html.indexOf('<ol class="waterfall">')).toBeLessThan(html.indexOf(equation ?? ""));
    if (change_7d === null) {
      expect(growth).toBe("1.000");
      expect(html).toContain("Missing TVL change. The model uses zero growth.");
      withFilledGrowth++;
    }
    if (listed_at === null) {
      expect(html).toContain("Missing listing date. The model uses median comparable age.");
      withFilledAge++;
    }
  }
  expect(withFilledGrowth).toBeGreaterThan(0);
  expect(withFilledAge).toBeGreaterThan(0);
});
