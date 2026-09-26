import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import type { SearchParamsLike } from "@/components/report/filtering";

import { GscConnectionCard } from "../connection-card";
import { GscDimensionTable } from "../dimension-table";
import { loadSearchConsoleReport } from "../data";

/**
 * Search Console → Pages tab.
 *
 * This dimension genuinely exists in the stored data — `runGscSync` requests
 * `dimensions: ["page"]` alongside the query report and persists both — so it
 * is a real tab, not a placeholder. Countries and devices are NOT stored and
 * therefore get no tab at all.
 */
export default async function SearchConsolePagesPage({
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
      rows={data.pages}
      totals={data.pageTotals}
      basePath={`/websites/${site.id}/search-console/pages`}
      dimensionLabel="Page"
      isUrl
      dateRangeStart={data.dateRangeStart}
      dateRangeEnd={data.dateRangeEnd}
      searchParams={resolvedSearchParams}
      note="These are the URLs Google recorded as the search result, which is not always the URL a crawl of this site would produce for the same content. They are shown exactly as Google returned them."
    />
  );
}
