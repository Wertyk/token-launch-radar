import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ICruiseResult } from "dependency-cruiser";
import { expect, test } from "vitest";

const repo = new URL("../../", import.meta.url);
const cli = fileURLToPath(
  new URL("node_modules/dependency-cruiser/bin/dependency-cruiser.mjs", repo),
);
const config = fileURLToPath(new URL(".dependency-cruiser.cjs", repo));

const fixturePackage = {
  "node_modules/dev-fixture/package.json": '{"name":"dev-fixture","main":"index.js"}',
  "node_modules/dev-fixture/index.js": "exports.value = 1;",
};

function cruiseFixture(files: Record<string, string>, entry: string): ICruiseResult {
  const directory = mkdtempSync(join(tmpdir(), "radar-architecture-"));
  try {
    for (const [name, contents] of Object.entries({
      "package.json": '{"type":"module"}',
      ...files,
    })) {
      const path = join(directory, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents);
    }

    const output = execFileSync(
      process.execPath,
      [cli, "--config", config, "--output-type", "json", entry],
      { cwd: directory, encoding: "utf8" },
    );
    const result: ICruiseResult = JSON.parse(output);
    expect(
      result.modules.map((module) => module.source),
      `Dependency-cruiser did not scan ${entry}. Check its TypeScript parser with depcruise --info.`,
    ).toContain(entry);
    return result;
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

const violations = [
  {
    rule: "domain-imports-domain-only",
    entry: "src/domain/entry.ts",
    files: {
      "src/domain/entry.ts": 'import type { Input } from "../application/input.ts";',
      "src/application/input.ts": "export type Input = string;",
    },
  },
  {
    rule: "domain-imports-domain-only",
    entry: "src/domain/entry.ts",
    files: { "src/domain/entry.ts": 'import "node:fs";' },
  },
  {
    rule: "application-imports-core-only",
    entry: "src/application/entry.ts",
    files: {
      "src/application/entry.ts": 'import "../infrastructure/adapter.ts";',
      "src/infrastructure/adapter.ts": "export {};",
    },
  },
  {
    rule: "infrastructure-imports-adapter-dependencies-only",
    entry: "src/infrastructure/entry.ts",
    files: {
      "src/infrastructure/entry.ts": 'import "../presentation/web/view.ts";',
      "src/presentation/web/view.ts": "export {};",
    },
  },
  {
    rule: "web-imports-web-and-core-only",
    entry: "src/presentation/web/entry.ts",
    files: {
      "src/presentation/web/entry.ts": 'import type { Adapter } from "../../infrastructure/io.ts";',
      "src/infrastructure/io.ts": "export type Adapter = string;",
    },
  },
  {
    rule: "web-imports-web-and-core-only",
    entry: "src/presentation/web/entry.ts",
    files: { "src/presentation/web/entry.ts": 'import "node:fs";' },
  },
  {
    rule: "web-imports-core-types-only",
    entry: "src/presentation/web/entry.ts",
    files: {
      "src/presentation/web/entry.ts": 'import "../../application/controller.ts";',
      "src/application/controller.ts": "export {};",
    },
  },
  {
    rule: "web-imports-core-types-only",
    entry: "src/presentation/web/entry.ts",
    files: {
      "src/presentation/web/entry.ts": 'import { type Input, value } from "../../domain/input.ts";',
      "src/domain/input.ts": "export type Input = string; export const value = 1;",
    },
  },
  {
    rule: "vendor-is-infrastructure-only",
    entry: "tools/entry.ts",
    files: {
      "tools/entry.ts": 'import "../vendor/library.ts";',
      "vendor/library.ts": "export {};",
    },
  },
  {
    rule: "runtime-imports-no-packages",
    entry: "main.ts",
    files: { "main.ts": 'import "dev-fixture";', ...fixturePackage },
  },
  {
    rule: "runtime-imports-no-packages",
    entry: "src/entry.ts",
    files: { "src/entry.ts": 'import "dev-fixture";', ...fixturePackage },
  },
  {
    rule: "runtime-has-no-cycles",
    entry: "main.ts",
    files: {
      "main.ts": 'import "./src/entry.ts";',
      "src/entry.ts": 'import "../main.ts";',
    },
  },
];

test.each(violations)("$rule rejects $entry", ({ rule, entry, files }) => {
  const { summary } = cruiseFixture(files, entry);
  expect(summary.advisedExitCode).toBeGreaterThan(0);
  expect(new Set(summary.violations.map(({ rule }) => rule.name))).toEqual(new Set([rule]));
  expect(summary.violations.every(({ rule }) => rule.severity === "error")).toBe(true);
});

test("allows a clean architecture", () => {
  const { summary } = cruiseFixture(
    {
      "tools/entry.ts": 'import "dev-fixture"; import "../main.ts";',
      "main.ts":
        'import "./src/infrastructure/adapter.ts"; import "./src/presentation/web/view.ts";',
      "src/infrastructure/adapter.ts": [
        'import "node:fs";',
        'import "./io.ts";',
        'import "../application/service.ts";',
        'import "../domain/model.ts";',
        'import "../../vendor/library.ts";',
      ].join("\n"),
      "src/infrastructure/io.ts": "export {};",
      "src/application/service.ts": 'import "../domain/model.ts"; export type Port = string;',
      "src/domain/model.ts": 'import "./value.ts"; export type Model = string;',
      "src/domain/value.ts": "export {};",
      "src/presentation/web/view.ts": [
        'import type { Model } from "../../domain/model.ts";',
        'import type { Port } from "../../application/service.ts";',
        'import "./render.ts";',
        "export type View = [Model, Port];",
      ].join("\n"),
      "src/presentation/web/render.ts": "export {};",
      "vendor/library.ts": "export {};",
      ...fixturePackage,
    },
    "tools/entry.ts",
  );

  expect(summary.totalDependenciesCruised).toBe(14);
  expect(summary.violations).toEqual([]);
  expect(summary.advisedExitCode).toBe(0);
});
