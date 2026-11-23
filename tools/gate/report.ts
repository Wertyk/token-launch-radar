import { dossierLimit, json, record, textLimit } from "./checks.ts";
import { imageDimensions } from "./image.ts";

function sourceSections(source: string): Map<string, string> {
  const sections = new Map<string, string>();
  let rest = source;
  // Skip entire fenced blocks so headings or cut notices in the source are never parsed as metadata.
  while (rest.startsWith("### ")) {
    const heading = /^### ([^\n]+)\n\n(\d+) bytes, \d+ lines?\n\n?/.exec(rest);
    const path = heading?.[1];
    if (!path) break;
    rest = rest.slice(heading[0].length);
    if (heading[2] !== "0") {
      const open = /^(`{3,})[a-z]+\n/.exec(rest);
      if (!open) break;
      const close = `\n${open[1]}\n`;
      const end = rest.indexOf(close, open[0].length);
      if (end < 0) break;
      rest = rest.slice(end + close.length);
    }
    rest = rest.replace(/^\n+/, "");
    const cut = /^\[(\d+) of this file's (\d+) lines not shown\.\]\n/.exec(rest);
    sections.set(path, cut ? `cut (${cut[1]} of ${cut[2]} lines not shown)` : "shown whole");
    if (cut) break;
  }
  return sections;
}

export function dossierReport(bytes: Buffer): string[] {
  const { text, images } = record(json(bytes));
  if (typeof text !== "string" || !Array.isArray(images)) {
    throw new Error("dossier.json needs text and images");
  }
  const used = Buffer.byteLength(text);
  const lines = [`text: ${used} bytes, ${textLimit - used} bytes of headroom to ${textLimit}`];

  const sourceHeading = "\n## Source\n\n";
  const boundary = text.indexOf(sourceHeading);
  const inventory = boundary < 0 ? text : text.slice(0, boundary);
  const source = boundary < 0 ? "" : text.slice(boundary + sourceHeading.length);
  const sections = sourceSections(source);
  for (const entry of inventory.matchAll(/^- (.+) \(\d+ bytes\)$/gm)) {
    const path = entry[1] ?? "";
    lines.push(`dashboard/${path} ${sections.get(path) ?? "dropped"}`);
  }

  for (const image of images) {
    const { name, base64 } = record(image);
    if (typeof base64 !== "string" || typeof name !== "string") continue;
    const contents = Buffer.from(base64, "base64");
    const dimensions = imageDimensions(contents);
    const size = dimensions ? `${dimensions.width}×${dimensions.height}` : "dimensions unavailable";
    lines.push(`${name} ${contents.length} bytes, ${size}`);
  }
  return lines;
}

export function dossierSize(size: number): string {
  return `dossier.json: ${size} / ${dossierLimit} bytes`;
}
