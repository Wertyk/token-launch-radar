import { expect, test } from "vitest";
import { escapeHtml, formatInteger, formatPercent } from "../../src/presentation/web/format.ts";

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
