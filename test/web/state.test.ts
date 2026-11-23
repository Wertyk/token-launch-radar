import { expect, test } from "vitest";
import {
  boardHash,
  censusHash,
  defaultState,
  parseRoute,
  planHash,
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

test("recognizes unknown paths and malformed slug escapes", () => {
  for (const hash of ["#/about", "#/p/", "#/p/a/b", "#/p/%ZZ"]) {
    expect(parseRoute(hash)).toEqual({ page: "unknown", state: defaultState });
  }
});

test("round-trips the planner budget, hours and selected chains", () => {
  const state = { budgetUsd: 5_000, hoursPerWeek: 3, chains: ["Base", "Solana"], sliders: {} };
  expect(planHash(state)).toBe("#/plan?budget=5000&hours=3&chains=Base,Solana");
  expect(parseRoute(planHash(state))).toEqual({ page: "plan", state });

  const other = { budgetUsd: 0, hoursPerWeek: 1.5, chains: ["A, B", "C & D"], sliders: {} };
  expect(parseRoute(planHash(other))).toEqual({ page: "plan", state: other });
});

test("round-trips planner limits in exponent notation", () => {
  const state = { budgetUsd: 1e21, hoursPerWeek: 1e22, chains: ["Base"], sliders: {} };
  expect(parseRoute(planHash(state))).toEqual({ page: "plan", state });
});

test("defaults invalid planner limits and accepts an empty chain selection", () => {
  for (const hash of ["#/plan", "#/plan?budget=NaN&hours=-1", "#/plan?budget=&hours=Infinity"]) {
    expect(parseRoute(hash)).toEqual({
      page: "plan",
      state: { budgetUsd: 5_000, hoursPerWeek: 3, chains: [], sliders: {} },
    });
  }
  expect(parseRoute("#/plan?budget=0&hours=0&chains=Base,Base")).toEqual({
    page: "plan",
    state: { budgetUsd: 0, hoursPerWeek: 0, chains: ["Base"], sliders: {} },
  });
});

test("recognizes Method and round-trips Census filters and sorting", () => {
  expect(parseRoute("#/method")).toEqual({ page: "method" });
  const state = { status: "traded", sort: "name", dir: "asc" } as const;
  expect(censusHash(state)).toBe("#/census?status=traded&sort=name&dir=asc");
  expect(parseRoute(censusHash(state))).toEqual({ page: "census", state });
  expect(parseRoute(censusHash({ ...state, sort: "reason" }))).toEqual({
    page: "census",
    state: { ...state, sort: "reason" },
  });
  expect(parseRoute("#/census?status=bad&sort=value&dir=bad")).toEqual({
    page: "census",
    state: { status: "", sort: "tvl", dir: "desc" },
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
  expect(parseRoute(planHash(state))).toEqual({ page: "plan", state });
  expect(parseRoute("#/plan?share=101&haircut=&rate=Infinity&yield=-1&carry=51")).toEqual({
    page: "plan",
    state: { budgetUsd: 5_000, hoursPerWeek: 3, chains: [], sliders: {} },
  });
});
