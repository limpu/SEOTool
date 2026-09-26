import Link from "next/link";
import { ChevronRight, ListChecks, SearchCheck } from "lucide-react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { CrawlPanel } from "@/components/website/crawl-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCount } from "@/components/charts/format";
import { HealthGauge, MetricCard, TrendChart } from "@/components/report/metrics";
import { IssueList } from "@/components/report/issue-list";
import { IssueSeverityBadge } from "@/components/report/issue-severity-badge";
import { buildQueryString } from "@/components/report/filtering";
import { SEVERITY_ORDER, type Severity } from "@/lib/scoring/formula";

import { categoryLabel, loadSiteAuditData } from "./data";

/**
 * Site Audit → Overview tab.
 *
 * A summary, not a table. It answers "how healthy is this site, what changed,
 * and what are the worst things" and then hands off: the top-issues card shows
 * a PREVIEW capped at six rows and ends in "View all issues", and the category
 * grid links straight into the pre-filtered issue list. The full list lives on
 * its own route, where search, filters and paging belong.
 *
 * Server Component — all fetching happens in `loadSiteAuditData` (shared with
 * the layout via `cache()`), and the two recharts leaves receive
 * already-computed, plain-serializable props.
 *
 * The crawl panel at the bottom is the EXISTING crawl-history / run-crawl
 * feature, moved here unchanged and given the `crawl-history` anchor the
 * header's "Run crawl" action targets. Nothing about it was removed.
 */
export default async function SiteAuditOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { site, access } = await requireWorkspacePage(id, "site-audit");
  if (!access.entitled) return <UpgradeRequired label="Site Audit" />;

  const data = await loadSiteAuditData(site.id);
  const base = `/websites/${site.id}/site-audit`;
  const issuesPath = `${base}/issues`;

  // The four tiers worth a headline tile. `info` is deliberately excluded:
  // informational findings never penalise the score and are not a defect
  // count, so promoting one to a KPI would misread a deliberate choice as a
  // problem. It remains fully present on the Issues tab.
  const KPI_SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

  const previewIssues = data.issues.slice(0, 6).map((issue) => ({
    ...issue,
    href: `${issuesPath}/${issue.ruleKey}`,
    categoryLabel: categoryLabel(issue.category),
  }));

  return (
    <div className="space-y-5">
      {/* ─── 1. KPI row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Site health</CardTitle>
            <CardDescription>
              Weighted from Technical, On-Page and Performance. Derived from real crawl evidence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HealthGauge score={data.scores.overall.score} label="Overall site health" />
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-default pt-3">
              <span className="text-xs text-secondary-foreground">Score across recent crawls</span>
              <TrendChart
                points={data.scoreHistory}
                valueLabel="Overall score"
                ariaLabel="Overall score across recent completed crawls"
                emptyLabel="Not enough history yet"
                emptyHint="Needs two completed crawls"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            action={
              <Link
                href={issuesPath}
                className="inline-flex items-center gap-0.5 rounded-md text-xs font-semibold text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                All issues
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          >
            <CardTitle>Issues by severity</CardTitle>
            <CardDescription>
              {/* Says exactly what is being counted — distinct rules, not per-page rows. */}
              Distinct issue types from the most recent completed crawl.
              {data.deltasBySeverity === null
                ? " No previous crawl to compare against yet."
                : " Change is against the previous completed crawl."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!data.hasCompletedCrawl ? (
              <EmptyState
                icon={SearchCheck}
                title="No crawl yet"
                description="Issue counts are only known after a crawl has completed. Start one below."
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {KPI_SEVERITIES.map((severity) => (
                    <MetricCard
                      key={severity}
                      label={`${severity[0].toUpperCase()}${severity.slice(1)} issues`}
                      value={formatCount(data.countsBySeverity[severity])}
                      // Fewer issues is better, so a NEGATIVE delta is the improvement.
                      delta={data.deltasBySeverity?.[severity] ?? null}
                      deltaOptions={{ lowerIsBetter: true }}
                      href={`${issuesPath}${buildQueryString({ severity })}`}
                      trend={<IssueSeverityBadge severity={severity} />}
                    />
                  ))}
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-default pt-3 text-xs">
                  <div className="flex gap-1.5">
                    <dt className="text-muted">Distinct issue types</dt>
                    <dd className="tabular font-semibold text-foreground">
                      {data.totalIssueTypes.toLocaleString("en-US")}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted">Affected page instances</dt>
                    <dd className="tabular font-semibold text-foreground">
                      {data.totalAffectedPageInstances.toLocaleString("en-US")}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted">Informational findings</dt>
                    <dd className="tabular font-semibold text-foreground">
                      {data.countsBySeverity.info.toLocaleString("en-US")}
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 2. Top issues PREVIEW — never the full list ───────────────── */}
      <Card>
        <CardHeader
          action={
            data.issues.length > 0 ? (
              <Link
                href={issuesPath}
                className="inline-flex items-center gap-0.5 rounded-md text-xs font-semibold text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                View all {data.totalIssueTypes.toLocaleString("en-US")} issues
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : undefined
          }
        >
          <CardTitle>Top issues</CardTitle>
          <CardDescription>
            Ranked by severity, then by how many pages each affects. Showing the first{" "}
            {Math.min(6, data.issues.length)} of {data.totalIssueTypes.toLocaleString("en-US")}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data.hasCompletedCrawl ? (
            <EmptyState
              icon={SearchCheck}
              title="No crawl yet"
              description="Run a crawl to see what this site's issues are."
            />
          ) : data.issues.length === 0 ? (
            // A measured zero, and visually distinct from "no data": the crawl
            // ran, and it genuinely found nothing.
            <EmptyState
              icon={ListChecks}
              title="No issues found"
              description="The most recent completed crawl found no rule violations on this site."
            />
          ) : (
            <IssueList issues={previewIssues} headingLevel="h3" />
          )}
        </CardContent>
      </Card>

      {/* ─── 3. Per-category summary grid ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>By category</CardTitle>
          <CardDescription>
            Every category with at least one finding. Categories with no findings are not listed — an absent
            category is not a measured zero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.categories.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title={data.hasCompletedCrawl ? "No issues found" : "No crawl yet"}
              description={
                data.hasCompletedCrawl
                  ? "There is nothing to break down by category."
                  : "Category breakdowns are only known after a crawl has completed."
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.categories.map((category) => (
                <li key={category.key}>
                  <Link
                    href={`${issuesPath}${buildQueryString({ category: category.key })}`}
                    className="flex h-full flex-col rounded-lg border border-default p-3 transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{category.label}</span>
                      <span className="tabular text-lg leading-none font-bold text-foreground">
                        {category.issueCount.toLocaleString("en-US")}
                      </span>
                    </div>
                    <p className="tabular mt-0.5 text-xs text-muted">
                      {category.affectedPageCount.toLocaleString("en-US")} affected page
                      {category.affectedPageCount === 1 ? "" : "s"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {SEVERITY_ORDER.filter((severity) => category.countsBySeverity[severity] > 0).map(
                        (severity) => (
                          <IssueSeverityBadge
                            key={severity}
                            severity={severity}
                            count={category.countsBySeverity[severity]}
                          />
                        )
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ─── 4. Existing crawl history / run-crawl feature, preserved ──── */}
      <Card id="crawl-history" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Crawl &amp; audit history</CardTitle>
          <CardDescription>Start a new crawl, or inspect the pages and issues from a past run.</CardDescription>
        </CardHeader>
        <CardContent>
          <CrawlPanel websiteId={site.id} initialRuns={data.crawlRuns} />
        </CardContent>
      </Card>
    </div>
  );
}
