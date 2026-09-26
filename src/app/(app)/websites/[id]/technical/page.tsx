import { UpgradeRequired } from "@/components/website/upgrade-required";
import {
  ModuleSeverityKpis,
  ModuleTopicGrid,
  ModuleTopIssues,
  MostAffectedPagesCard,
} from "@/components/report/module-overview";
import { topicLabel } from "@/components/report/module-definitions";

import { requireModulePage } from "../_module-report/chrome";
import { loadModuleReport } from "../_module-report/data";

/**
 * Technical SEO → Overview tab.
 *
 * What leads here is CRAWL REACH: whether search engines can fetch, follow and
 * index this site at all. So the order is severity → area → which pages carry
 * the most technical debt → the worst individual rules. The
 * most-affected-pages table is the piece unique to this module: technical
 * findings cluster on specific URLs (a redirect chain, a 404, a missing
 * header on one host), so "which pages are worst" is the question a technical
 * SEO actually asks next, and it is answerable from data already fetched.
 *
 * Server Component. Everything comes from ONE `cache()`d
 * `loadModuleReport(...)` shared with the layout above — no card re-queries.
 */
export default async function TechnicalSeoOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { definition, site, access } = await requireModulePage("technical", id);
  if (!access.entitled) return <UpgradeRequired label={definition.label} />;

  const data = await loadModuleReport(site.id, "technical");
  const base = `/websites/${site.id}/${definition.slug}`;
  const issuesPath = `${base}/issues`;
  const crawlHistoryHref = `/websites/${site.id}/site-audit#crawl-history`;

  const previewIssues = data.issues.slice(0, 6).map((issue) => ({
    ...issue,
    href: `${issuesPath}/${encodeURIComponent(issue.ruleKey)}`,
    categoryLabel: topicLabel("technical", issue.category),
  }));

  return (
    <div className="space-y-5">
      <ModuleSeverityKpis
        countsBySeverity={data.countsBySeverity}
        totalIssueTypes={data.totalIssueTypes}
        totalAffectedPageInstances={data.totalAffectedPageInstances}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="Crawl and indexing findings"
        description="Crawlability, indexability, redirects, status codes and transport security, counted as distinct rule types from the most recent completed crawl."
        extraFooterItems={
          data.hasCompletedCrawl
            ? [{ label: "Pages scanned", value: data.report.pagesScanned.toLocaleString("en-US") }]
            : undefined
        }
      />

      <ModuleTopicGrid
        topics={data.topics}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="By technical area"
        description="Every area with at least one finding, linking into the pre-filtered issue list. An area with no findings is not listed — an absent area is not a measured zero."
      />

      <MostAffectedPagesCard
        rows={data.mostAffectedPages}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="Pages with the most technical findings"
        description={
          data.mostAffectedPages.length > 0
            ? `Crawled pages ranked by how many distinct Technical SEO rules fired on them. Showing the top ${Math.min(
                10,
                data.mostAffectedPages.length
              )} of ${data.mostAffectedPages.length.toLocaleString("en-US")} affected pages.`
            : undefined
        }
      />

      <ModuleTopIssues
        issues={previewIssues}
        totalIssueTypes={data.totalIssueTypes}
        issuesPath={issuesPath}
        crawlHistoryHref={crawlHistoryHref}
        hasCompletedCrawl={data.hasCompletedCrawl}
        emptyDescription="The most recent completed crawl found no Technical SEO rule violations on this site."
      />
    </div>
  );
}
