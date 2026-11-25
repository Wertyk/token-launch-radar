import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin, transformSync } from "esbuild";

// Supply numeric kernels and route setup through the browser API. Node uses the original imports.
const supportModules = {
  "domain/shared/order": ["compareText"],
  "domain/shared/math": ["clamp", "featureStats", "median"],
  "domain/valuation/huber": ["fitHuber"],
  "domain/valuation/linalg": ["diagonalPenalty"],
  "domain/launch-odds/logistic": ["fitLogistic", "linearScore", "sigmoid"],
  "presentation/web/route": ["isCensusSortKey", "isSortKey", "parseRoute"],
  "presentation/web/startup": ["boot"],
};
const support: Plugin = {
  name: "radar-support",
  setup(builder) {
    builder.onResolve({ filter: /\.ts$/ }, ({ path, resolveDir }) => {
      const root = resolve(process.cwd(), "src");
      const file = resolve(resolveDir, path);
      if (!file.startsWith(`${root}/`)) return;
      const key = file.slice(root.length + 1, -3);
      if (Object.hasOwn(supportModules, key)) return { path: key, namespace: "radar-support" };
    });
    builder.onLoad({ filter: /.*/, namespace: "radar-support" }, ({ path }) => {
      const note =
        path === "domain/shared/order"
          ? "//! Numeric kernels (weighted Cholesky least squares, Huber and logistic IRLS) ship in 5-extras.js.\n"
          : "";
      return {
        contents: `${note}export const { ${supportModules[path as keyof typeof supportModules].join(", ")} } = window.Radar?.support ?? {};`,
      };
    });
  },
};
const supportImports = Object.entries(supportModules).map(
  ([path, names]) => `import { ${names.join(", ")} } from "./src/${path}.ts";`,
);
const supportNames = Object.values(supportModules).flat().join(", ");

const bundles = [
  {
    stdin: {
      contents:
        'import { browserApi } from "./src/application/browser-api.ts";\nObject.assign(window.Radar ??= {}, browserApi);',
      resolveDir: process.cwd(),
    },
    outfile: "dashboard/2-core.js",
    plugins: [support],
    minifySyntax: true,
    minifyWhitespace: true,
    lineLimit: 120,
  },
  {
    entryPoints: ["src/presentation/web/main.ts"],
    outfile: "dashboard/3-ui.js",
    plugins: [support],
    minifySyntax: true,
    minifyWhitespace: true,
    lineLimit: 120,
  },
  {
    stdin: {
      contents: [
        'import "./src/presentation/web/extras.ts";',
        ...supportImports,
        'import { boardFarmSteps } from "./src/domain/farming/board-steps.ts";',
        'import { optimizePortfolio } from "./src/domain/farming/portfolio.ts";',
        `window.Radar.support = { ${supportNames} };`,
        "window.Radar.boardFarmSteps = (row) => boardFarmSteps(row, window.Radar);",
        "window.Radar.planPortfolio = (rows, options) => optimizePortfolio(rows, options, window.Radar);",
      ].join("\n"),
      resolveDir: process.cwd(),
    },
    outfile: "dashboard/5-extras.js",
  },
];
const biome = fileURLToPath(import.meta.resolve("@biomejs/biome/bin/biome"));
const config = fileURLToPath(new URL("../biome.json", import.meta.url));

function formatBundle(source: string, path: string): Buffer {
  // The generated module headers add paths to the dossier without affecting the script.
  const script = source
    .replace(/^\/\/ (?:(?:src\/|radar-support:)[\w./-]+|<stdin>)\n/gm, "")
    .replaceAll("/* @__PURE__ */ ", "");
  // A classic-script transform keeps top-level declaration names for the dossier guide.
  const formatted =
    path === "dashboard/3-ui.js"
      ? Buffer.from(script)
      : path === "dashboard/2-core.js"
        ? Buffer.from(
            transformSync(script, {
              minifyIdentifiers: true,
              minifyWhitespace: true,
              lineLimit: 140,
            }).code,
          )
        : execFileSync(
            process.execPath,
            [
              biome,
              "format",
              "--stdin-file-path=src/bundle.js",
              `--config-path=${config}`,
              "--indent-style=tab",
              "--line-width=200",
              "--semicolons=as-needed",
              "--trailing-commas=none",
              "--arrow-parentheses=as-needed",
              "--bracket-spacing=false",
            ],
            { input: script },
          );
  // The entry points assign Radar explicitly. The closure keeps all other bindings local.
  return Buffer.concat([Buffer.from("(() => {\n"), formatted, Buffer.from("})();\n")]);
}

const check = process.argv.includes("--check");
const outputs = await Promise.all(
  bundles.map(async (options) => {
    const result = await build({
      ...options,
      bundle: true,
      // These entries export no runtime values. The closure emits a classic script.
      format: "esm",
      target: "es2022",
      charset: "utf8",
      legalComments: "inline",
      sourcemap: false,
      write: false,
    });
    const [file] = result.outputFiles;
    if (!file) throw new Error(`No bundle produced for ${options.outfile}`);
    return {
      path: options.outfile,
      bytes: formatBundle(file.text, options.outfile),
    };
  }),
);

if (!check) mkdirSync("dashboard", { recursive: true });
for (const { path, bytes } of outputs) {
  if (!check) {
    writeFileSync(path, bytes);
    continue;
  }
  let existing: Buffer | undefined;
  try {
    existing = readFileSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!existing?.equals(bytes)) {
    console.error(`${path} is missing or out of date. Run pnpm build:web.`);
    process.exitCode = 1;
  }
}
