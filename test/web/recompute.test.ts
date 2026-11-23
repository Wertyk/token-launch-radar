import { expect, test } from "vitest";
import { countBoardMismatches } from "../../src/presentation/web/recompute.ts";

const first = { slug: "a", rank: 1, implied_value_usd: 20, farm_steps: ["plan", "exit"] };
const second = { slug: "b", rank: 2, implied_value_usd: 10, farm_steps: ["step"] };

test("matches the board fields while ignoring unrelated metadata", () => {
  const withCategory = { ...first, category: "Yield" };
  expect(countBoardMismatches([withCategory, second], [first, second])).toBe(0);
  expect(countBoardMismatches([], [])).toBe(0);
});

test.each([
  { slug: "c" },
  { rank: 3 },
  { implied_value_usd: 19 },
  { farm_steps: ["exit", "plan"] },
  { farm_steps: ["plan"] },
  { farm_steps: ["plan", "exit", "extra"] },
])("detects a changed field in a row (%o)", (change) => {
  expect(countBoardMismatches([{ ...first, ...change }, second], [first, second])).toBe(1);
});

test("counts reordered, missing and extra rows", () => {
  expect(countBoardMismatches([second, first], [first, second])).toBe(2);
  expect(countBoardMismatches([first], [first, second])).toBe(1);
  expect(countBoardMismatches([first, second], [first])).toBe(1);
});
