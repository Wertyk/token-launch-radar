import type { BoardRow } from "./board.ts";

export function serializeBoard(rows: readonly BoardRow[], format: "csv" | "json"): string {
  if (format === "json") return JSON.stringify(rows);
  const quote = (value: unknown) => {
    const text = Array.isArray(value) ? JSON.stringify(value) : String(value ?? "");
    const safe = typeof value === "string" && /^[=+@-]/.test(text.trimStart()) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const headers = Object.keys(rows[0] ?? {});
  return [headers, ...rows.map((row) => Object.values(row))]
    .map((cells) => cells.map(quote).join(","))
    .join("\r\n");
}
