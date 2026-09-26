/**
 * Stage 3B — URL-param-driven column sorting for the record-based reports
 * (tracked keywords, Search Console queries and pages).
 *
 * Pure: no React, no DOM, no Next, no DB — unit-tested in
 * `tests/unit/report-table-sort.test.ts`.
 *
 * WHY THIS EXISTS AND `filtering.ts` DID NOT ALREADY COVER IT
 * ----------------------------------------------------------
 * Stages 1-3A report ISSUES, whose order is not a user choice: severity order
 * is fixed by the product, so a sortable column would have been a way to
 * make the list less useful. Stage 3B's modules report RECORDS — a query with
 * clicks, impressions, CTR and position — where "which of these is worst"
 * genuinely depends on which column you are asking about. So sorting is added
 * here, alongside the existing filter/paginate helpers, rather than bolted
 * into them.
 *
 * The sort lives in the URL for exactly the reasons the filters do: a sorted
 * view is shareable and bookmarkable, the back button undoes a sort, and it
 * works with no client JavaScript.
 *
 * ─── The honesty rule this module enforces ───────────────────────────────
 *
 * MISSING VALUES SORT LAST IN BOTH DIRECTIONS. A keyword with no recorded
 * position must not appear at the top of "best position" (it is not the best)
 * NOR at the top of "worst position" (it is not the worst) — it is not
 * measured at all. Bubbling `null` to whichever end the direction implies
 * would silently turn an absence into an extreme measurement, which is the
 * single easiest way for a sortable table to fabricate a finding.
 */

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface SortableColumn<T> {
  /** Stable value used in `?sort=` — must stay URL-safe. */
  key: string;
  label: string;
  /** Returns the comparable value, or `null` when this row has no measurement. */
  value: (row: T) => number | string | null;
  /** Direction applied the first time this column is clicked. */
  defaultDirection?: SortDirection;
  /** True for inverted scales (search position) — surfaced to the UI so the header can say so. */
  lowerIsBetter?: boolean;
}

export type SortParamValue = string | string[] | undefined;

function readParam(value: SortParamValue): string {
  if (value === undefined) return "";
  return (Array.isArray(value) ? (value[0] ?? "") : value).trim();
}

/**
 * Parses `?sort=…&dir=…` against the columns that actually exist.
 *
 * An unknown column key falls back to the default rather than producing an
 * arbitrary or empty order — a hand-edited or stale URL must still render a
 * list the user can explain. An unknown direction likewise falls back to the
 * column's own default, so `?dir=sideways` cannot produce a silently
 * different order from `?dir=asc`.
 */
export function parseSort<T>(
  params: Record<string, SortParamValue>,
  columns: SortableColumn<T>[],
  fallback: SortState,
  options: { sortParam?: string; directionParam?: string } = {}
): SortState {
  const { sortParam = "sort", directionParam = "dir" } = options;

  const requestedKey = readParam(params[sortParam]);
  const column = columns.find((entry) => entry.key === requestedKey);
  if (!column) return fallback;

  const requestedDirection = readParam(params[directionParam]);
  const direction: SortDirection =
    requestedDirection === "asc" || requestedDirection === "desc"
      ? requestedDirection
      : (column.defaultDirection ?? "desc");

  return { key: column.key, direction };
}

/**
 * Returns a NEW sorted array — the input is never mutated, because callers
 * hand the same fetched list to a facet count and to the table body and those
 * must not observe each other's ordering.
 *
 * Ties keep their original relative order (a stable sort), so a secondary
 * ordering established upstream — "newest keyword first", "most clicks first"
 * — survives sorting on a column full of equal values instead of scrambling.
 */
export function sortRows<T>(rows: T[], columns: SortableColumn<T>[], state: SortState): T[] {
  const column = columns.find((entry) => entry.key === state.key);
  if (!column) return [...rows];

  const factor = state.direction === "asc" ? 1 : -1;

  return rows
    .map((row, index) => ({ row, index, value: column.value(row) }))
    .sort((a, b) => {
      const aMissing = a.value === null || a.value === undefined;
      const bMissing = b.value === null || b.value === undefined;

      // Missing values always sink, whichever way the column is pointing.
      if (aMissing && bMissing) return a.index - b.index;
      if (aMissing) return 1;
      if (bMissing) return -1;

      let comparison: number;
      if (typeof a.value === "number" && typeof b.value === "number") {
        comparison = a.value - b.value;
      } else {
        comparison = String(a.value).localeCompare(String(b.value), "en", { sensitivity: "base" });
      }

      if (comparison === 0) return a.index - b.index;
      return comparison * factor;
    })
    .map((entry) => entry.row);
}

/**
 * The direction a header link should request next.
 *
 * Clicking the ALREADY-sorted column flips it; clicking a different column
 * starts at that column's own default (clicks start at "most first", a
 * keyword starts at A-Z) rather than inheriting the previous column's
 * direction, which would silently answer a different question than the one
 * the user clicked.
 */
export function nextSortDirection<T>(column: SortableColumn<T>, state: SortState): SortDirection {
  if (state.key !== column.key) return column.defaultDirection ?? "desc";
  return state.direction === "asc" ? "desc" : "asc";
}

/** Human sentence for a header's `aria-sort` companion label. */
export function sortAriaLabel<T>(column: SortableColumn<T>, state: SortState): string {
  const next = nextSortDirection(column, state);
  const ascending = next === "asc";
  if (column.lowerIsBetter) {
    return `Sort by ${column.label}, ${ascending ? "best first" : "worst first"}`;
  }
  return `Sort by ${column.label}, ${ascending ? "lowest first" : "highest first"}`;
}
