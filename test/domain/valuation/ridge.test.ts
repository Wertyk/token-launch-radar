import { expect, test } from "vitest";
import { fitHuber, fitRidge } from "../../../src/domain/valuation/ridge.ts";

test("Huber reweights an isolated outlier in a location fit", () => {
  const values = [2, 2, 2, 10];
  const solve = (weights: Float64Array) => [
    weights.reduce((sum, weight, i) => sum + weight * (values[i] ?? 0), 0) /
      weights.reduce((sum, weight) => sum + weight, 0),
  ];
  const residuals = ([center = 0]: readonly number[], into: Float64Array) =>
    into.set(values.map((value) => value - center));
  expect(fitHuber(values.length, solve, residuals, false).coefficients[0]).toBe(4);
  const robust = fitHuber(values.length, solve, residuals);
  // MAD is zero. At convergence the outlier contributes the cutoff, balanced by three residuals.
  expect(robust.huberScale).toBe(1e-8);
  expect(robust.coefficients[0]).toBeCloseTo(2 + (1.345 * 1e-8) / 3, 5);
});

test("ridge shrinks two orthogonal slopes and leaves the intercept unpenalized", () => {
  const rows = [
    { tvl: -1, age: 0, target: 7 },
    { tvl: 1, age: 0, target: 13 },
    { tvl: 0, age: -1, target: 5 },
    { tvl: 0, age: 1, target: 15 },
  ];
  // X'X = diag(4, 2, 2), X'y = [40, 6, 10], and lambda adds two to the slope diagonal.
  const { coefficients, huberScale } = fitRidge(rows, 2, false);
  for (const [i, coefficient] of [10, 1.5, 2.5].entries()) {
    expect(coefficients[i]).toBeCloseTo(coefficient, 12);
  }
  expect(huberScale).toBeCloseTo(2 * 1.4826, 12);
});
