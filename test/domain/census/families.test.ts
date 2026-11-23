import { expect, test } from "vitest";
import { groupFamilies } from "../../../src/domain/census/families.ts";
import { protocol } from "../protocol-fixture.ts";

test("groups by Gecko ID, retains singletons, and chooses the lowest slug", () => {
  const representative = protocol({ slug: "a-market", gecko_id: "shared", tvl_usd: 20 });
  const traded = protocol({ slug: "z-market", gecko_id: "shared", tvl_usd: 30, mcap_usd: 90 });
  const lone = protocol({ slug: "shared", symbol: "SHARED", tvl_usd: 11, mcap_usd: 0 });
  const unpriced = protocol({
    slug: "u-market",
    gecko_id: "another",
    symbol: "SHARED",
    tvl_usd: 7,
  });
  const protocols = [traded, unpriced, lone, representative];

  const families = groupFamilies(protocols);
  expect(families).toEqual([
    {
      key: "gecko:shared",
      representative,
      members: [representative, traded],
      tvl_usd: 50,
      mcap_usd: 90,
    },
    { key: "slug:shared", representative: lone, members: [lone], tvl_usd: 11, mcap_usd: null },
    {
      key: "gecko:another",
      representative: unpriced,
      members: [unpriced],
      tvl_usd: 7,
      mcap_usd: null,
    },
  ]);
  expect(groupFamilies([...protocols].reverse())).toEqual(families);
});

test("uses the lowest-slug positive market cap when a family reports more than one", () => {
  const [family] = groupFamilies([
    protocol({ slug: "c", gecko_id: "shared", mcap_usd: 300 }),
    protocol({ slug: "a", gecko_id: "shared", mcap_usd: -10 }),
    protocol({ slug: "b", gecko_id: "shared", mcap_usd: 200 }),
  ]);
  expect(family?.representative.slug).toBe("a");
  expect(family?.mcap_usd).toBe(200);
});
