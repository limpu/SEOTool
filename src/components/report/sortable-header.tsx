import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { buildQueryString } from "./filtering";
import { nextSortDirection, sortAriaLabel, type SortState, type SortableColumn } from "./table-sort";

/**
 * A `<th>` whose label is a real link that re-sorts the table.
 *
 * Server Component and a plain `<Link>` on purpose: sorting is URL state, so
 * a sorted table is shareable, the back button undoes a sort, and the control
 * works before hydration and with JavaScript off. There is no click handler
 * and no client bundle cost.
 *
 * Accessibility: the `<th>` carries a real `aria-sort` so assistive tech
 * announces the current order, and the direction is shown by an arrow ICON
 * plus the accessible name ("Sort by Position, best first") — never by
 * colour, and never by the arrow alone.
 */
export function SortableHeader<T>({
  column,
  state,
  basePath,
  params,
  numeric,
  sortParam = "sort",
  directionParam = "dir",
}: {
  column: SortableColumn<T>;
  state: SortState;
  basePath: string;
  /** Every other active URL param, so sorting never silently drops a filter. */
  params: Record<string, string | string[] | number | undefined>;
  numeric?: boolean;
  sortParam?: string;
  directionParam?: string;
}) {
  const active = state.key === column.key;
  const direction = nextSortDirection(column, state);

  const href = `${basePath}${buildQueryString({
    ...params,
    [sortParam]: column.key,
    [directionParam]: direction,
    // Re-sorting returns to page 1 — page 7 of a re-ordered list shows rows
    // the user never asked to see and reads as a broken jump.
    page: undefined,
  })}`;

  const Icon = active ? (state.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <TableHead
      numeric={numeric}
      aria-sort={active ? (state.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={href}
        aria-label={sortAriaLabel(column, state)}
        className={`inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          active ? "font-semibold text-foreground" : ""
        }`}
      >
        {numeric && <Icon className={`h-3 w-3 shrink-0 ${active ? "" : "text-muted"}`} aria-hidden="true" />}
        {column.label}
        {!numeric && <Icon className={`h-3 w-3 shrink-0 ${active ? "" : "text-muted"}`} aria-hidden="true" />}
      </Link>
    </TableHead>
  );
}
