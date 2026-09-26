import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AffectedUrlsTable } from "./affected-urls-table";
import { IssueSeverityBadge } from "./issue-severity-badge";
import { parseIssueFilters, readListParam, type ReportIssue, type SearchParamsLike } from "./filtering";

/**
 * The WHOLE "one issue" drill-down, for every report module: what the rule
 * found, why it matters, how to fix it, and every URL it fired on.
 *
 * Stage 1 built this as Site Audit's `issues/[ruleKey]/page.tsx`; Stage 2
 * lifted it here unchanged in behaviour so five more modules could reuse it.
 *
 * IMPORTANT: this component does NOT validate the rule key — its caller does,
 * BEFORE rendering, and `notFound()`s on an unknown one. Validation has to
 * happen in the route segment so the 404 is a real HTTP 404, not a rendered
 * "not found" body served with a 200.
 *
 * Every field shown comes from the `seo_rules` row the crawler already matched
 * (`description`, `impact`, `recommendation`, `fixExample`) plus the per-page
 * `evidence` the crawler captured. Nothing is generated, rewritten or
 * inferred, and a section whose underlying field is empty says so rather than
 * being padded with generic advice.
 */
export interface ReportIssueDetail extends ReportIssue {
  description: string;
  recommendation: string | null;
  fixExample: string | null;
  impact: string | null;
  affectedPages: { pageId: string; url: string; evidence: string | null }[];
}

export function ReportIssueDetailPage({
  issue,
  issuesPath,
  categoryLabel,
  searchParams,
  backLabel = "Back to all issues",
  affectedUrlsDescription = "Every page from the most recent completed crawl where this rule fired, with the evidence the crawler captured.",
  children,
}: {
  issue: ReportIssueDetail;
  /** Route of the module's issue list — used for the back link and the detail path. */
  issuesPath: string;
  categoryLabel: (key: string) => string;
  searchParams: SearchParamsLike;
  backLabel?: string;
  affectedUrlsDescription?: string;
  /** Optional module-specific block rendered between the issue card and the URL table. */
  children?: ReactNode;
}) {
  const detailPath = `${issuesPath}/${encodeURIComponent(issue.ruleKey)}`;

  // The affected-URL table's own search/paging params, kept separate from the
  // issue list's so a deep link can carry both without collision.
  const urlQuery = parseIssueFilters(searchParams, { queryParam: "u" }).query;
  const urlPage = parseIssueFilters(searchParams).page;

  // Preserve the filters the user arrived with, so "Back to all issues"
  // returns them to the list they were actually looking at.
  const backParams = new URLSearchParams();
  const backQuery = typeof searchParams.q === "string" ? searchParams.q : "";
  if (backQuery) backParams.set("q", backQuery);
  for (const value of readListParam(searchParams.category)) backParams.append("category", value);
  for (const value of readListParam(searchParams.severity)) backParams.append("severity", value);
  const backHref = backParams.toString() ? `${issuesPath}?${backParams.toString()}` : issuesPath;

  return (
    <div className="space-y-5">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <IssueSeverityBadge severity={issue.severity} />
            <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {categoryLabel(issue.category)}
            </span>
            <span className="tabular text-xs text-secondary-foreground">
              {issue.affectedPageCount.toLocaleString("en-US")} affected{" "}
              {issue.affectedPageCount === 1 ? "page" : "pages"}
            </span>
          </div>
          <CardTitle className="mt-2 text-lg">{issue.title}</CardTitle>
          <CardDescription>
            <span className="font-mono">{issue.ruleKey}</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <IssueSection title="What’s wrong" body={issue.description} />
          <IssueSection
            title="Why it matters"
            body={issue.impact}
            /* Some rules genuinely carry no impact text. Saying so is honest;
               inventing a rationale would not be. */
            fallback="No impact statement is recorded for this rule."
          />
          <div>
            <h2 className="text-sm font-semibold text-foreground">How to fix</h2>
            {issue.recommendation ? (
              <p className="mt-1 text-sm text-secondary-foreground">{issue.recommendation}</p>
            ) : (
              <p className="mt-1 text-sm text-muted">No fix guidance is recorded for this rule.</p>
            )}
            {issue.fixExample && (
              <pre className="mt-2 overflow-x-auto rounded-md bg-surface-subtle p-3 text-xs text-secondary-foreground">
                {issue.fixExample}
              </pre>
            )}
          </div>
        </CardContent>
      </Card>

      {children}

      <Card>
        <CardHeader>
          <CardTitle>Affected URLs</CardTitle>
          <CardDescription>{affectedUrlsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <AffectedUrlsTable
            rows={issue.affectedPages.map((page) => ({
              id: page.pageId,
              url: page.url,
              evidence: page.evidence,
            }))}
            basePath={detailPath}
            query={urlQuery}
            page={urlPage}
            emptyTitle="No affected URLs recorded"
            emptyDescription="This rule is recorded for the site but no individual page was captured against it."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function IssueSection({ title, body, fallback }: { title: string; body: string | null; fallback?: string }) {
  if (!body && !fallback) return null;
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {body ? (
        <p className="mt-1 text-sm text-secondary-foreground">{body}</p>
      ) : (
        <p className="mt-1 text-sm text-muted">{fallback}</p>
      )}
    </div>
  );
}
