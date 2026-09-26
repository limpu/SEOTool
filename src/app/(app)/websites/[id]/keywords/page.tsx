import Link from "next/link";
import { Search, TrendingUp } from "lucide-react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricCard } from "@/components/report/metrics";
import { formatCount } from "@/components/charts/format";
import { AddKeywordForm } from "@/components/report/keyword-actions";
import {
  PositionDistribution,
  PositionMovementChip,
  PositionScaleNote,
  PositionSourceBadge,
  PositionValue,
} from "@/components/report/position-display";
import { POSITION_HINT, positionDistribution, weightedAveragePosition } from "@/components/report/position";

import { loadKeywordsReport, type KeywordRow } from "./data";

/**
 * Keywords / SERP → Overview tab.
 *
 * WHAT LEADS HERE, AND WHY
 * ------------------------
 * The record-level question ("what is keyword X doing") has its own route.
 * This page answers the PORTFOLIO question, which the list cannot: how much of
 * the tracked set ranks on page one, what actually moved since the last
 * observation, and how much of the set has real Google data behind it at all
 * versus only self-reported checks. That last figure is the one this page
 * exists to make unavoidable — a tracked set with no Search Console coverage
 * is a set of opinions, and the Overview says so rather than averaging the two
 * kinds of evidence together.
 *
 * ─── Honesty rules this page is built around ─────────────────────────────
 *
 * 1. LOWER IS BETTER. Every position figure carries the inverted-scale note,
 *    and every movement chip is computed by `describePositionMovement`, whose
 *    sign handling is pinned by explicit tests in both directions.
 * 2. "NOT RANKED" IS NOT A POSITION. A keyword the user could not find is
 *    excluded from the average and shown in its own distribution bucket. It
 *    is never coerced to 0, to 100, or to the bottom of the list.
 *    Correspondingly, the average is IMPRESSION-WEIGHTED over Search
 *    Console-sourced positions only, because those are the only positions with
 *    a weight to use.
 * 3. NO TREND FROM ONE POINT. A keyword with a single observation reports "Not
 *    enough history yet", never a flat line or a 0% change.
 *
 * Server Component; `loadKeywordsReport` is `cache()`d and shared with the
 * layout, so the whole page is one fetch.
 */
