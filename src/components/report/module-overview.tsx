import Link from "next/link";
import { ChevronRight, ExternalLink, ListChecks, SearchCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCount, shortenUrl } from "@/components/charts/format";
import { SEVERITY_ORDER, type Severity } from "@/lib/scoring/formula";
import { MetricCard } from "./metrics";
import { IssueList, type IssueListRow } from "./issue-list";
import { IssueSeverityBadge } from "./issue-severity-badge";
import { buildQueryString } from "./filtering";

/**
 * The three Overview cards every one of the five issue-based module reports
 * shares — severity KPIs, a per-area breakdown, and a capped top-issues
 * preview — plus a ranked most-affected-pages table two of them use.
 *
 * MODULE-AGNOSTIC: each takes plain data and a base path. Everything genuinely
 * specific to a module (structured-data inventory, robots.txt behaviour,
 * sitemap discovery, page-coverage gaps) lives in that module's own
 * `page.tsx`, which is the point — the five Overviews are deliberately NOT the
 * same page five times.
 *
 * DELIBERATELY NOT CHARTS. Every quantity on these cards is either a single
 * count, a status verdict, or a short ranked list with a drill-down link.
 * The project's charting standard says a lone number belongs in a tile and a
 * ranked list with per-row actions belongs in a table — a bar chart of six
 * counts would say less than the six clickable cards do, and could not be
 * clicked. The site-level gauge and score trend that DO earn a chart already
 * live on Site Audit (Stage 1).
 */

/** Severity tiers worth a headline tile. `info` is excluded — see note below. */
const KPI_SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

