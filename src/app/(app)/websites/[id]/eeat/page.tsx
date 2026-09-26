import Link from "next/link";
import { ShieldQuestion, UserRoundSearch } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { ModuleSeverityKpis, ModuleTopicGrid, ModuleTopIssues } from "@/components/report/module-overview";
import { topicLabel } from "@/components/report/module-definitions";
import { HealthGauge } from "@/components/report/metrics";
import { shortenUrl } from "@/components/charts/format";
import type { DimensionResult } from "@/lib/eeat/detect";

import { requireModulePage } from "../_module-report/chrome";
import { loadModuleReport } from "../_module-report/data";

/**
 * E-E-A-T / Trust → Overview tab.
 *
 * WHAT LEADS HERE: Phase 25's site-level Trust signals — About / Contact /
 * Privacy / Terms page detection, HTTPS, and the site-average author-and-date
 * signal — plus the composite they average into. Those exist for every crawled
 * site whether or not an `EEAT_` rule fires, and the four `EEAT_` rules
 * underneath are simply the subset of those same signals that came back
 * negative. Leading with the counts would put the shadow before the object.
 *
 * ─── The framing that must not be lost ───────────────────────────────────
 *
 * Every check on this page is a HEURISTIC MARKER of the kind Google's public
 * E-E-A-T guidance describes wanting to see. None of it measures Google's
 * actual internal ranking signals, and this platform has no access to them.
 * `src/lib/eeat/detect.ts` says exactly this in its own file header and
 * documents the false-positive and false-negative risk of each detector (a
 * real About page at `/our-story` will not be found; a URL merely containing
 * "about" may be). That framing is restated in the UI here, not left in a
 * source comment where no user will read it.
 *
 * ─── Measured zero vs. Not assessed ──────────────────────────────────────
 *
 * These are two different facts and this page never lets them look alike.
 *   - "About page: 0" is a MEASUREMENT: 100 pages were checked and none
 *     matched. It renders as a real score with a "Not found" verdict, and it
 *     is actionable.
 *   - "References" and "Experience Signals" are NOT ASSESSED: Phase 25
 *     declines to score them because judging citation quality and first-hand
 *     experience needs semantic judgment this engine cannot honestly produce.
 *     They render in their own group with the neutral `unknown` badge, are
 *     excluded from the composite, and carry Phase 25's own explanation.
 *
 * Server Component; one `cache()`d fetch shared with the layout.
 */

/**
 * The verdict word beside an assessed dimension's score.
 *
 * Most Trust dimensions are binary detections — a page either exists or it
 * does not, so the score is exactly 100 or exactly 0 and "Found" / "Not found"
 * is the honest phrasing. The site-average Author & Date Signal is NOT binary:
 * it averages four independent markers across every content-heavy page, so it
 * lands anywhere in between. Calling a 2/100 average "Found" would be
 * technically true and practically a lie, so a partial score says "Partial"
 * and lets the number carry the magnitude.
 */
function verdictFor(score: number): { label: string; variant: "good" | "warning" } {
  if (score >= 100) return { label: "Found", variant: "good" };
  if (score <= 0) return { label: "Not found", variant: "warning" };
  return { label: "Partial", variant: "warning" };
}

/** A site-level trust dimension. `assessed` rows show a real 0-100 score, including a real 0. */
function TrustRow({ dimension }: { dimension: DimensionResult }) {
  const unassessed = dimension.status === "unassessed";
  const verdict = dimension.score === null ? null : verdictFor(dimension.score);

  return (
    <li className="flex flex-col gap-1.5 border-b border-default py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{dimension.label}</p>
        <p className="mt-0.5 text-sm text-secondary-foreground">{dimension.evidence}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {unassessed || verdict === null ? (
          <Badge variant="unknown">Not assessed</Badge>
        ) : (
          <>
            <span className="tabular text-sm font-semibold text-foreground">{dimension.score}</span>
            <Badge variant={verdict.variant}>{verdict.label}</Badge>
          </>
        )}
      </div>
    </li>
  );
}

