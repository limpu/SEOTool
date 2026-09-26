import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import type { SearchParamsLike } from "@/components/report/filtering";

import { GscConnectionCard } from "../connection-card";
import { GscDimensionTable } from "../dimension-table";
import { loadSearchConsoleReport } from "../data";

/** Search Console → Queries tab. The table itself is the shared `GscDimensionTable`. */
export default async function SearchConsoleQueriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const { site, access } = await requireWorkspacePage(id, "search-console");
  if (!access.entitled) return <UpgradeRequired label="Search Console" />;

  const data = await loadSearchConsoleReport(site.id);

  if (data.state !== "ready") {
    return <GscConnectionCard websiteId={site.id} data={data} />;
  }

  return (
    <GscDimensionTable
      rows={data.queries}
      totals={data.queryTotals}
      basePath={`/websites/${site.id}/search-console/queries`}
      dimensionLabel="Query"
      dateRangeStart={data.dateRangeStart}
      dateRangeEnd={data.dateRangeEnd}
      searchParams={resolvedSearchParams}
      note="Google withholds rare queries to protect user privacy and caps this report at 1,000 rows, so this list is not every search that reached the site. It is not padded to close the gap."
    />
  );
}
