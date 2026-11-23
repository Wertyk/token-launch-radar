import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const bundles = [
  {
    entry: "src/application/browser-api.ts",
    outfile: "dashboard/1-core.js",
    globalName: "Radar",
  },
  {
    entry: "src/presentation/web/main.ts",
    outfile: "dashboard/2-ui.js",
  },
];
const check = process.argv.includes("--check");
const outputs = await Promise.all(
  bundles.map(async ({ entry, ...options }) => {
    const result = await build({
      ...options,
      entryPoints: [entry],
      bundle: true,
      format: "iife",
      target: "es2022",
      charset: "utf8",
      minify: false,
      sourcemap: false,
      write: false,
    });
    const [file] = result.outputFiles;
    if (!file) throw new Error(`No bundle produced for ${entry}`);
    return { path: options.outfile, bytes: Buffer.from(file.contents) };
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
