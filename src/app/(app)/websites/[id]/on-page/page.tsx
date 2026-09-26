import Link from "next/link";
import { ListChecks, SearchCheck } from "lucide-react";

import { UpgradeRequired } from "@/components/website/upgrade-required";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ModuleSeverityKpis, ModuleTopicGrid, ModuleTopIssues } from "@/components/report/module-overview";
import { IssueSeverityBadge } from "@/components/report/issue-severity-badge";
import { topicLabel } from "@/components/report/module-definitions";

import { requireModulePage } from "../_module-report/chrome";
import { loadModuleReport } from "../_module-report/data";

/**
 * On-Page SEO → Overview tab.
 *
 * What leads here is COVERAGE, not location. On-page findings are not a
 * per-page emergency the way a 500 is — they are systematic gaps that repeat
 * across a template ("94 of 100 pages have no meta description"). So this
 * Overview's distinctive card is "most common optimisation gaps": each rule
 * with the count of pages it fires on AND that count as a share of the pages
 * actually analysed. The denominator is stated explicitly because a percentage
 * without one is exactly the kind of number that looks measured and is not.
 *
 * That share is only rendered when `pagesScanned > 0`. If the crawl scanned
 * nothing there is no denominator, and the column says "Not measured" rather
 * than dividing by zero into a fabricated figure.
 *
 * Server Component; one `cache()`d fetch shared with the layout.
 */
export default async function OnPageSeoOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { definition, site, access } = await requireModulePage("on_page", id);
  if (!access.entitled) return <UpgradeRequired label={definition.label} />;

  const data = await loadModuleReport(site.id, "on_page");
  const base = `/websites/${site.id}/${definition.slug}`;
  const issuesPath = `${base}/issues`;
  const crawlHistoryHref = `/websites/${site.id}/site-audit#crawl-history`;

  const pagesScanned = data.report.pagesScanned;
  const hasDenominator = data.hasCompletedCrawl && pagesScanned > 0;

  const previewIssues = data.issues.slice(0, 6).map((issue) => ({
    ...issue,
    href: `${issuesPath}/${encodeURIComponent(issue.ruleKey)}`,
    categoryLabel: topicLabel("on_page", issue.category),
  }));

  // Ranked by breadth — "how much of the site does this affect" is the
  // on-page question, and it is a different ordering from the severity-first
  // Top issues card below, deliberately so.
  const commonGaps = [...data.issues].sort((a, b) => b.affectedPageCount - a.affectedPageCount).slice(0, 8);

  return (
    <div className="space-y-5">
      <ModuleSeverityKpis
        countsBySeverity={data.countsBySeverity}
        totalIssueTypes={data.totalIssueTypes}
        totalAffectedPageInstances={data.totalAffectedPageInstances}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="On-page findings by severity"
        description="Titles, meta descriptions, headings, canonicals, social preview tags, image alt text and link anchors, counted as distinct rule types from the most recent completed crawl."
        extraFooterItems={
          data.hasCompletedCrawl
            ? [{ label: "Pages analysed", value: pagesScanned.toLocaleString("en-US") }]
            : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Most common optimisation gaps</CardTitle>
          <CardDescription>
            The rules affecting the largest number of pages
            {hasDenominator
              ? `, with each shown as a share of the ${pagesScanned.toLocaleString("en-US")} pages analysed in the most recent completed crawl.`
              : "."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data.hasCompletedCrawl ? (
            <EmptyState
              icon={SearchCheck}
              title="No crawl yet"
              description="On-page gaps are only known after a crawl has completed."
              actionLabel="Go to crawl history"
              actionHref={crawlHistoryHref}
            />
          ) : commonGaps.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No on-page gaps found"
              description="The most recent completed crawl found no On-Page SEO rule violations on this site."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gap</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead numeric>Pages</TableHead>
                  <TableHead numeric>Share of pages analysed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commonGaps.map((issue) => (
                  <TableRow key={issue.ruleKey}>
                    <TableCell className="max-w-0">
                      <Link
                        href={`${issuesPath}/${encodeURIComponent(issue.ruleKey)}`}
                        className="block truncate rounded-sm font-medium text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        title={issue.title}
                      >
                        {issue.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-secondary-foreground">
                      {topicLabel("on_page", issue.category)}
                    </TableCell>
                    <TableCell>
                      <IssueSeverityBadge severity={issue.severity} />
                    </TableCell>
                    <TableCell numeric>{issue.affectedPageCount.toLocaleString("en-US")}</TableCell>
                    <TableCell numeric>
                      {hasDenominator ? (
                        `${Math.round((issue.affectedPageCount / pagesScanned) * 100)}%`
                      ) : (
                        // No denominator means no share. Saying so beats
                        // printing a number nobody measured.
                        <span className="text-xs font-medium text-muted">Not measured</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ModuleTopicGrid
        topics={data.topics}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="By on-page area"
        description="Every area with at least one finding, linking into the pre-filtered issue list. An area with no findings is not listed — an absent area is not a measured zero."
      />

      <ModuleTopIssues
        issues={previewIssues}
        totalIssueTypes={data.totalIssueTypes}
        issuesPath={issuesPath}
        crawlHistoryHref={crawlHistoryHref}
        hasCompletedCrawl={data.hasCompletedCrawl}
        emptyDescription="The most recent completed crawl found no On-Page SEO rule violations on this site."
      />
    </div>
  );
}
