import type { BoardRow } from "./board.ts";

export function serializeBoard(
  rows: readonly BoardRow[],
  format: "csv" | "json",
  depositUsd: number,
): string {
  const exported = rows.map((row) => ({ ...row, depositUsd }));
  if (format === "json") return JSON.stringify(exported);
  const quote = (value: unknown) => {
    const text = Array.isArray(value) ? JSON.stringify(value) : String(value ?? "");
    const safe = typeof value === "string" && /^[=+@-]/.test(text.trimStart()) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const headers = Object.keys(exported[0] ?? {});
  return [headers, ...exported.map((row) => Object.values(row))]
    .map((cells) => cells.map(quote).join(","))
    .join("\r\n");
}
