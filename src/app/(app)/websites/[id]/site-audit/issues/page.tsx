import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { ReportIssuesPage } from "@/components/report/issues-page";
import type { SearchParamsLike } from "@/components/report/filtering";

import { categoryLabel, loadSiteAuditData } from "../data";

/**
 * Site Audit → Issues tab.
 *
 * Stage 2 note: the body of this page is now the shared `ReportIssuesPage`,
 * which is Stage 1's implementation lifted into `src/components/report/`
 * unchanged in behaviour and parameterised so the five module reports could
 * reuse it. Site Audit was migrated onto it rather than left as a sixth copy —
 * the rendering, the URL-driven filter model, the facets, the grouping and the
 * pagination are all identical, and the only differences (its category
 * vocabulary and its "go to crawl history" empty-state action) are now props.
 */
export default async function SiteAuditIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const { id } = await params;
  const { site, access } = await requireWorkspacePage(id, "site-audit");
  if (!access.entitled) return <UpgradeRequired label="Site Audit" />;

  const [data, resolvedSearchParams] = await Promise.all([loadSiteAuditData(site.id), searchParams]);

  return (
    <ReportIssuesPage
      issues={data.issues}
      basePath={`/websites/${site.id}/site-audit/issues`}
      categoryLabel={categoryLabel}
      searchParams={resolvedSearchParams}
      hasData={data.hasCompletedCrawl}
      noDataDescription="Issues are only known after a crawl has completed."
      noDataActionLabel="Go to crawl history"
      noDataActionHref={`/websites/${site.id}/site-audit#crawl-history`}
      emptyDescription="The most recent completed crawl found no rule violations on this site."
    />
  );
}
