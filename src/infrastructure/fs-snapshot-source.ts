import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SnapshotSource } from "../application/ports.ts";

export class FsSnapshotSource implements SnapshotSource {
  readonly #input: string;

  constructor(input: string) {
    this.#input = input;
  }

  load(): unknown {
    let path = this.#input;
    try {
      if (statSync(path).isDirectory()) path = join(path, "snapshot.json");
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Could not load snapshot at ${path}: ${message}`, { cause });
    }
  }
}
