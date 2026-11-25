import { expect, test } from "vitest";
import { choleskySolve, weightedLeastSquares } from "../../../src/domain/valuation/linalg.ts";

test("solves a positive-definite system with a known solution", () => {
  // L = [[2, 0, 0], [1, 2, 0], [3, -1, 1]], A = LLᵀ, and b = A[2, -1, 3]ᵀ.
  const solution = choleskySolve(
    [
      [4, 2, 6],
      [2, 5, 1],
      [6, 1, 11],
    ],
    [24, 2, 44],
  );
  expect(solution).toEqual([2, -1, 3]);
});

test("solves ridge with unit weights and an unpenalized intercept", () => {
  // XᵀX = diag(2, 2), Xᵀy = [8, 4], and the slope penalty is 2.
  const [intercept, slope] = weightedLeastSquares(
    [
      [1, -1],
      [1, 1],
    ],
    [2, 6],
    [1, 1],
    [[0], [0, 2]],
  );
  expect(intercept).toBeCloseTo(4, 12);
  expect(slope).toBeCloseTo(1, 12);
});

test("solves a Huber step using the weights from the scaled residuals", () => {
  // With center 4 and cutoff 1.5, the three residuals of −2 weigh 3/4 and the residual of 6 weighs 1/4.
  const [center] = weightedLeastSquares(
    [[1], [1], [1], [1]],
    [2, 2, 2, 10],
    [0.75, 0.75, 0.75, 0.25],
    [[0]],
  );
  expect(center).toBeCloseTo(7 / 2.5, 12);
});

test("solves a logistic step using binomial weights and a working response", () => {
  // At logit zero, p = 1/2, w = 1/4 and z = (y − p)/w = ±2. The slope score is 1.
  const [intercept, slope] = weightedLeastSquares(
    [
      [1, -1],
      [1, 1],
    ],
    [-2, 2],
    [0.25, 0.25],
    [[0], [0, 0.5]],
  );
  expect(intercept).toBeCloseTo(0, 12);
  expect(slope).toBeCloseTo(1, 12);
});
