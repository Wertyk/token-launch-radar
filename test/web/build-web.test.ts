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

    const core = readFileSync(join(cwd, "dashboard/1-core.js"), "utf8");
    expect(core).not.toMatch(/fitCategoryModel|categoryGroup|categoryPenalty|selectLambda/);

    const bundle = join(cwd, "dashboard/2-ui.js");
    const original = readFileSync(bundle, "utf8");
    appendFileSync(bundle, "\n// Changed bundle\n");
    const check = run("--check");
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("2-ui.js");
    expect(readFileSync(bundle, "utf8")).toContain("// Changed bundle");

    const rebuild = run();
    expect(rebuild.status, rebuild.stderr).toBe(0);
    expect(readFileSync(bundle, "utf8")).toBe(original);
    expect(run("--check").status).toBe(0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
