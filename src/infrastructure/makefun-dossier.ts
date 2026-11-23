import { buildDossier } from "../../vendor/makefun-board.ts";
import type { DossierBuilder } from "../application/ports.ts";

export class MakefunDossier implements DossierBuilder {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  build(): Uint8Array {
    return buildDossier(this.#root, {
      text_max_bytes: 65_536,
      screenshots: { max: 4, max_bytes: 524_288 },
      dashboard: { max_files: 400, max_bytes: 4_194_304 },
    });
  }
}
