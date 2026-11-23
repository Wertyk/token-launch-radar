import { runRadar } from "./src/application/run-radar.ts";
import { parseCliArgs } from "./src/infrastructure/cli-args.ts";
import { FsOutputSink } from "./src/infrastructure/fs-output-sink.ts";
import { FsSnapshotSource } from "./src/infrastructure/fs-snapshot-source.ts";
import { MakefunDossier } from "./src/infrastructure/makefun-dossier.ts";

try {
  const { input, output, assets } = parseCliArgs(
    process.argv.slice(2),
    process.env,
    import.meta.dirname,
  );
  const summary = runRadar(
    new FsSnapshotSource(input),
    new FsOutputSink(output, assets),
    new MakefunDossier(output),
  );
  const files = summary.files.join(", ").replace(/[\r\n]+/g, " ");
  console.log(
    `token radar: ${summary.rowCount} rows, ${summary.watchlistCovered} watchlist entries covered, wrote ${files}`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`token radar: ${message.replace(/[\r\n]+/g, " ")}`);
  process.exitCode = 1;
}
