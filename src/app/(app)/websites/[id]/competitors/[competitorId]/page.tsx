import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatUpdatedAt } from "@/components/charts/format";
import {
  ContentGapBlock,
  CrawlCompetitorButton,
  RemoveCompetitorButton,
} from "@/components/report/competitor-actions";

import { loadCompetitorDetail } from "../data";

/**
 * Competitors → one competitor's side-by-side comparison.
 *
 * A CHILD route of the competitor list, not a tab. Every number is real Phase
 * 28 output (`computeCompetitorComparison`), which is itself built from each
 * site's most recent COMPLETED crawl plus Phase 22's scores and Phase 24's
 * AI-readiness — all reused verbatim, none re-implemented here.
 *
 * ─── The honesty rules on this page ──────────────────────────────────────
 *
 * 1. AN UNCRAWLED SIDE IS "NOT MEASURED", NOT ZERO. `buildSnapshot` returns a
 *    zeroed snapshot for a site with no completed run, which is correct for
 *    arithmetic and misleading on screen — "0 pages" reads as a measurement of
 *    an empty site. Every cell here is therefore rendered against whether that
 *    SIDE has a completed crawl, so an unmeasured side says so.
 * 2. THE ISSUE DIFF IS A SET DIFFERENCE, NOT A VERDICT. "Issues only the
 *    competitor has" does not mean you are better — it can equally mean their
 *    crawl reached pages yours did not. The page says that rather than
 *    implying a score.
 * 3. THE CRAWL BUDGETS DIFFER, AND THAT IS STATED. Competitors are crawled at
 *    50 pages / depth 2 against an owned site's 100 / depth 3, so page counts
 *    are not directly comparable and the page refuses to imply they are.
 * 4. NOTHING TOPICAL IS CLAIMED by the deterministic comparison. The only
 *    topical content on this page is the clearly-separated, provenance-marked
 *    AI block at the bottom.
 */
