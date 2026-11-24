import { expect, test } from "vitest";
import {
  clockShareAt,
  farmAssumptions,
  formatUsd,
  logValue,
} from "../../src/application/browser-api.ts";
import { buildRadar } from "../../src/application/build-radar.ts";
import { daysBetween, parseSnapshot } from "../../src/domain/snapshot.ts";
import { protocolView } from "../../src/presentation/web/protocol-view.ts";
import { readKitSnapshot } from "../radar-fixtures.ts";

test("the rounded equation stays within 2% of the exact board value, including filled inputs", () => {
  const snapshot = parseSnapshot(readKitSnapshot());
  const { board, model, launchClock, rowDiagnostics } = buildRadar(snapshot);
  let withFilledGrowth = 0;
  let withFilledAge = 0;
  for (const row of board) {
    const { slug, tvl_usd, change_7d, listed_at } = row.protocol;
    const age = listed_at === null ? null : daysBetween(listed_at, snapshot.as_of);
    const html = protocolView(row, {
      age,
      back: "#/",
      coefficients: model.coefficients,
      lnValue: logValue(row.features, model),
      usd: formatUsd,
      farm: farmAssumptions,
      diagnostics: rowDiagnostics.get(slug),
      families: new Map(),
      launchClock,
      clockShareAt,
    });
    const equation = html.match(/<p class="value-equation">([^<]+)<\/p>/)?.[1];
    const parts = equation?.match(
      /^ln V ≈ (-?\d+\.\d{4}) ([+−]) (\d+\.\d{4}) × ln\(\$(\d+(?:\.\d+)?(?:e-\d+)?)([KMBT]?) × (\d+\.\d{3})\) ([+−]) (\d+\.\d{4}) × ln\((\d+) d\) ≈ (-?\d+\.\d{3}) → (.+)$/,
    );
    if (!parts) throw new Error(`${slug}: cannot read the displayed equation: ${equation}`);
    const [, intercept, tvlSign, tvlSlope, tvl, unit, growth, ageSign, ageSlope, days, log, value] =
      parts;
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
      expect(
        Math.abs(Math.exp(displayedLog) / row.implied_value_usd - 1),
        slug,
      ).toBeLessThanOrEqual(0.02);
    }
    expect(value, slug).toBe(formatUsd(row.implied_value_usd));
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
