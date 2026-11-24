import { expect, test } from "vitest";
import {
  escapeHtml,
  formatCompactUsd,
  formatInteger,
  formatPercent,
} from "../../src/presentation/web/format.ts";

test.each([
  [22_590_871, "$22.59M"],
  [2_757_585_593, "$2.76B"],
  [1_250, "$1.25K"],
  [500, "$500"],
  [0.00001, "$0.00001"],
])("formats equation TVL %s as %s", (value, label) => {
  expect(formatCompactUsd(value)).toBe(label);
});

test("groups whole numbers independently of locale and marks missing values", () => {
  expect(formatInteger(1200300)).toBe("1,200,300");
  expect(formatInteger(0)).toBe("0");
  expect(formatInteger(null)).toBe("—");
});

test("formats percentage points with signs and does not display negative zero", () => {
  expect(formatPercent(12.345)).toBe("+12.3%");
  expect(formatPercent(-3.25)).toBe("−3.3%");
  expect(formatPercent(-0.01)).toBe("0.0%");
  expect(formatPercent(0)).toBe("0.0%");
  expect(formatPercent(null)).toBe("—");
});

test("escapes snapshot text and quoted HTML attributes", () => {
  expect(escapeHtml(`<a title="a&b">'quoted'</a>`)).toBe(
    "&lt;a title=&quot;a&amp;b&quot;&gt;&#39;quoted&#39;&lt;/a&gt;",
  );
});
