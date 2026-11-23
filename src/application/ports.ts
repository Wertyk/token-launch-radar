export interface SnapshotSource {
  load(): unknown;
}

export interface OutputSink {
  write(relativePath: string, contents: string | Uint8Array): void;
  publishAssets(): string[];
}

export interface DossierBuilder {
  build(): Uint8Array;
}