export default async function KeywordsOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { site, access } = await requireWorkspacePage(id, "keywords");
  if (!access.entitled) return <UpgradeRequired label="Keywords / SERP tracking" />;

  const data = await loadKeywordsReport(site.id);
  const base = `/websites/${site.id}/keywords`;

  if (data.keywords.length === 0) {
    return (
      <div className="space-y-5">
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={Search}
              title="No keywords tracked yet"
              description="Add a keyword you care about to start recording its position over time. Nothing is measured automatically — this platform does not scrape Google."
            />
          </CardContent>
        </Card>
        <AddKeywordCard websiteId={site.id} />
      </div>
    );
  }

  // Only Search Console-sourced positions carry impressions, so they are the
  // only ones that can be weighted. A manual observation has no weight and is
  // deliberately not averaged in beside them.
  const gscRows = data.keywords
    .filter((entry): entry is KeywordRow & { gsc: NonNullable<KeywordRow["gsc"]> } => entry.gsc !== null)
    .map((entry) => ({ position: entry.gsc.position, impressions: entry.gsc.impressions }));
  const averagePosition = weightedAveragePosition(gscRows);

  // The distribution is over every keyword's LATEST measured position from
  // either source, with "no measured position at all" kept as its own bucket.
  const latestPositions = data.keywords.map((entry) => entry.trend.latest?.position ?? null);
  const distribution = positionDistribution(latestPositions);

  const moved = data.keywords
    .filter((entry) => entry.trend.movement && entry.trend.movement.direction !== "unchanged")
    .sort((a, b) => (b.trend.movement?.places ?? 0) - (a.trend.movement?.places ?? 0));

  const withHistory = data.keywords.filter((entry) => entry.trend.measuredCount >= 2).length;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Tracked keyword portfolio</CardTitle>
          <CardDescription>
            Across {data.keywords.length.toLocaleString("en-US")} tracked keyword
            {data.keywords.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Keywords tracked"
              value={formatCount(data.keywords.length)}
              href={`${base}/tracked`}
              footer="Added by you"
            />
            <MetricCard
              label="With Search Console data"
              value={
                data.gscHasSyncedQueries
                  ? formatCount(data.gscMatchedCount)
                  : { available: false, text: "Not available" }
              }
              hint={data.gscHasSyncedQueries ? "Exact query match" : undefined}
              footer={
                data.gscHasSyncedQueries
                  ? `${data.gscRangeStart} → ${data.gscRangeEnd}`
                  : "Search Console not connected or never synced"
              }
            />
            <MetricCard
              label="Avg. position (Search Console)"
              value={
                averagePosition === null
                  ? { available: false, text: "No data" }
                  : { available: true, text: averagePosition.toFixed(1) }
              }
              hint={POSITION_HINT}
              footer={
                averagePosition === null
                  ? "No Google-sourced position for any tracked keyword"
                  : `Impression-weighted across ${gscRows.length.toLocaleString("en-US")} matched keyword${
                      gscRows.length === 1 ? "" : "s"
                    }`
              }
            />
            <MetricCard
              label="Keywords with movement"
              value={formatCount(moved.length)}
              footer={
                withHistory === 0
                  ? "No keyword has two measured observations yet"
                  : `${withHistory.toLocaleString("en-US")} keyword${
                      withHistory === 1 ? " has" : "s have"
                    } enough history to compare`
              }
            />
          </div>

          <PositionScaleNote className="mt-3" />
        </CardContent>
      </Card>

      {!data.gscHasSyncedQueries && (
        <Alert variant="info">
          <p className="font-semibold">
            {!data.gscConnected
              ? "Search Console is not connected for this website"
              : !data.gscPropertySelected
                ? "Search Console is connected, but no property has been selected"
                : "Search Console is connected, but no data has been synced yet"}
          </p>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            Without it, every position on this report is a rank check you logged yourself. Those are honest
            observations, but they are self-reported — not independently measured.{" "}
            <Link
              href={`/websites/${site.id}/search-console`}
              className="rounded-sm font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Go to the Search Console report
            </Link>
            .
          </p>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Position distribution</CardTitle>
          <CardDescription>
            Each keyword&apos;s most recent measured position, from whichever source recorded it last. Keywords with
            no measured position at all are counted separately, never as a bad rank.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PositionDistribution rows={distribution} total={data.keywords.length} noun="keywords" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          action={
            <Link
              href={`${base}/tracked`}
              className="rounded-sm text-xs font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              View all {data.keywords.length.toLocaleString("en-US")} keywords →
            </Link>
          }
        >
          <CardTitle>Recent movement</CardTitle>
          <CardDescription>
            Keywords whose two most recent measured observations differ, largest change first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {moved.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="Not enough history yet"
              description={
                withHistory === 0
                  ? "No tracked keyword has two measured positions to compare. Log a second rank check, or sync Search Console, and movement will appear here."
                  : "Every keyword with enough history is holding its previous position — no change to report."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead numeric>Previous</TableHead>
                  <TableHead numeric>Latest</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead>Latest source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moved.slice(0, 10).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Link
                        href={`${base}/tracked/${entry.id}`}
                        className="rounded-sm font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {entry.keyword}
                      </Link>
                    </TableCell>
                    <TableCell numeric>
                      <PositionValue position={entry.trend.previous?.position ?? null} />
                    </TableCell>
                    <TableCell numeric>
                      <PositionValue position={entry.trend.latest?.position ?? null} />
                    </TableCell>
                    <TableCell>
                      <PositionMovementChip movement={entry.trend.movement} />
                    </TableCell>
                    <TableCell>
                      {entry.trend.latest && <PositionSourceBadge source={entry.trend.latest.source} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddKeywordCard websiteId={site.id} />
    </div>
  );
}

function AddKeywordCard({ websiteId }: { websiteId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Track a new keyword</CardTitle>
        <CardDescription>
          Adding a keyword records nothing on its own — it creates the row you then log observations against, and it
          cross-references Search Console automatically when the query text matches exactly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AddKeywordForm websiteId={websiteId} />
      </CardContent>
    </Card>
  );
}
