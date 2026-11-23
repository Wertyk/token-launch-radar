const domain = "^src/domain/";
const application = "^src/application/";
const infrastructure = "^src/infrastructure/";
const web = "^src/presentation/web/";
const vendor = "^vendor/";
const runtime = "^(?:main\\.ts$|src/)";
const packages = "(^|/)node_modules/";

const config = {
  forbidden: [
    {
      name: "domain-imports-domain-only",
      severity: "error",
      from: { path: domain },
      to: { pathNot: domain },
    },
    {
      name: "application-imports-core-only",
      severity: "error",
      from: { path: application },
      to: { pathNot: [application, domain] },
    },
    {
      name: "infrastructure-imports-adapter-dependencies-only",
      severity: "error",
      from: { path: infrastructure },
      to: { pathNot: [infrastructure, application, domain, vendor], dependencyTypesNot: ["core"] },
    },
    {
      name: "web-imports-web-and-core-only",
      severity: "error",
      from: { path: web },
      to: { pathNot: [web, application, domain] },
    },
    {
      name: "web-imports-core-types-only",
      severity: "error",
      from: { path: web },
      to: { path: [application, domain], dependencyTypesNot: ["type-only"] },
    },
    {
      name: "vendor-is-infrastructure-only",
      severity: "error",
      from: { pathNot: [infrastructure, "^tools/gate(?:\\.ts$|/)"] },
      to: { path: vendor },
    },
    {
      name: "runtime-imports-no-packages",
      severity: "error",
      from: { path: runtime },
      to: { path: packages },
    },
    {
      name: "runtime-has-no-cycles",
      severity: "error",
      from: { path: runtime },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: packages },
    tsPreCompilationDeps: true,
  },
};

module.exports = config;

async function runArchitectureCheck() {
  const { existsSync, readdirSync } = require("node:fs");
  const { allExtensions, cruise } = await import("dependency-cruiser");
  const roots = ["main.ts", "src", "tools"].filter((path) => existsSync(path));
  if (roots.length === 0) return;

  // Dependency-cruiser can report success after silently ignoring all TypeScript files.
  if (!allExtensions.some(({ extension, available }) => extension === ".ts" && available)) {
    const hasTypeScript = roots.some(
      (path) =>
        path === "main.ts" ||
        readdirSync(path, { recursive: true, withFileTypes: true }).some(
          (entry) => entry.isFile() && /\.(?:[cm]?ts|tsx)$/.test(entry.name),
        ),
    );
    if (hasTypeScript) {
      throw new Error(
        "Dependency-cruiser has no compatible TypeScript parser. Run pnpm exec depcruise --info.",
      );
    }
  }

  const { options, ...ruleSet } = config;
  const result = await cruise(roots, { ...options, ruleSet, validate: true, outputType: "err" });
  process.stdout.write(result.output);
  process.exitCode = result.exitCode;
}

if (require.main === module) {
  runArchitectureCheck().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
