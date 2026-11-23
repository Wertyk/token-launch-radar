import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { MakefunDossier } from "../../src/infrastructure/makefun-dossier.ts";
import { buildDossier } from "../../vendor/makefun-board.ts";
import { dossierCaps, writeAssetFixture } from "../radar-fixtures.ts";

test("returns exactly the vendor dossier bytes for the output directory", () => {
  const root = mkdtempSync(join(tmpdir(), "radar-dossier-"));
  try {
    writeAssetFixture(root);
    expect(new MakefunDossier(root).build()).toEqual(buildDossier(root, dossierCaps));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
