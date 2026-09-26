import Link from "next/link";
import { Info, Users } from "lucide-react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportHeader, type ReportChip } from "@/components/report/report-header";
import { AddCompetitorForm } from "@/components/report/competitor-actions";
import { formatUpdatedAt } from "@/components/charts/format";

import { loadCompetitorsReport, type CompetitorSummary } from "./data";

/**
 * Competitors — the whole report is ONE page, deliberately.
 *
 * ─── WHY THIS MODULE HAS NO TABS ─────────────────────────────────────────
 *
 * The obvious symmetric choice would have been Overview → List → Detail, to
 * match Keywords and Search Console. It was rejected because the Overview and
 * the List would have been THE SAME TABLE. A competitor set is a handful of
 * rows, not a long list to page through, and the only portfolio-level facts
 * worth stating — how many competitors, how many have a completed crawl — are
 * a sentence and two columns of the list itself. A second tab would have been
 * chrome that navigates between two renderings of one table, added purely so
 * this module looked like its neighbours.
 *
 * What IS genuinely a second view is one competitor's full side-by-side
 * comparison, and that is a real nested route (`competitors/[competitorId]`) —
 * a child of this page, not a sibling tab. So the tab bar is omitted entirely
 * rather than reduced to a single dead tab.
 *
 * ─── WHAT THIS REPORT WILL NEVER SHOW ────────────────────────────────────
 *
 * No Domain Authority. No backlink counts. No traffic or keyword-volume
 * estimates. No toxicity score. This platform measures none of them, and
 * Phase 28 named the module "Technical & Structural Comparison" precisely so
 * it could not drift into implying otherwise. Everything here comes from a
 * real crawl of the competitor's own public site by this platform's own
 * SSRF-safe, robots.txt-respecting crawler.
 */
