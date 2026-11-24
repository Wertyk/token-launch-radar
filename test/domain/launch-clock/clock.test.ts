import { expect, test } from "vitest";
import type { ClockPoint } from "../../../src/domain/launch-clock/clock.ts";
import {
  fitLaunchClock,
  launchProbability12,
  shareAt,
} from "../../../src/domain/launch-clock/clock.ts";
import { pava } from "../../../src/domain/launch-clock/pava.ts";
import { protocol } from "../protocol-fixture.ts";

test("PAVA preserves monotone shares", () => {
  expect(
    pava([
      { count: 4, recorded: 1 },
      { count: 5, recorded: 2 },
      { count: 2, recorded: 2 },
    ]),
  ).toEqual([1 / 4, 2 / 5, 1]);
});

test("PAVA pools descending shares by observation count", () => {
  expect(
    pava([
      { count: 2, recorded: 2 },
      { count: 2, recorded: 1 },
      { count: 6, recorded: 0 },
    ]),
  ).toEqual([3 / 10, 3 / 10, 3 / 10]);
});

test("PAVA retains ties including after a merge", () => {
  expect(
    pava([
      { count: 4, recorded: 1 },
      { count: 8, recorded: 2 },
      { count: 1, recorded: 1 },
      { count: 3, recorded: 0 },
      { count: 2, recorded: 1 },
    ]),
  ).toEqual([1 / 4, 1 / 4, 1 / 4, 1 / 4, 1 / 2]);
});

test("bins dated protocols, including unpriced records and excluded protocols", () => {
  const clock = fitLaunchClock(
    [
      protocol({ slug: "first", listed_at: "2023-12-22", symbol: "TEST" }),
      protocol({ slug: "second", listed_at: "2023-12-12", category: "Bridge" }),
      protocol({ slug: "third", listed_at: "2022-12-02", mcap_usd: 10 }),
      protocol({ slug: "undated", listed_at: null, gecko_id: "undated" }),
    ],
    "2024-01-01",
  );
  expect(clock).toEqual({
    points: [
      { ageDays: 15, share: 0.5, count: 2 },
      { ageDays: 395, share: 1, count: 1 },
    ],
    medianAgeDays: 20,
  });
  expect(fitLaunchClock([], "2024-01-01")).toEqual({ points: [], medianAgeDays: null });
});

const point = (ageDays: number, share: number): ClockPoint => ({ ageDays, share, count: 1 });

test("P12 preserves interpolation for a horizon inside the fitted points", () => {
  const curve = [point(100, 0), point(500, 0.8)];
  expect(launchProbability12(curve, 0)).toBeCloseTo(0.53, 12);
  expect(launchProbability12(curve, 100)).toBeCloseTo(0.73, 12);
});

test("a saturated clock gives the limiting P12 of one", () => {
  const curve = [point(0, 0.25), point(365, 1), point(730, 1)];
  expect(shareAt(curve, 1095)).toBe(1);
  expect(launchProbability12(curve, 729.99)).toBe(1);
  expect(launchProbability12(curve, 730)).toBe(1);
  expect(launchProbability12(curve, 1095)).toBe(1);
});

test("extends a flat tail with the last rising segment's conditional hazard", () => {
  const curve = [point(0, 0.25), point(365, 0.625), point(730, 0.625)];
  // The rising segment halves the unrecorded share every 365 days.
  expect(shareAt(curve, 730)).toBe(0.625);
  expect(shareAt(curve, 912.5)).toBeCloseTo(1 - 0.375 / Math.sqrt(2), 12);
  expect(shareAt(curve, 1095)).toBeCloseTo(0.8125, 12);
  expect(shareAt(curve, 1460)).toBeCloseTo(0.90625, 12);
  expect(launchProbability12(curve, 730 - 1e-7)).toBeCloseTo(0.5, 9);
  expect(launchProbability12(curve, 730)).toBeCloseTo(0.5, 12);
  expect(launchProbability12(curve, 730 + 1e-7)).toBeCloseTo(0.5, 12);
  expect(launchProbability12(curve, 1e6)).toBeCloseTo(0.5, 12);
});

test("uses the pooled annual rate when the fitted curve never rises", () => {
  const curve = [point(0, 0.4), point(365, 0.4)];
  expect(shareAt(curve, 730)).toBeCloseTo(0.64, 12);
  expect(launchProbability12(curve, 365)).toBeCloseTo(0.4, 12);
  expect(launchProbability12([point(0, 0), point(365, 0)], 100)).toBe(0);
  expect(launchProbability12([], 100)).toBe(0);
});

test.each([
  [0, 0],
  [0.5, 0.5],
  [1, 1],
])("uses the pooled annual rate for a flat in-range window at share %f", (share, odds) => {
  const curve = [point(0, share), point(730, share)];
  expect(launchProbability12(curve, 0)).toBe(odds);
  expect(launchProbability12(curve, 730)).toBe(odds);
});

test("uses the last rising segment's annual hazard in a flat in-range window", () => {
  const curve = [point(0, 0.25), point(730, 0.25), point(1095, 0.625)];
  expect(launchProbability12(curve, 0)).toBeCloseTo(0.5, 12);
});
