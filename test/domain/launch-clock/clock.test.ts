import { expect, test } from "vitest";
import type { ClockPoint } from "../../../src/domain/launch-clock/clock.ts";
import { fitAgeShares, shareAt } from "../../../src/domain/launch-clock/clock.ts";
import { pava } from "../../../src/domain/launch-clock/pava.ts";

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

test("bins training rows and places the fitted shares at the annual bin means", () => {
  expect(
    fitAgeShares([
      { ageDays: 10, label: 1 },
      { ageDays: 20, label: 0 },
      { ageDays: 395, label: 1 },
    ]),
  ).toEqual([
    { ageDays: 15, share: 0.5, count: 2 },
    { ageDays: 395, share: 1, count: 1 },
  ]);
  expect(fitAgeShares([])).toEqual([]);
});

const point = (ageDays: number, share: number): ClockPoint => ({ ageDays, share, count: 1 });

test("interpolates held-out status probabilities between annual bin centers", () => {
  const curve = [point(100, 0), point(500, 0.8)];
  expect(shareAt(curve, 0)).toBe(0);
  expect(shareAt(curve, 365)).toBeCloseTo(0.53, 12);
});

test("a saturated clock stays at a share of one", () => {
  const curve = [point(0, 0.25), point(365, 1), point(730, 1)];
  expect(shareAt(curve, 1095)).toBe(1);
});

test("extends a flat tail with the last rising segment's conditional hazard", () => {
  const curve = [point(0, 0.25), point(365, 0.625), point(730, 0.625)];
  // The rising segment halves the unrecorded share every 365 days.
  expect(shareAt(curve, 730)).toBe(0.625);
  expect(shareAt(curve, 912.5)).toBeCloseTo(1 - 0.375 / Math.sqrt(2), 12);
  expect(shareAt(curve, 1095)).toBeCloseTo(0.8125, 12);
  expect(shareAt(curve, 1460)).toBeCloseTo(0.90625, 12);
});

test("uses the pooled annual rate when the fitted curve never rises", () => {
  const curve = [point(0, 0.4), point(365, 0.4)];
  expect(shareAt(curve, 730)).toBeCloseTo(0.64, 12);
});
