import { expect, test } from "vitest";
import { parseCliArgs } from "../../src/infrastructure/cli-args.ts";

const defaultAssets = "/bot";

test("defaults to the sandbox paths and the supplied main.ts directory", () => {
  expect(parseCliArgs([], {}, defaultAssets)).toEqual({
    input: "/input",
    output: "/output",
    assets: defaultAssets,
  });
});

test("uses MAKEFUN_OUTPUT_DIR when no output flag is provided", () => {
  expect(parseCliArgs([], { MAKEFUN_OUTPUT_DIR: "from-env" }, defaultAssets).output).toBe(
    "from-env",
  );
});

test.each([
  ["--input", "snapshot.json", "--output", "dest", "--assets", "fixtures"],
  ["--input=snapshot.json", "--output=dest", "--assets=fixtures"],
])("accepts the path options in either form (%#)", (...argv) => {
  expect(parseCliArgs(argv, { MAKEFUN_OUTPUT_DIR: "from-env" }, defaultAssets)).toEqual({
    input: "snapshot.json",
    output: "dest",
    assets: "fixtures",
  });
});

test.each([
  { argv: ["--input"], message: "--input requires a path" },
  { argv: ["--output="], message: "--output requires a path" },
  { argv: ["--assets", "--input=fixture.json"], message: "--assets requires a path" },
  { argv: ["--unknown"], message: "Unknown argument --unknown" },
])("rejects invalid arguments ($message)", ({ argv, message }) => {
  expect(() => parseCliArgs(argv, {}, defaultAssets)).toThrow(message);
});
