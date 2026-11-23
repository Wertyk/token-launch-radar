import { expect, test } from "vitest";
import { mulberry32 } from "../../../src/domain/shared/prng.ts";

test("matches the first five mulberry32 outputs for seed 1", () => {
  const next = mulberry32(1);
  expect(Array.from({ length: 5 }, () => next())).toEqual([
    0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741,
    0.9683778982143849,
  ]);
});
