import { Search } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/report/pagination";
import { ReportSearchForm } from "@/components/report/report-search-form";
import { SortableHeader } from "@/components/report/sortable-header";
import { CopyButton } from "@/components/report/copy-button";
import { PositionScaleNote, PositionValue } from "@/components/report/position-display";
import { POSITION_HINT } from "@/components/report/position";
import { buildQueryString, paginate, type SearchParamsLike } from "@/components/report/filtering";
import { parseSort, sortRows, type SortableColumn } from "@/components/report/table-sort";
import { formatRatioAsPercent, shortenUrl } from "@/components/charts/format";

import type { GscRow, GscTotals } from "./data";

const PER_PAGE = 50;

/**
 * The Queries and Pages tabs are the SAME table over two different dimensions,
 * so it is written once here rather than twice — the same discipline Stage 2
 * applied to `ReportIssuesPage`. The two routes differ only in which rows they
 * pass, what the first column is called, and whether that column renders a URL.
 *
 * Search, sort and page are all URL state. The position column is
 * inverted-scale: sorted ascending it puts the BEST rank first, and its header
 * says "best first" in its accessible name rather than "lowest first".
 */
export function GscDimensionTable({
  rows,
  totals,
  basePath,
  dimensionLabel,
  isUrl,
  dateRangeStart,
  dateRangeEnd,
  searchParams,
  note,
}: {
  rows: GscRow[];
  totals: GscTotals;
  basePath: string;
  dimensionLabel: string;
  /** True for the page dimension — renders a shortened, copyable, openable URL. */
  isUrl?: boolean;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  searchParams: SearchParamsLike;
  note?: string;
}) {
  const columns: SortableColumn<GscRow>[] = [
    { key: "value", label: dimensionLabel, value: (row) => row.dimensionValue, defaultDirection: "asc" },
    { key: "clicks", label: "Clicks", value: (row) => row.clicks, defaultDirection: "desc" },
    { key: "impressions", label: "Impressions", value: (row) => row.impressions, defaultDirection: "desc" },
    { key: "ctr", label: "CTR", value: (row) => row.ctr, defaultDirection: "desc" },
    {
      key: "position",
      label: "Position",
      value: (row) => row.position,
      defaultDirection: "asc",
      lowerIsBetter: true,
    },
  ];

  const query = (() => {
    const raw = searchParams.q;
    return (Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "")).trim();
  })();

  const pageRaw = Number.parseInt(
    (Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) ?? "",
    10
  );
  const requestedPage = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const sort = parseSort(searchParams, columns, { key: "clicks", direction: "desc" });

  const needle = query.toLowerCase();
  const filtered = needle
    ? rows.filter((row) => row.dimensionValue.toLowerCase().includes(needle))
    : rows;

  const sorted = sortRows(filtered, columns, sort);
  const slice = paginate(sorted, requestedPage, PER_PAGE);

  const params = { q: query, sort: sort.key, dir: sort.direction };

  return (
    <Card>
      <CardHeader
        action={
          <ReportSearchForm
            action={basePath}
            value={query}
            hiddenParams={{ sort: sort.key, dir: sort.direction }}
            label={`Search ${dimensionLabel.toLowerCase()} rows`}
            placeholder={`Search ${dimensionLabel.toLowerCase()}`}
            className="w-full sm:w-72"
          />
        }
      >
        <CardTitle>{dimensionLabel}</CardTitle>
        <CardDescription>
          {query
            ? `${slice.total.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} rows match “${query}”.`
            : `${rows.length.toLocaleString("en-US")} rows from the last completed sync, ${dateRangeStart} → ${dateRangeEnd}. ${totals.clicks.toLocaleString(
                "en-US"
              )} clicks and ${totals.impressions.toLocaleString("en-US")} impressions in total.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {slice.total === 0 ? (
          <EmptyState
            icon={Search}
            title={query ? "No rows match this search" : "No rows in the synced range"}
            description={
              query
                ? `Nothing in the synced ${dimensionLabel.toLowerCase()} rows contains “${query}”.`
                : "The last completed sync returned no rows for this dimension."
            }
            actionLabel={query ? "Clear search" : undefined}
            actionHref={query ? basePath : undefined}
          />
        ) : (
          <>
            <Table>
              <thead className="bg-surface-subtle">
                <tr className="border-b border-default">
                  <SortableHeader column={columns[0]} state={sort} basePath={basePath} params={{ q: query }} />
                  <SortableHeader column={columns[1]} state={sort} basePath={basePath} params={{ q: query }} numeric />
                  <SortableHeader column={columns[2]} state={sort} basePath={basePath} params={{ q: query }} numeric />
                  <SortableHeader column={columns[3]} state={sort} basePath={basePath} params={{ q: query }} numeric />
                  <SortableHeader column={columns[4]} state={sort} basePath={basePath} params={{ q: query }} numeric />
                </tr>
              </thead>
              <TableBody>
                {slice.items.map((row) => (
                  <TableRow key={row.dimensionValue}>
                    <TableCell>
                      {isUrl ? (
                        <span className="flex items-center gap-2">
                          <a
                            href={row.dimensionValue}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={row.dimensionValue}
                            className="max-w-xs truncate rounded-sm text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {shortenUrl(row.dimensionValue, 56)}
                          </a>
                          <CopyButton value={row.dimensionValue} />
                        </span>
                      ) : (
                        <span className="block max-w-sm truncate" title={row.dimensionValue}>
                          {row.dimensionValue}
                        </span>
                      )}
                    </TableCell>
                    <TableCell numeric>{row.clicks.toLocaleString("en-US")}</TableCell>
                    <TableCell numeric>{row.impressions.toLocaleString("en-US")}</TableCell>
                    <TableCell numeric>{formatRatioAsPercent(row.ctr, 1).text}</TableCell>
                    <TableCell numeric>
                      <PositionValue position={row.position} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              page={slice.page}
              totalPages={slice.totalPages}
              total={slice.total}
              firstItemIndex={slice.firstItemIndex}
              lastItemIndex={slice.lastItemIndex}
              itemNoun="rows"
              buildHref={(page) => `${basePath}${buildQueryString({ ...params, page: page > 1 ? page : undefined })}`}
            />

            <PositionScaleNote />
            <p className="text-xs text-muted">
              Position is each row&apos;s own average over the range, exactly as Google reported it — {POSITION_HINT}.
              Rows are never re-derived or re-weighted here.
            </p>
            {note && <p className="text-xs text-muted">{note}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
