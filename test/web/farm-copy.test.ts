import { expect, test } from "vitest";
import { farmAssumptions, formatUsd } from "../../src/application/browser-api.ts";
import { recomputeRadar } from "../../src/application/build-radar.ts";
import { farmTables } from "../../src/domain/farming/playbook-data.ts";
import { boardView } from "../../src/presentation/web/board-view.ts";
import { protocolView } from "../../src/presentation/web/protocol-view.ts";
import { protocol } from "../domain/protocol-fixture.ts";

test("labels the board fee column with its horizon", () => {
  expect(boardView([])).toContain('data-sort="cost">12-mo fees');
});

test("renders the labor rate and farmer haircut beside the protocol verdicts", () => {
  const tracked = protocol({ slug: "tracked", mcap_usd: 8_000_000, gecko_id: "tracked" });
  const { board } = recomputeRadar(
    {
      protocols: [tracked, protocol()],
      as_of: "2026-11-14",
      floor_usd: 0,
      source: "Test snapshot",
      watchlist: [],
    },
    1,
    { points: [], medianAgeDays: null },
    farmTables(),
  );
  const [row] = board;
  if (!row) throw new Error("Expected a ranked protocol.");
  const html = protocolView(row, null, "#/", formatUsd, farmAssumptions);
  expect(html).toMatch(/\$10,000 SKIP<\/span><\/div>\s*<p[^>]*>\$25\/h[^<]*50%[^<]*haircut/);
});
