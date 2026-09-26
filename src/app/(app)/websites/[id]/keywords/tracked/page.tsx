import Link from "next/link";
import { Search } from "lucide-react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/report/pagination";
import { ReportSearchForm } from "@/components/report/report-search-form";
import { SortableHeader } from "@/components/report/sortable-header";
import { AddKeywordForm } from "@/components/report/keyword-actions";
import {
  PositionMovementChip,
  PositionScaleNote,
  PositionSourceBadge,
  PositionValue,
} from "@/components/report/position-display";
import { buildQueryString, paginate, type SearchParamsLike } from "@/components/report/filtering";
import { parseSort, sortRows, type SortableColumn } from "@/components/report/table-sort";

import { loadKeywordsReport, type KeywordRow } from "../data";

const PER_PAGE = 25;

/**
 * Keywords / SERP → Keywords tab: the searchable, sortable, paginated record
 * list.
 *
 * Search, sort and page all live in the URL, exactly as the issue reports'
 * filters do, so a filtered view is shareable and the back button undoes each
 * step. Sorting is the one axis Stages 1-3A did not need: an issue list has a
 * fixed severity order, but "which keyword is worst" genuinely depends on
 * which column you are asking about.
 *
 * The `Latest position` column is inverted-scale — sorted ascending it puts
 * the BEST rank first — and a keyword with no measured position sinks to the
 * bottom in BOTH directions rather than masquerading as the best or the worst
 * (see `table-sort.ts`, and the tests that pin it).
 */
export default async function TrackedKeywordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const { site, access } = await requireWorkspacePage(id, "keywords");
  if (!access.entitled) return <UpgradeRequired label="Keywords / SERP tracking" />;

  const data = await loadKeywordsReport(site.id);
  const base = `/websites/${site.id}/keywords/tracked`;

  const columns: SortableColumn<KeywordRow>[] = [
    { key: "keyword", label: "Keyword", value: (row) => row.keyword, defaultDirection: "asc" },
    {
      key: "position",
      label: "Latest position",
      value: (row) => row.trend.latest?.position ?? null,
      defaultDirection: "asc",
      lowerIsBetter: true,
    },
    { key: "clicks", label: "Clicks", value: (row) => row.gsc?.clicks ?? null, defaultDirection: "desc" },
    { key: "impressions", label: "Impressions", value: (row) => row.gsc?.impressions ?? null, defaultDirection: "desc" },
    { key: "checks", label: "Checks logged", value: (row) => row.rankCheckCount, defaultDirection: "desc" },
    { key: "added", label: "Added", value: (row) => row.createdAt.getTime(), defaultDirection: "desc" },
  ];

  const query = (() => {
    const raw = resolvedSearchParams.q;
    return (Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "")).trim();
  })();

  const pageRaw = Number.parseInt(
    (Array.isArray(resolvedSearchParams.page) ? resolvedSearchParams.page[0] : resolvedSearchParams.page) ?? "",
    10
  );
  const requestedPage = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const sort = parseSort(resolvedSearchParams, columns, { key: "added", direction: "desc" });

  const needle = query.toLowerCase();
  const filtered = needle
    ? data.keywords.filter(
        (row) =>
          row.keyword.toLowerCase().includes(needle) ||
          (row.targetUrl ?? "").toLowerCase().includes(needle) ||
          (row.country ?? "").toLowerCase().includes(needle)
      )
    : data.keywords;

  const sorted = sortRows(filtered, columns, sort);
  const slice = paginate(sorted, requestedPage, PER_PAGE);

  const sortParams = { q: query, sort: sort.key, dir: sort.direction };

  if (data.keywords.length === 0) {
    return (
      <div className="space-y-5">
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={Search}
              title="No keywords tracked yet"
              description="Add a keyword below to start recording its position over time."
            />
          </CardContent>
        </Card>
        <AddKeywordCard websiteId={site.id} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          action={
            <ReportSearchForm
              action={base}
              value={query}
              hiddenParams={{ sort: sort.key, dir: sort.direction }}
              label="Search tracked keywords"
              placeholder="Search keyword, target URL or country"
              className="w-full sm:w-72"
            />
          }
        >
          <CardTitle>Tracked keywords</CardTitle>
          <CardDescription>
            {query
              ? `${slice.total.toLocaleString("en-US")} of ${data.keywords.length.toLocaleString("en-US")} keywords match`
              : `${data.keywords.length.toLocaleString("en-US")} keyword${
                  data.keywords.length === 1 ? "" : "s"
                } tracked. Click a keyword for its rank history and Search Console metrics.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {slice.total === 0 ? (
            <EmptyState
              icon={Search}
              title="No keywords match this search"
              description={`Nothing in the tracked set contains “${query}”.`}
              actionLabel="Clear search"
              actionHref={base}
            />
          ) : (
            <>
              <Table>
                <thead className="bg-surface-subtle">
                  <tr className="border-b border-default">
                    <SortableHeader column={columns[0]} state={sort} basePath={base} params={{ q: query }} />
                    <SortableHeader column={columns[1]} state={sort} basePath={base} params={{ q: query }} numeric />
                    <SortableHeader column={columns[2]} state={sort} basePath={base} params={{ q: query }} numeric />
                    <SortableHeader column={columns[3]} state={sort} basePath={base} params={{ q: query }} numeric />
                    <SortableHeader column={columns[4]} state={sort} basePath={base} params={{ q: query }} numeric />
                  </tr>
                </thead>
                <TableBody>
                  {slice.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          href={`${base}/${row.id}`}
                          className="rounded-sm font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {row.keyword}
                        </Link>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2">
                          {row.country && <span className="text-xs text-muted">{row.country}</span>}
                          {row.targetUrl && (
                            <span className="text-xs break-all text-muted" title={row.targetUrl}>
                              → {row.targetUrl}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell numeric>
                        <span className="flex flex-col items-end gap-1">
                          <PositionValue position={row.trend.latest?.position ?? null} />
                          {row.trend.latest && <PositionSourceBadge source={row.trend.latest.source} />}
                          <PositionMovementChip movement={row.trend.movement} />
                        </span>
                      </TableCell>
                      <TableCell numeric>
                        {row.gsc ? (
                          row.gsc.clicks.toLocaleString("en-US")
                        ) : (
                          <span className="text-xs text-muted">No data</span>
                        )}
                      </TableCell>
                      <TableCell numeric>
                        {row.gsc ? (
                          row.gsc.impressions.toLocaleString("en-US")
                        ) : (
                          <span className="text-xs text-muted">No data</span>
                        )}
                      </TableCell>
                      <TableCell numeric>
                        {row.rankCheckCount.toLocaleString("en-US")}
                        {row.rankCheckCount === 1 && (
                          <span className="ml-1 text-xs text-muted" title="One observation is not a trend">
                            (no trend)
                          </span>
                        )}
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
                itemNoun="keywords"
                buildHref={(page) =>
                  `${base}${buildQueryString({ ...sortParams, page: page > 1 ? page : undefined })}`
                }
              />

              <PositionScaleNote />
              {!data.gscHasSyncedQueries && (
                <p className="text-xs text-muted">
                  <Badge variant="unknown">No Search Console data</Badge>{" "}
                  Clicks and impressions are blank for every row because no Search Console sync has produced query
                  data for this website — they are not zero.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AddKeywordCard websiteId={site.id} />
    </div>
  );
}

function AddKeywordCard({ websiteId }: { websiteId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Track a new keyword</CardTitle>
      </CardHeader>
      <CardContent>
        <AddKeywordForm websiteId={websiteId} />
      </CardContent>
    </Card>
  );
}
