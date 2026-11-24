import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = new URL("../../", import.meta.url);
const script = fileURLToPath(new URL("tools/build-web.ts", root));

test("checks the generated bundles byte for byte without writing them", () => {
  const cwd = mkdtempSync(join(tmpdir(), "radar-web-"));
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });

  try {
    cpSync(new URL("src/", root), join(cwd, "src"), { recursive: true });
    expect(run("--check").status).toBe(1);
    const build = run();
    expect(build.status, build.stderr).toBe(0);
    expect(run("--check").status).toBe(0);

    const core = readFileSync(join(cwd, "dashboard/2-core.js"), "utf8");
    expect(core).not.toMatch(
      /fitCategoryModel|categoryGroup|categoryPenalty|selectLambda|fitLaunchClock|pava/,
    );
    expect(core).not.toMatch(/parseSnapshot|duplicate slug|Log the supply rate|Ethereum:\[3,8\]/);

    const bundle = join(cwd, "dashboard/3-ui.js");
    const original = readFileSync(bundle, "utf8");
    appendFileSync(bundle, "\n// Changed bundle\n");
    const check = run("--check");
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("3-ui.js");
    expect(readFileSync(bundle, "utf8")).toContain("// Changed bundle");

    const rebuild = run();
    expect(rebuild.status, rebuild.stderr).toBe(0);
    expect(readFileSync(bundle, "utf8")).toBe(original);
    expect(run("--check").status).toBe(0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("keeps the guide, design tokens and browser bundles within the judge's source budget", () => {
  const bytes = ["0-guide.md", "1-tokens.css", "2-core.js", "3-ui.js"].reduce(
    (total, file) => total + readFileSync(new URL(`dashboard/${file}`, root)).length,
    0,
  );
  expect(bytes).toBeLessThanOrEqual(64_850);
});

test("keeps the judge's guide within 1,900 bytes and free of URLs", () => {
  const guide = readFileSync(new URL("dashboard/0-guide.md", root));
  expect(guide.length).toBeLessThanOrEqual(1_900);
  expect(guide.toString("utf8")).not.toMatch(/https?:\/\//i);
});

test("keeps the handwritten design tokens within 1.5 KB", () => {
  expect(readFileSync(new URL("dashboard/1-tokens.css", root)).length).toBeLessThanOrEqual(1_500);
});
