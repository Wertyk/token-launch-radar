import { escapeHtml as esc } from "./format.ts";

interface TableOptions {
  className?: string;
  sort?: string;
  dir?: "asc" | "desc";
  linked?: boolean;
  empty?: string;
  total?: readonly string[];
}

type Cells = readonly string[];

// Cells are HTML. Escape snapshot text at the call site, where links and plain text are distinct.
export function tableBody(
  rows: readonly Cells[],
  columns: number,
  options: TableOptions = {},
): string {
  if (!rows.length && options.empty) {
    return `<tr><td colspan="${columns}" class="empty">${esc(options.empty)}</td></tr>`;
  }
  return rows
    .map(
      (row) =>
        `<tr${options.linked ? " data-protocol" : ""}><td>${row.join("</td><td>")}</td></tr>`,
    )
    .join("");
}

export function table(
  headers: readonly (string | readonly [key: string, label: string])[],
  rows: readonly Cells[],
  options: TableOptions = {},
): string {
  const head = headers.map((header) => {
    if (typeof header === "string") return `<th scope="col">${esc(header)}</th>`;
    const [key, label] = header;
    const direction = options.dir === "desc" ? "descending" : "ascending";
    return `<th scope="col"${options.sort === key ? ` aria-sort="${direction}"` : ""}><button type="button" data-sort="${esc(key)}">${esc(label)}</button></th>`;
  });
  const [label, ...totals] = options.total ?? [];
  const foot =
    label === undefined
      ? ""
      : `<tfoot><tr><th scope="row">${label}</th><td>${totals.join("</td><td>")}</td></tr></tfoot>`;
  return `<table${options.className ? ` class="${options.className}"` : ""}><thead><tr>${head.join("")}</tr></thead><tbody>${tableBody(rows, headers.length, options)}</tbody>${foot}</table>`;
}

export function svg(width: number, height: number, content: string): string {
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${content}</svg>`;
}
