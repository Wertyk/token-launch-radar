import { expect, test } from "vitest";
import { formatUsd } from "../../../src/domain/shared/money.ts";

test.each([
  [0, "$0"],
  [0.42, "$0.42"],
  [1234, "$1,234"],
  [1_234_567.5, "$1,234,567.50"],
  [-1234.25, "-$1,234.25"],
  [12.3456, "$12.35"],
])("formats %s as %s without locale settings", (value, expected) => {
  expect(formatUsd(value)).toBe(expected);
});
