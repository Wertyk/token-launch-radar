import { expect, test } from "vitest";
import type { ClockPoint } from "../../../src/domain/launch-clock/clock.ts";
import { fitLaunchClock, launchProbability12 } from "../../../src/domain/launch-clock/clock.ts";
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

test("P12 interpolates and extrapolates flat for a row starting at F = 0", () => {
  const curve = [point(100, 0), point(500, 0.8)];
  expect(launchProbability12(curve, 0)).toBeCloseTo(0.53, 12);
  expect(launchProbability12(curve, 300)).toBeCloseTo(2 / 3, 12);
  expect(launchProbability12(curve, 600)).toBe(0);
});

test("P12 is zero at F = 1, on a flat curve, and without a curve", () => {
  expect(launchProbability12([point(0, 0), point(365, 1)], 365)).toBe(0);
  expect(launchProbability12([point(0, 0.4), point(365, 0.4)], 100)).toBe(0);
  expect(launchProbability12([point(0, 0), point(365, 0)], 100)).toBe(0);
  expect(launchProbability12([], 100)).toBe(0);
});