export function ModuleSeverityKpis({
  countsBySeverity,
  totalIssueTypes,
  totalAffectedPageInstances,
  issuesPath,
  hasCompletedCrawl,
  title = "Findings by severity",
  description,
  extraFooterItems,
}: {
  countsBySeverity: Record<Severity, number>;
  totalIssueTypes: number;
  totalAffectedPageInstances: number;
  issuesPath: string;
  hasCompletedCrawl: boolean;
  title?: string;
  description?: string;
  /** Extra term/value pairs for the footer strip, e.g. "Pages analysed 100". */
  extraFooterItems?: { label: string; value: string }[];
}) {
  return (
    <Card>
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
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ?? "Distinct issue types from the most recent completed crawl."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasCompletedCrawl ? (
          <EmptyState
            icon={SearchCheck}
            title="No crawl yet"
            description="Findings are only known after a crawl has completed."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {KPI_SEVERITIES.map((severity) => (
                <MetricCard
                  key={severity}
                  label={`${severity[0].toUpperCase()}${severity.slice(1)} issues`}
                  value={formatCount(countsBySeverity[severity])}
                  href={`${issuesPath}${buildQueryString({ severity })}`}
                  trend={<IssueSeverityBadge severity={severity} />}
                />
              ))}
            </div>

            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-default pt-3 text-xs">
              {extraFooterItems?.map((item) => (
                <div key={item.label} className="flex gap-1.5">
                  <dt className="text-muted">{item.label}</dt>
                  <dd className="tabular font-semibold text-foreground">{item.value}</dd>
                </div>
              ))}
              <div className="flex gap-1.5">
                <dt className="text-muted">Distinct issue types</dt>
                <dd className="tabular font-semibold text-foreground">{totalIssueTypes.toLocaleString("en-US")}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted">Affected page instances</dt>
                <dd className="tabular font-semibold text-foreground">
                  {totalAffectedPageInstances.toLocaleString("en-US")}
                </dd>
              </div>
              {/* `info` never appears as a KPI tile: informational findings do
                  not penalise a score and are not a defect count, so promoting
                  one to a headline would misread a deliberate choice as a
                  problem. It stays fully present on the Issues tab. */}
              <div className="flex gap-1.5">
                <dt className="text-muted">Informational findings</dt>
                <dd className="tabular font-semibold text-foreground">
                  {countsBySeverity.info.toLocaleString("en-US")}
                </dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export interface ModuleTopicCard {
  key: string;
  label: string;
  issueCount: number;
  affectedPageCount: number;
  countsBySeverity: Record<Severity, number>;
}

export function ModuleTopicGrid({
  topics,
  issuesPath,
  hasCompletedCrawl,
  title = "By area",
  description = "Every area with at least one finding. Areas with no findings are not listed — an absent area is not a measured zero.",
}: {
  topics: ModuleTopicCard[];
  issuesPath: string;
  hasCompletedCrawl: boolean;
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {topics.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title={hasCompletedCrawl ? "No findings to break down" : "No crawl yet"}
            description={
              hasCompletedCrawl
                ? "The last completed crawl recorded nothing in this report."
                : "Area breakdowns are only known after a crawl has completed."
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic) => (
              <li key={topic.key}>
                <Link
                  href={`${issuesPath}${buildQueryString({ category: topic.key })}`}
                  className="flex h-full flex-col rounded-lg border border-default p-3 transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{topic.label}</span>
                    <span className="tabular text-lg leading-none font-bold text-foreground">
                      {topic.issueCount.toLocaleString("en-US")}
                    </span>
                  </div>
                  <p className="tabular mt-0.5 text-xs text-muted">
                    {topic.affectedPageCount.toLocaleString("en-US")} affected page
                    {topic.affectedPageCount === 1 ? "" : "s"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {SEVERITY_ORDER.filter((severity) => topic.countsBySeverity[severity] > 0).map((severity) => (
                      <IssueSeverityBadge key={severity} severity={severity} count={topic.countsBySeverity[severity]} />
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ModuleTopIssues({
  issues,
  totalIssueTypes,
  issuesPath,
  crawlHistoryHref,
  hasCompletedCrawl,
  limit = 6,
  emptyTitle = "No issues found",
  emptyDescription = "The most recent completed crawl found no rule violations in this report.",
  emptyExtra,
}: {
  issues: IssueListRow[];
  totalIssueTypes: number;
  issuesPath: string;
  /** Where "run a crawl" lives — the Site Audit overview's crawl panel. */
  crawlHistoryHref: string;
  hasCompletedCrawl: boolean;
  limit?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Extra honest context under the empty state (Schema uses it to say "no markup found"). */
  emptyExtra?: ReactNode;
}) {
  const preview = issues.slice(0, limit);

  return (
    <Card>
      <CardHeader
        action={
          issues.length > 0 ? (
            <Link
              href={issuesPath}
              className="inline-flex items-center gap-0.5 rounded-md text-xs font-semibold text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              View all {totalIssueTypes.toLocaleString("en-US")} issues
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      >
        <CardTitle>Top issues</CardTitle>
        <CardDescription>
          Ranked by severity, then by how many pages each affects. Showing the first{" "}
          {Math.min(limit, issues.length)} of {totalIssueTypes.toLocaleString("en-US")}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasCompletedCrawl ? (
          <EmptyState
            icon={SearchCheck}
            title="No crawl yet"
            description="Run a crawl to see what this report finds."
            actionLabel="Go to crawl history"
            actionHref={crawlHistoryHref}
          />
        ) : issues.length === 0 ? (
          <>
            {/* A measured zero, and visually distinct from "no data": the crawl
                ran, and it genuinely found nothing under these rules. */}
            <EmptyState icon={ListChecks} title={emptyTitle} description={emptyDescription} />
            {emptyExtra}
          </>
        ) : (
          <IssueList issues={preview} headingLevel="h3" />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Ranked "which pages carry the most of this module's findings" table.
 *
 * A table, not a chart: each row needs its full URL, a severity badge and an
 * open-in-new-tab action, none of which a bar can carry.
 */
export function MostAffectedPagesCard({
  rows,
  limit = 10,
  hasCompletedCrawl,
  title = "Most-affected pages",
  description,
}: {
  rows: { pageId: string; url: string; ruleCount: number; worstSeverity: Severity }[];
  limit?: number;
  hasCompletedCrawl: boolean;
  title?: string;
  description?: string;
}) {
  const visible = rows.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ??
            `Crawled pages ranked by how many distinct rules from this report fired on them. Showing the top ${Math.min(
              limit,
              rows.length
            )} of ${rows.length.toLocaleString("en-US")} affected pages.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <EmptyState
            icon={hasCompletedCrawl ? ListChecks : SearchCheck}
            title={hasCompletedCrawl ? "No affected pages" : "No crawl yet"}
            description={
              hasCompletedCrawl
                ? "No crawled page carries a finding from this report."
                : "Affected pages are only known after a crawl has completed."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead>Worst severity</TableHead>
                <TableHead numeric>Findings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow key={row.pageId}>
                  <TableCell className="max-w-0">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={row.url}
                      className="inline-flex max-w-full items-center gap-1 rounded-sm text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="truncate">{shortenUrl(row.url, 60)}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <IssueSeverityBadge severity={row.worstSeverity} />
                  </TableCell>
                  <TableCell numeric>{row.ruleCount.toLocaleString("en-US")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One plain-language status line: a verdict badge, a sentence, and optional
 * verbatim evidence from the crawler.
 *
 * Used by the Sitemap and Robots.txt Overviews, where the useful answer is a
 * sentence ("robots.txt does not block the homepage") rather than a number.
 * The badge always ships an icon and a word, so no verdict rests on colour.
 */
export function StatusLine({
  label,
  verdict,
  detail,
  evidence,
  action,
}: {
  label: string;
  verdict: ReactNode;
  detail: string;
  /** The crawler's own evidence string, shown verbatim. Never rewritten. */
  evidence?: string[];
  action?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-default py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-sm text-secondary-foreground">{detail}</p>
        {evidence && evidence.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {evidence.map((entry) => (
              <li key={entry} className="font-mono text-xs break-words text-muted">
                {entry}
              </li>
            ))}
          </ul>
        )}
        {action && <div className="mt-1.5">{action}</div>}
      </div>
      <div className="shrink-0">{verdict}</div>
    </li>
  );
}
