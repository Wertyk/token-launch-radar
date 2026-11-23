import { expect, test } from "vitest";
import { daysBetween, parseSnapshot } from "../../src/domain/snapshot.ts";
import { protocol } from "./protocol-fixture.ts";

const snapshot = {
  as_of: "2024-03-01",
  source: "Snapshot from https://example.test",
  floor_usd: 50_000_000,
  protocols: [protocol()],
  watchlist: ["sample"],
};

test("parses the snapshot, preserving nulls and empty chain lists", () => {
  const raw = {
    ...snapshot,
    protocols: [protocol({ chains: [], change_7d: null, listed_at: null })],
  };
  expect(parseSnapshot(raw)).toEqual(raw);
});

test("counts UTC days across a leap day and across early years", () => {
  expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
  expect(daysBetween("2024-03-01", "2024-02-28")).toBe(-2);
  expect(daysBetween("2023-02-28", "2023-03-01")).toBe(1);
  expect(daysBetween("0099-12-31", "0100-01-01")).toBe(1);
});

test.each([
  [null, "snapshot: expected an object"],
  [{ ...snapshot, protocols: {} }, "protocols: expected an array"],
  [{ ...snapshot, watchlist: [false] }, "watchlist[0]: expected a non-empty string"],
  [{ ...snapshot, floor_usd: Number.NaN }, "floor_usd: expected a finite number"],
  [{ ...snapshot, as_of: "2023-02-29" }, "as_of: expected a valid YYYY-MM-DD date"],
  [{ ...snapshot, protocols: [null] }, "protocols[0]: expected an object"],
  [
    { ...snapshot, protocols: [{ ...protocol(), tvl_usd: Number.POSITIVE_INFINITY }] },
    "protocols[0].tvl_usd: expected a finite number",
  ],
  [
    { ...snapshot, protocols: [{ ...protocol(), tvl_usd: 0 }] },
    "protocols[0].tvl_usd: expected a positive number",
  ],
  [
    { ...snapshot, protocols: [{ ...protocol(), chains: ["Base", 123] }] },
    "protocols[0].chains[1]: expected a non-empty string",
  ],
  [
    { ...snapshot, protocols: [{ ...protocol(), category: 123 }] },
    "protocols[0].category: expected a non-empty string",
  ],
  [
    { ...snapshot, protocols: [{ ...protocol(), change_7d: "12" }] },
    "protocols[0].change_7d: expected a finite number",
  ],
  [
    { ...snapshot, protocols: [protocol({ listed_at: "2024-04-31" })] },
    "protocols[0].listed_at: expected a valid YYYY-MM-DD date",
  ],
  [
    { ...snapshot, protocols: [{ ...protocol(), mcap_usd: undefined }] },
    "protocols[0].mcap_usd: expected a finite number",
  ],
  [
    { ...snapshot, protocols: [protocol(), protocol()] },
    'protocols[1].slug: duplicate slug "sample"',
  ],
  [{ ...snapshot, watchlist: ["unknown"] }, 'watchlist[0]: unknown protocol slug "unknown"'],
])("reports the invalid snapshot field for case %#", (raw, message) => {
  expect(() => parseSnapshot(raw)).toThrow(message);
});
