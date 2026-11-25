import { expect, test } from "vitest";
import { fitHuber, fitRidge } from "../../../src/domain/valuation/ridge.ts";

test("Huber reweights an isolated outlier in a location fit", () => {
  const values = [2, 2, 2, 10];
  const design = values.map(() => [1]);
  expect(fitHuber(design, values, [[0]], false).coefficients[0]).toBe(4);
  const robust = fitHuber(design, values, [[0]]);
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

test("Huber ridge retains the sorted-median fit with even and odd sample sizes", () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    target: i % 4 === 0 ? i * 3 : (i % 7) - 2,
    tvl: (i % 5) - 2,
    age: (i % 3) - 1,
    group: i % 3,
  }));
  const penalty = [[24], [-4, 24]];
  expect(fitRidge(rows.slice(0, 24), 0.01, true, penalty)).toStrictEqual({
    coefficients: [
      1.721785266398628, 0.05192262420929001, -0.018776165446720706, 0.09016295252409899,
      0.4610707692940291,
    ],
    huberScale: 2.9604025478157876,
  });
  expect(fitRidge(rows, 0.01, true, penalty)).toStrictEqual({
    coefficients: [
      2.183819667581743, 0.009133898106956228, -0.0032894544372815055, 0.3976486059069211,
      0.14063744709056922,
    ],
    huberScale: 3.4907433501546494,
  });
});
