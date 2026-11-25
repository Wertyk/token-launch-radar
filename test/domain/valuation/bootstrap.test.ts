import { expect, test } from "vitest";
import { mulberry32 } from "../../../src/domain/shared/prng.ts";
import { bootstrapSummary, resample } from "../../../src/domain/valuation/bootstrap.ts";

test("samples with replacement and summarizes ranks and sample standard errors", () => {
  const sample = () => resample(["a", "b", "c"], mulberry32(1));
  expect(sample()).toEqual(["b", "a", "b"]);
  expect(sample()).toEqual(sample());

  const replicates = Array.from({ length: 20 }, (_, i) => ({
    ranked: i < 4 ? ["b", "a"] : ["a", "b"],
    coefficients: [i < 10 ? 0 : 2, 2],
  }));
  const result = bootstrapSummary(replicates);
  expect(result.ranks.get("a")).toEqual({ rank_p10: 1, rank_p90: 2 });
  expect(result.ranks.get("b")).toEqual({ rank_p10: 1, rank_p90: 2 });
  expect(result.standardErrors[0]).toBeCloseTo(Math.sqrt(20 / 19), 12);
  expect(result.standardErrors[1]).toBe(0);
});
