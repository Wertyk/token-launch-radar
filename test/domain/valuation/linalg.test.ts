import { expect, test } from "vitest";
import { choleskySolve } from "../../../src/domain/valuation/linalg.ts";

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