export default async function CompetitorDetailPage({
  params,
}: {
  params: Promise<{ id: string; competitorId: string }>;
}) {
  const { id, competitorId } = await params;
  const { user, site, access } = await requireWorkspacePage(id, "competitors");
  if (!access.entitled) return <UpgradeRequired label="Competitors" />;

  // `competitorId` comes from the URL and is validated against THIS website's
  // own competitors before anything renders — a real 404 otherwise, raised by
  // the route segment so the HTTP status is genuinely 404.
  const detail = await loadCompetitorDetail(user.id, site.id, site.name, competitorId);
  if (!detail) notFound();

  const listHref = `/websites/${site.id}/competitors`;
  const structural = detail.comparison?.structural ?? null;

  const yourCrawled = Boolean(structural?.yourSite.crawledAt);
  const theirCrawled = Boolean(structural?.competitor.crawledAt);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={listHref}
            className="inline-flex items-center gap-1.5 rounded-sm text-xs font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All competitors
          </Link>
          <h1 className="mt-1 text-xl font-bold break-words text-foreground">{detail.competitor.name}</h1>
          <p className="mt-0.5">
            <a
              href={detail.competitor.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-sm text-sm break-all text-secondary-foreground hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {detail.competitor.url}
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </a>
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <CrawlCompetitorButton
            websiteId={site.id}
            competitorId={detail.competitor.id}
            initialStatus={detail.summary.latestRun?.status ?? null}
          />
          <RemoveCompetitorButton
            websiteId={site.id}
            competitorId={detail.competitor.id}
            name={detail.competitor.name}
            redirectTo={listHref}
          />
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-default bg-surface-subtle px-3 py-2 text-xs text-secondary-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span>
          <strong className="font-semibold">Technical &amp; Structural Comparison.</strong> Measured from each
          site&apos;s most recent completed crawl. Competitor sites are crawled to a lighter budget than your own (50
          pages / depth 2 versus 100 / depth 3), so page counts describe what was crawled, not the size of either
          site.
        </span>
      </p>

      {!detail.comparison && (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              title="Nothing measured to compare yet"
              description="Neither this competitor nor your own site has a completed crawl, so there is no data on either side. Crawling the competitor above will produce its half."
            />
          </CardContent>
        </Card>
      )}

      {structural && (
        <>
          {(!yourCrawled || !theirCrawled) && (
            <Alert variant="warning">
              <p className="font-semibold">Only one side of this comparison has been measured</p>
              <p className="mt-0.5 text-sm text-secondary-foreground">
                {!theirCrawled
                  ? `${detail.competitor.name} has no completed crawl yet, so its column reads “Not measured” rather than zero.`
                  : `${site.name} has no completed crawl yet, so your column reads “Not measured” rather than zero.`}
              </p>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Site structure</CardTitle>
              <CardDescription>
                {yourCrawled && structural.yourSite.crawledAt
                  ? `Your crawl: ${formatUpdatedAt(structural.yourSite.crawledAt)}.`
                  : "Your site has no completed crawl."}{" "}
                {theirCrawled && structural.competitor.crawledAt
                  ? `Competitor crawl: ${formatUpdatedAt(structural.competitor.crawledAt)}.`
                  : "This competitor has no completed crawl."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Measurement</TableHead>
                    <TableHead numeric>{site.name}</TableHead>
                    <TableHead numeric>{detail.competitor.name}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <ComparisonRow
                    label="Pages crawled"
                    yours={yourCrawled ? structural.yourSite.pageCount : null}
                    theirs={theirCrawled ? structural.competitor.pageCount : null}
                  />
                  <ComparisonRow
                    label="Average words per page"
                    yours={yourCrawled ? structural.yourSite.avgWordCount : null}
                    theirs={theirCrawled ? structural.competitor.avgWordCount : null}
                  />
                  <ComparisonRow
                    label="Average headings per page"
                    yours={yourCrawled ? structural.yourSite.avgHeadingCount : null}
                    theirs={theirCrawled ? structural.competitor.avgHeadingCount : null}
                  />
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scores</CardTitle>
              <CardDescription>
                This platform&apos;s own 0-100 measures, computed identically for both sites. They are this
                product&apos;s scores, not Google&apos;s or any third party&apos;s.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Score</TableHead>
                    <TableHead numeric>{site.name}</TableHead>
                    <TableHead numeric>{detail.competitor.name}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <ComparisonRow
                    label="Technical"
                    yours={detail.comparison!.yourScores.technical.score}
                    theirs={detail.comparison!.competitorScores.technical.score}
                  />
                  <ComparisonRow
                    label="On-page"
                    yours={detail.comparison!.yourScores.onPage.score}
                    theirs={detail.comparison!.competitorScores.onPage.score}
                  />
                  <ComparisonRow
                    label="Performance"
                    yours={detail.comparison!.yourScores.performance.score}
                    theirs={detail.comparison!.competitorScores.performance.score}
                  />
                  <ComparisonRow
                    label="Overall"
                    yours={detail.comparison!.yourScores.overall.score}
                    theirs={detail.comparison!.competitorScores.overall.score}
                  />
                  <ComparisonRow
                    label="GEO readiness"
                    yours={detail.comparison!.yourAiSearchOverall.geo}
                    theirs={detail.comparison!.competitorAiSearchOverall.geo}
                  />
                  <ComparisonRow
                    label="AEO readiness"
                    yours={detail.comparison!.yourAiSearchOverall.aeo}
                    theirs={detail.comparison!.competitorAiSearchOverall.aeo}
                  />
                  <ComparisonRow
                    label="AI Overview readiness"
                    yours={detail.comparison!.yourAiSearchOverall.aio}
                    theirs={detail.comparison!.competitorAiSearchOverall.aio}
                  />
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rule findings — what differs</CardTitle>
              <CardDescription>
                A set difference between the distinct rules that fired on each site&apos;s latest completed crawl.
                This is not a verdict: a rule that fired only on their site may simply mean their crawl reached pages
                yours did not.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-3">
              <RuleList
                title={`Only on ${site.name}`}
                items={structural.issuesOnlyYouHave}
                emptyText="No rule fired on your site that did not also fire on theirs."
              />
              <RuleList
                title={`Only on ${detail.competitor.name}`}
                items={structural.issuesOnlyCompetitorHas}
                emptyText="No rule fired on their site that did not also fire on yours."
              />
              <RuleList
                title="On both sites"
                items={structural.issuesBothHave}
                emptyText="No rule fired on both sites."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Structured data types</CardTitle>
              <CardDescription>
                Schema.org `@type` values found in each site&apos;s crawled pages. An empty list means no structured
                data was found at all — an absence of markup, not a clean validation result.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-3">
              <RuleList
                title={`Only on ${site.name}`}
                items={structural.schemaTypesOnlyYouHave}
                emptyText="No type is unique to your site."
              />
              <RuleList
                title={`Only on ${detail.competitor.name}`}
                items={structural.schemaTypesOnlyCompetitorHas}
                emptyText="No type is unique to their site."
              />
              <RuleList
                title="On both sites"
                items={structural.schemaTypesBothHave}
                emptyText="No type appears on both sites."
              />
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Crawl history</CardTitle>
          <CardDescription>
            Every crawl this platform has run against {detail.competitor.name}, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.runs.length === 0 ? (
            <EmptyState
              title="Never crawled"
              description="No crawl has been run against this competitor yet. Nothing on this page can be measured until one completes."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead numeric>Pages crawled</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{run.createdAt.toLocaleString("en-US")}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          run.status === "completed" ? "good" : run.status === "failed" ? "critical" : "accent"
                        }
                        className="capitalize"
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell numeric>
                      {run.pagesCrawled === null ? (
                        <span className="text-xs text-muted">Not recorded</span>
                      ) : (
                        run.pagesCrawled.toLocaleString("en-US")
                      )}
                    </TableCell>
                    <TableCell>
                      {run.completedAt ? (
                        run.completedAt.toLocaleString("en-US")
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ContentGapBlock websiteId={site.id} competitorId={detail.competitor.id} />
    </div>
  );
}

/**
 * One comparison row. `null` on either side renders "Not measured" — never a
 * dash that could be read as a value and never a substituted 0.
 */
function ComparisonRow({
  label,
  yours,
  theirs,
}: {
  label: string;
  yours: number | null;
  theirs: number | null;
}) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell numeric>
        {yours === null ? <span className="text-xs text-muted">Not measured</span> : yours.toLocaleString("en-US")}
      </TableCell>
      <TableCell numeric>
        {theirs === null ? <span className="text-xs text-muted">Not measured</span> : theirs.toLocaleString("en-US")}
      </TableCell>
    </TableRow>
  );
}

function RuleList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-secondary-foreground">
        {title} <span className="tabular text-muted">({items.length.toLocaleString("en-US")})</span>
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item} className="rounded border border-default px-2 py-1 text-xs text-secondary-foreground">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
