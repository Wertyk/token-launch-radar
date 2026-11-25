import { expect, test } from "vitest";
import { parsePlanState, planHash } from "../../src/presentation/web/plan-state.ts";
import { parseRoute } from "../../src/presentation/web/route.ts";
import {
  boardHash,
  censusHash,
  defaultState,
  protocolHash,
} from "../../src/presentation/web/state.ts";

test("round-trips every board setting, including spaces and reserved characters", () => {
  const state = {
    ...defaultState,
    sort: "value",
    dir: "desc",
    cat: "Lending & Yield",
    chain: "Base",
    wl: true,
    q: "cap + /",
  } as const;
  const hash = "#/?sort=value&dir=desc&cat=Lending+%26+Yield&chain=Base&wl=1&q=cap+%2B+%2F";
  expect(boardHash(state)).toBe(hash);
  expect(parseRoute(hash)).toEqual({ page: "board", state });
  expect(parseRoute(protocolHash("a/b #?", state))).toEqual({
    page: "protocol",
    slug: "a/b #?",
    state,
  });
});

test("uses the default board for an empty hash and tolerates invalid sort settings", () => {
  expect(boardHash(defaultState)).toBe("#/");
  expect(parseRoute("")).toEqual({ page: "board", state: defaultState });
  expect(parseRoute("#/?sort=other&dir=sideways&wl=yes&q=hello")).toEqual({
    page: "board",
    state: { ...defaultState, q: "hello" },
  });
});

test.each(["launchValue", "odds", "verdict", "netPerHour"] as const)(
  "round-trips the %s board sort",
  (sort) => {
    const state = { ...defaultState, sort, dir: "desc", wl: true } as const;
    expect(parseRoute(boardHash(state))).toEqual({ page: "board", state });
    expect(parseRoute(protocolHash("candidate", state))).toEqual({
      page: "protocol",
      slug: "candidate",
      state,
    });
  },
);

test("recognizes unknown paths and malformed slug escapes", () => {
  for (const hash of ["#/about", "#/p/", "#/p/a/b", "#/p/%ZZ"]) {
    expect(parseRoute(hash)).toEqual({ page: "unknown", state: defaultState });
  }
});

test("round-trips the planner budget, hours and selected chains", () => {
  const state = { budgetUsd: 5_000, hoursPerWeek: 3, chains: ["Base", "Solana"], sliders: {} };
  expect(planHash(state)).toBe("#/plan?budget=5000&hours=3&chains=Base,Solana");
  expect(parsePlanState(planHash(state))).toEqual(state);

  const other = { budgetUsd: 0, hoursPerWeek: 1.5, chains: ["A, B", "C & D"], sliders: {} };
  expect(parsePlanState(planHash(other))).toEqual(other);
});

test("round-trips planner limits in exponent notation", () => {
  const state = { budgetUsd: 1e21, hoursPerWeek: 1e22, chains: ["Base"], sliders: {} };
  expect(parsePlanState(planHash(state))).toEqual(state);
});

test("defaults invalid planner limits and accepts an empty chain selection", () => {
  for (const hash of ["#/plan", "#/plan?budget=NaN&hours=-1", "#/plan?budget=&hours=Infinity"]) {
    expect(parseRoute(hash)).toEqual({ page: "plan" });
    expect(parsePlanState(hash)).toEqual({
      budgetUsd: 5_000,
      hoursPerWeek: 3,
      chains: [],
      sliders: {},
    });
  }
  expect(parsePlanState("#/plan?budget=0&hours=0&chains=Base,Base")).toEqual({
    budgetUsd: 0,
    hoursPerWeek: 0,
    chains: ["Base"],
    sliders: {},
  });
});

test("recognizes Method and round-trips Census filters and sorting", () => {
  expect(parseRoute("#/method")).toEqual({ page: "method" });
  const state = { status: "traded", sort: "name", dir: "asc" } as const;
  expect(censusHash(state)).toBe("#/census?status=traded&sort=name&dir=asc");
  expect(parseRoute(censusHash(state))).toEqual({
    page: "census",
    state: { ...state, unranked: false },
  });
  expect(parseRoute(censusHash({ ...state, sort: "reason" }))).toEqual({
    page: "census",
    state: { ...state, sort: "reason", unranked: false },
  });
  expect(parseRoute("#/census?status=bad&sort=value&dir=bad")).toEqual({
    page: "census",
    state: { status: "", sort: "tvl", dir: "desc", unranked: false },
  });
  expect(censusHash({ status: "traded", sort: "tvl", dir: "desc" })).toBe("#/census?status=traded");
});

test("round-trips the five assumption settings and ignores invalid slider values", () => {
  const state = {
    budgetUsd: 5_000,
    hoursPerWeek: 3,
    chains: ["Base"],
    sliders: { share: 31, haircut: 0, rate: 75, yield: 12, carry: 4.5 },
  };
  expect(parsePlanState(planHash(state))).toEqual(state);
  expect(parsePlanState("#/plan?share=101&haircut=&rate=Infinity&yield=-1&carry=51")).toEqual({
    budgetUsd: 5_000,
    hoursPerWeek: 3,
    chains: [],
    sliders: {},
  });
});
