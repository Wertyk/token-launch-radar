import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { OutputSink } from "../application/ports.ts";
import { compareText } from "../domain/shared/order.ts";

function entryAt(path: string) {
  return lstatSync(path, { throwIfNoEntry: false });
}

function staysInside(localPath: string): boolean {
  return !isAbsolute(localPath) && localPath !== ".." && !localPath.startsWith(`..${sep}`);
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
  if (!entryAt(path)?.isDirectory()) throw new Error(`${path} is not a plain directory`);
}

function replaceFile(destination: string, write: (path: string) => void): void {
  // Rename into place so an existing file link cannot redirect the write.
  const staging = mkdtempSync(join(dirname(destination), ".radar-"));
  try {
    const file = join(staging, "file");
    write(file);
    renameSync(file, destination);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export class FsOutputSink implements OutputSink {
  readonly #root: string;
  readonly #assets: string;

  constructor(root: string, assets: string) {
    this.#root = resolve(root);
    this.#assets = resolve(assets);
  }

  write(relativePath: string, contents: string | Uint8Array): void {
    const destination = resolve(this.#root, relativePath);
    const localPath = relative(this.#root, destination);
    if (isAbsolute(relativePath) || !localPath || !staysInside(localPath)) {
      throw new Error(`Invalid output path ${relativePath}`);
    }

    ensureDirectory(this.#root);
    let directory = this.#root;
    const parts = localPath.split(sep).slice(0, -1);
    for (const part of parts) {
      directory = join(directory, part);
      ensureDirectory(directory);
    }
    replaceFile(destination, (file) => writeFileSync(file, contents));
  }

  publishAssets(): string[] {
    ensureDirectory(this.#root);
    const root = realpathSync.native(this.#root);
    const directories = ["dashboard", "screenshots"];
    const destinations = directories.map((directory) => {
      const path = join(root, directory);
      const entry = entryAt(path);
      if (entry && !entry.isDirectory()) throw new Error(`${path} is not a plain directory`);
      return { path, canonicalPath: entry ? realpathSync.native(path) : path };
    });

    const sources: { directory: string; source: string }[] = [];
    for (const directory of directories) {
      const path = join(this.#assets, directory);
      const entry = entryAt(path);
      if (!entry) continue;
      if (!entry.isDirectory()) throw new Error(`${path} is not a plain directory`);
      const source = realpathSync.native(path);
      if (staysInside(relative(source, root))) {
        throw new Error(`Output root ${this.#root} is inside asset directory ${path}`);
      }
      if (destinations.some(({ canonicalPath }) => staysInside(relative(canonicalPath, source)))) {
        throw new Error(`Asset directory ${path} is inside an output asset directory`);
      }
      sources.push({ directory, source });
    }

    // Clear the two published trees after validating every source and destination.
    for (const { path } of destinations) rmSync(path, { recursive: true, force: true });

    const files: string[] = [];
    for (const { directory, source } of sources) this.#copyDirectory(source, directory, files);
    return files;
  }

  #copyDirectory(source: string, path: string, files: string[]): void {
    const destination = join(this.#root, path);
    ensureDirectory(destination);
    const entries = readdirSync(source, { withFileTypes: true }).sort((a, b) =>
      compareText(a.name, b.name),
    );
    for (const entry of entries) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) throw new Error(`${child} is a dot-directory`);
        this.#copyDirectory(join(source, entry.name), child, files);
      } else if (entry.isFile()) {
        if (entry.name.startsWith(".")) continue;
        replaceFile(join(destination, entry.name), (file) =>
          copyFileSync(join(source, entry.name), file),
        );
        files.push(child);
      } else {
        throw new Error(`${child} is neither a regular file nor a directory`);
      }
    }
  }
}
