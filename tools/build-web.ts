import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundles = [
  {
    stdin: {
      contents:
        'import { browserApi } from "./src/application/browser-api.ts";\nwindow.Radar = browserApi;',
      resolveDir: process.cwd(),
    },
    outfile: "dashboard/2-core.js",
  },
  {
    entryPoints: ["src/presentation/web/main.ts"],
    outfile: "dashboard/3-ui.js",
  },
  {
    stdin: {
      contents: [
        'import { boardFarmSteps } from "./src/domain/farming/board-steps.ts";',
        'import { optimizePortfolio } from "./src/domain/farming/portfolio.ts";',
        'import "./src/presentation/web/extras.ts";',
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

function formatBundle(source: string): Buffer {
  // The generated module headers add paths to the dossier without affecting the script.
  const script = source
    .replace(/^\/\/ (?:src\/[\w./-]+\.ts|<stdin>)\n/gm, "")
    .replaceAll("/* @__PURE__ */ ", "");
  const formatted = execFileSync(
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
    return { path: options.outfile, bytes: formatBundle(file.text) };
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
