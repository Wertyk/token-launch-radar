import { expect, test } from "vitest";
import { ageSparkline, clockSampleSize } from "../../src/presentation/web/clock-view.ts";
import { svg, table, tableBody } from "../../src/presentation/web/render.ts";

test("renders plain and sortable headers, HTML cells and a totals row", () => {
  const html = table(
    [["name", "Name & chain"], "Fee"],
    [['<a href="#/p/example">Example</a>', "$1"]],
    { sort: "name", dir: "desc", total: ["Total", "$1"], linked: true },
  );
  expect(html).toContain(
    '<th scope="col" aria-sort="descending"><button type="button" data-sort="name">Name &amp; chain',
  );
  expect(html).toContain('<th scope="col">Fee</th>');
  expect(html).toContain(
    '<tr data-protocol><td><a href="#/p/example">Example</a></td><td>$1</td></tr>',
  );
  expect(html).toContain('<tfoot><tr><th scope="row">Total</th><td>$1</td></tr></tfoot>');
});

test("uses the header count for the escaped empty-row message", () => {
  expect(tableBody([], 3, { empty: "No rows <here>" })).toBe(
    '<tr><td colspan="3" class="empty">No rows &lt;here&gt;</td></tr>',
  );
  expect(tableBody([], 3)).toBe("");
});

test("renders a decorative SVG with a viewBox and no xmlns or URL", () => {
  expect(svg(100, 6, '<rect width="20" height="6"></rect>')).toBe(
    '<svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect width="20" height="6"></rect></svg>',
  );
});

test("plots launch odds and marks the row's exact age and odds", () => {
  const chart = ageSparkline(100, 60, 0.5, (age) => 0.2 + age / 200);
  expect(chart).toContain('points="0.00,32.00');
  expect(chart).toContain('100.00,12.00"');
  expect(chart).toContain('cx="60.00" cy="20.00"');
  expect(ageSparkline(200, 200, 0.75, () => 0.75)).toContain('cx="100.00" cy="10.00"');
});

test("counts fitted protocols across all age bins, including pooled shares", () => {
  expect(clockSampleSize([])).toBe(0);
  expect(
    clockSampleSize([
      { ageDays: 100, share: 0.25, count: 3 },
      { ageDays: 400, share: 0.25, count: 6 },
      { ageDays: 700, share: 0.75, count: 1 },
    ]),
  ).toBe(10);
});