export default async function EeatOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { definition, site, access } = await requireModulePage("eeat", id);
  if (!access.entitled) return <UpgradeRequired label={definition.label} />;

  const data = await loadModuleReport(site.id, "eeat");
  const trust = data.eeat;
  const base = `/websites/${site.id}/${definition.slug}`;
  const issuesPath = `${base}/issues`;
  const crawlHistoryHref = `/websites/${site.id}/site-audit#crawl-history`;

  const previewIssues = data.issues.slice(0, 6).map((issue) => ({
    ...issue,
    href: `${issuesPath}/${encodeURIComponent(issue.ruleKey)}`,
    categoryLabel: topicLabel("eeat", issue.category),
  }));

  // Author signals are only computed for content-heavy pages (300+ words) —
  // a thin or navigational page legitimately has no byline to show, so
  // scoring one would manufacture a failure. Weakest first.
  const authorPages = (trust?.pages ?? [])
    .filter((page) => page.eligible && page.authorSignal !== null)
    .sort((a, b) => (a.authorSignal!.score ?? 0) - (b.authorSignal!.score ?? 0));

  return (
    <div className="space-y-5">
      {/* ─── 1. The framing, before any number ─────────────────────────── */}
      <Alert variant="info">
        <p className="font-semibold">What this report measures — and what it does not.</p>
        <p className="mt-0.5 text-sm text-secondary-foreground">
          Everything below is a check for observable markers of the kind Google&apos;s <em>public</em> E-E-A-T guidance
          describes wanting to see: an About page, a Contact page, a privacy policy, HTTPS, and visible authorship on
          content. <strong>These are heuristic markers, not measurements of any Google ranking factor.</strong> Google
          does not publish an E-E-A-T score and this platform has no access to one. Detection is by URL and title
          pattern, so a real About page at an unconventional address such as <code>/our-story</code> will not be found,
          and a page whose URL merely contains the word may be matched in error. Improving these markers is sound
          practice; it is not a guarantee of any ranking outcome.
        </p>
      </Alert>

      {/* ─── 2. The lead: site-level trust signals ─────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Site trust signals</CardTitle>
          <CardDescription>
            Detected across every successfully-crawled page of the most recent completed crawl.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!trust || trust.pagesAssessed === 0 ? (
            <EmptyState
              icon={ShieldQuestion}
              title="No crawl data to assess"
              description="Trust signals are detected during a crawl. Nothing has been checked yet — this is an absence of data, not a score of zero."
              actionLabel="Go to crawl history"
              actionHref={crawlHistoryHref}
            />
          ) : (
            <>
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:gap-6">
                <HealthGauge
                  score={trust.score}
                  label="Trust composite"
                  caption="0-100"
                  size={150}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-secondary-foreground">
                    An equal-weight average of five signals: About page, Contact page, Privacy Policy page, HTTPS, and
                    the site-average Author &amp; Date Signal. Terms of Service is detected and shown below but is
                    deliberately <em>not</em> part of the composite. Unassessed dimensions never count toward it.
                  </p>
                  <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <div className="flex gap-1.5">
                      <dt className="text-muted">Pages crawled successfully</dt>
                      <dd className="tabular font-semibold text-foreground">
                        {trust.pagesAssessed.toLocaleString("en-US")}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-muted">Content-heavy pages (300+ words)</dt>
                      <dd className="tabular font-semibold text-foreground">
                        {trust.contentPagesAssessed.toLocaleString("en-US")}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-1.5 text-xs text-muted">
                    This is a proprietary product score, not an official search-engine metric.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground">Measured signals</h3>
                <p className="mt-0.5 text-xs text-muted">
                  A score of <span className="tabular font-semibold text-secondary-foreground">0</span> here is a real
                  measurement — the crawl looked and did not find it — and is different from the &quot;Not
                  assessed&quot; group below.
                </p>
                <ul className="mt-1">
                  {trust.dimensions.map((dimension) => (
                    <TrustRow key={dimension.key} dimension={dimension} />
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground">Not assessed by this platform</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Shown rather than hidden, because omitting them would imply the assessment above is complete. They
                  hold no score and count toward nothing.
                </p>
                <ul className="mt-1">
                  {trust.unassessed.map((dimension) => (
                    <TrustRow key={dimension.key} dimension={dimension} />
                  ))}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── 3. Per-page authorship ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Author &amp; date signals by page</CardTitle>
          <CardDescription>
            Four independent markers per page — a visible byline, a <code>rel=&quot;author&quot;</code> link, an{" "}
            <code>author</code> property on Article-family schema, and a visible publish or modified date. Each
            contributes equally; no single convention is required. Weakest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!trust || trust.pagesAssessed === 0 ? (
            <EmptyState
              icon={UserRoundSearch}
              title="No crawl data"
              description="Author signals are only known after a crawl has completed."
              actionLabel="Go to crawl history"
              actionHref={crawlHistoryHref}
            />
          ) : authorPages.length === 0 ? (
            <EmptyState
              icon={UserRoundSearch}
              title="No content-heavy pages to assess"
              description="No crawled page reached the 300-word bar at which a byline is expected. Thin and navigational pages are deliberately not scored here rather than being marked down for lacking an author."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead numeric>Words</TableHead>
                    <TableHead numeric>Signal</TableHead>
                    <TableHead>What was found</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {authorPages.slice(0, 25).map((page) => (
                    <TableRow key={page.pageId}>
                      <TableCell className="max-w-0">
                        <span className="block truncate" title={page.url}>
                          {shortenUrl(page.url, 56)}
                        </span>
                      </TableCell>
                      <TableCell numeric>{page.wordCount.toLocaleString("en-US")}</TableCell>
                      <TableCell numeric>{page.authorSignal!.score}</TableCell>
                      <TableCell className="text-secondary-foreground">{page.authorSignal!.evidence}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted">
                Showing the {Math.min(25, authorPages.length).toLocaleString("en-US")} weakest of{" "}
                {authorPages.length.toLocaleString("en-US")} content-heavy page
                {authorPages.length === 1 ? "" : "s"} assessed. The full, searchable list of pages with no author or
                date signal at all is on the{" "}
                <Link
                  href={`${issuesPath}/EEAT_NO_AUTHOR_BYLINE`}
                  className="rounded-sm font-medium text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  EEAT_NO_AUTHOR_BYLINE
                </Link>{" "}
                issue page.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── 4. The rule findings ──────────────────────────────────────── */}
      <ModuleSeverityKpis
        countsBySeverity={data.countsBySeverity}
        totalIssueTypes={data.totalIssueTypes}
        totalAffectedPageInstances={data.totalAffectedPageInstances}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="Trust findings"
        description="The E-E-A-T rules recorded during the most recent completed crawl. All are informational by design — a missing About page is a best-practice gap, not a defect, and this report will not call it one."
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
        title="By trust area"
        description="Every area with at least one finding, linking into the pre-filtered issue list. An area with no findings is not listed — an absent area is not a measured zero."
      />

      <ModuleTopIssues
        issues={previewIssues}
        totalIssueTypes={data.totalIssueTypes}
        issuesPath={issuesPath}
        crawlHistoryHref={crawlHistoryHref}
        hasCompletedCrawl={data.hasCompletedCrawl}
        emptyDescription="The most recent completed crawl recorded no E-E-A-T findings — every marker these rules look for was present."
      />
    </div>
  );
}