export default async function CompetitorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site, access } = await requireWorkspacePage(id, "competitors");
  if (!access.entitled) return <UpgradeRequired label="Competitors" />;

  const data = await loadCompetitorsReport(user.id, site.id);
  const crawled = data.competitors.filter((entry) => entry.latestCompletedRun !== null).length;

  const chips: ReportChip[] = [
    { label: "Competitors", value: data.competitors.length.toLocaleString("en-US") },
    {
      label: "With a completed crawl",
      value:
        data.competitors.length === 0
          ? "None added"
          : `${crawled.toLocaleString("en-US")} of ${data.competitors.length.toLocaleString("en-US")}`,
      title: "Only a completed crawl produces the measurements a comparison reads.",
    },
    {
      label: "Your site last crawled",
      value: data.ownSiteCrawled ? (formatUpdatedAt(data.ownSiteCrawledAt) ?? "Completed") : "Never crawled",
    },
  ];

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Competitors"
        siteName={site.name}
        siteUrl={site.url}
        chips={chips}
      />

      <p className="flex items-start gap-2 rounded-lg border border-default bg-surface-subtle px-3 py-2 text-xs text-secondary-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span>
          This is a <strong className="font-semibold">Technical &amp; Structural Comparison</strong>. Every figure is
          measured by crawling the competitor&apos;s own public site with this platform&apos;s crawler — page counts,
          word and heading averages, rule-based findings, schema usage, and this platform&apos;s own scores. There is
          deliberately no Domain Authority, backlink count, traffic estimate or toxicity score anywhere in this
          report, because this platform does not measure any of them and will not guess.
        </span>
      </p>

      {!data.ownSiteCrawled && (
        <Alert variant="warning">
          <p className="font-semibold">Your own site has no completed crawl yet</p>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            A comparison needs both sides measured. Until this site has been crawled, your half of every comparison
            below will read as &ldquo;not measured&rdquo; rather than as a zero.{" "}
            <Link
              href={`/websites/${site.id}/site-audit#crawl-history`}
              className="rounded-sm font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Run a crawl
            </Link>
            .
          </p>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tracked competitors</CardTitle>
          <CardDescription>
            {data.competitors.length === 0
              ? "None added yet."
              : `${data.competitors.length.toLocaleString("en-US")} competitor${
                  data.competitors.length === 1 ? "" : "s"
                }. Open one for the full side-by-side comparison.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.competitors.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No competitors added yet"
              description="Register a competitor's public website below, crawl it, and this report will compare the two sites' measured structure."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competitor</TableHead>
                  <TableHead>Latest crawl</TableHead>
                  <TableHead numeric>Pages crawled</TableHead>
                  <TableHead>Comparison</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Your own site is pinned first as the baseline every row is
                    compared against — it is the denominator of this table, not
                    a competitor, and is labelled as such. */}
                <TableRow className="bg-surface-subtle">
                  <TableCell>
                    <span className="font-semibold text-foreground">{site.name}</span>
                    <Badge variant="accent" className="ml-2">
                      Your site
                    </Badge>
                    <span className="mt-0.5 block text-xs break-all text-muted">{site.url}</span>
                  </TableCell>
                  <TableCell>
                    {data.ownSiteCrawled ? (
                      <Badge variant="good">completed</Badge>
                    ) : (
                      <Badge variant="unknown">never crawled</Badge>
                    )}
                    {data.ownSiteCrawledAt && (
                      <span className="mt-0.5 block text-xs text-muted">{formatUpdatedAt(data.ownSiteCrawledAt)}</span>
                    )}
                  </TableCell>
                  <TableCell numeric>
                    {data.ownSitePagesCrawled === null ? (
                      <span className="text-xs text-muted">Not measured</span>
                    ) : (
                      data.ownSitePagesCrawled.toLocaleString("en-US")
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted">Baseline</span>
                  </TableCell>
                </TableRow>

                {data.competitors.map((competitor) => (
                  <CompetitorRow key={competitor.id} websiteId={site.id} competitor={competitor} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a competitor</CardTitle>
          <CardDescription>
            Adding a competitor registers the site; it does not crawl it. Open the competitor and run a crawl to
            produce measurements. Competitor entries never appear in your website switcher and do not count against
            your Maximum Websites limit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddCompetitorForm websiteId={site.id} />
        </CardContent>
      </Card>
    </div>
  );
}

function CompetitorRow({ websiteId, competitor }: { websiteId: string; competitor: CompetitorSummary }) {
  const status = competitor.latestRun?.status ?? null;

  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/websites/${websiteId}/competitors/${competitor.id}`}
          className="rounded-sm font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {competitor.name}
        </Link>
        <span className="mt-0.5 block text-xs break-all text-muted">{competitor.domain}</span>
      </TableCell>
      <TableCell>
        {status === null ? (
          <Badge variant="unknown">never crawled</Badge>
        ) : (
          <Badge
            variant={status === "completed" ? "good" : status === "failed" ? "critical" : "accent"}
            className="capitalize"
          >
            {status}
          </Badge>
        )}
        {competitor.latestCompletedRun?.completedAt && (
          <span className="mt-0.5 block text-xs text-muted">
            {formatUpdatedAt(competitor.latestCompletedRun.completedAt)}
          </span>
        )}
      </TableCell>
      <TableCell numeric>
        {/* Never crawled is "Not measured", never 0 — a site nobody has looked
            at does not have zero pages. */}
        {competitor.latestCompletedRun?.pagesCrawled === null ||
        competitor.latestCompletedRun?.pagesCrawled === undefined ? (
          <span className="text-xs text-muted">Not measured</span>
        ) : (
          competitor.latestCompletedRun.pagesCrawled.toLocaleString("en-US")
        )}
      </TableCell>
      <TableCell>
        <Link
          href={`/websites/${websiteId}/competitors/${competitor.id}`}
          className="rounded-sm text-xs font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Compare →
        </Link>
      </TableCell>
    </TableRow>
  );
}
