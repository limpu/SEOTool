import { ExternalLink, SearchX } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { shortenUrl } from "@/components/charts/format";
import { CopyButton } from "./copy-button";
import { Pagination } from "./pagination";
import { ReportSearchForm } from "./report-search-form";
import { buildQueryString, paginate } from "./filtering";

/**
 * The affected-URLs table at the bottom of every issue-detail page.
 * MODULE-AGNOSTIC — it takes rows, not a module.
 *
 * Search and paging are URL params (`urlQueryParam` / `pageParam`), so a
 * particular page of a particular issue's affected URLs is a shareable link.
 * The filtering and slicing are done here, in a Server Component, from the
 * rows the page already fetched once — no second query, and no client-side
 * data fetching.
 *
 * The evidence column shows the crawler's own captured evidence string
 * verbatim when it exists, and an explicit "No evidence captured" when it does
 * not. That distinction is real: some rules record a measured value ("title is
 * 71 characters"), others fire on an absence and have nothing to quote. An
 * em-dash in both places would flatten two different facts into one.
 */
export interface AffectedUrlRow {
  /** Stable key — the crawled page id. */
  id: string;
  url: string;
  evidence: string | null;
}

export function AffectedUrlsTable({
  rows,
  basePath,
  query,
  page,
  perPage = 25,
  urlQueryParam = "u",
  pageParam = "page",
  emptyTitle = "No affected URLs recorded",
  emptyDescription,
}: {
  rows: AffectedUrlRow[];
  /** Path of the page this table lives on, used to build its own search/page links. */
  basePath: string;
  query: string;
  page: number;
  perPage?: number;
  urlQueryParam?: string;
  pageParam?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(
        (row) => row.url.toLowerCase().includes(needle) || (row.evidence ?? "").toLowerCase().includes(needle)
      )
    : rows;

  const slice = paginate(filtered, page, perPage);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <ReportSearchForm
          action={basePath}
          name={urlQueryParam}
          value={query}
          label="Search affected URLs"
          placeholder="Search these URLs"
          className="w-full sm:w-72"
        />
        <p className="tabular text-xs text-secondary-foreground" role="status">
          {needle
            ? `${filtered.length.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} URLs match`
            : `${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? "URL" : "URLs"}`}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={SearchX} title={emptyTitle} description={emptyDescription} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No URLs match your search"
          description={`None of the ${rows.length.toLocaleString("en-US")} affected URLs contain “${query}”.`}
        />
      ) : (
        <>
          {/* `Table` ships its own overflow-x-auto wrapper — the page body never scrolls sideways. */}
          <div className="rounded-lg border border-default">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[22rem]">
                      <span className="block truncate font-medium" title={row.url}>
                        {shortenUrl(row.url, 64)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[22rem]">
                      {row.evidence ? (
                        <span className="block truncate text-secondary-foreground" title={row.evidence}>
                          {row.evidence}
                        </span>
                      ) : (
                        <span className="text-muted">No evidence captured</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <CopyButton value={row.url} />
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open URL in a new tab"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-default text-secondary-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">Open {row.url} in a new tab</span>
                        </a>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={slice.page}
            totalPages={slice.totalPages}
            total={slice.total}
            firstItemIndex={slice.firstItemIndex}
            lastItemIndex={slice.lastItemIndex}
            itemNoun="URLs"
            label="Affected URL pages"
            buildHref={(target) =>
              `${basePath}${buildQueryString({
                [urlQueryParam]: query,
                [pageParam]: target > 1 ? target : undefined,
              })}`
            }
          />
        </>
      )}
    </div>
  );
}
