import { expect, test } from "vitest";
import {
  boardHash,
  defaultState,
  parseRoute,
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
