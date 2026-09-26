import Link from "next/link";
import { Info } from "lucide-react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricCard } from "@/components/report/metrics";
import { formatCount, formatRatioAsPercent, safeDelta } from "@/components/charts/format";
import {
  PositionDistribution,
  PositionMovementChip,
  PositionScaleNote,
  PositionValue,
} from "@/components/report/position-display";
import {
  POSITION_HINT,
  POSITION_LOWER_IS_BETTER,
  positionDistribution,
  describePositionMovement,
} from "@/components/report/position";

import { GscConnectionCard } from "./connection-card";
import { loadSearchConsoleReport } from "./data";

/**
 * Search Console → Overview tab.
 *
 * ─── The four KPIs, and the two that are easy to get wrong ───────────────
 *
 * CTR is `clicks / impressions` over the whole synced set, NOT the mean of the
 * per-row CTRs. A mean of ratios over 500 queries weights a 1-impression
 * query the same as a 300-impression one and produces a number that matches
 * nothing in Search Console.
 *
 * AVERAGE POSITION is IMPRESSION-WEIGHTED for the same reason, and it is an
 * INVERTED scale: lower is better. Every position figure on this page carries
 * that clarifier, and the change chip is computed with `lowerIsBetter: true`
 * so a fall from 12.4 to 9.6 renders GREEN and UP — see the explicit
 * two-direction tests in `tests/unit/report-position.test.ts`. On the live
 * dataset the weighted average is 9.6 where the unweighted mean would have
 * been 18.6, so this is not a rounding preference.
 *
 * ─── What this page refuses to do ────────────────────────────────────────
 *
 * With only one synced batch there is nothing to compare against, so no change
 * chip is drawn at all — not a "0%" and not a flat arrow. And a connected
 * property with no sync renders a sentence saying so, never a row of zeroed
 * KPIs.
 */
export default async function SearchConsoleOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { site, access } = await requireWorkspacePage(id, "search-console");
  if (!access.entitled) return <UpgradeRequired label="Search Console" />;

  const data = await loadSearchConsoleReport(site.id);
  const base = `/websites/${site.id}/search-console`;

  if (data.state !== "ready") {
    return (
      <div className="space-y-5">
        <GscConnectionCard websiteId={site.id} data={data} />
        <StoredDimensionsNote />
      </div>
    );
  }

  const totals = data.queryTotals;
  const previous = data.previous?.queryTotals ?? null;

  const positionMovement = describePositionMovement(previous?.position ?? null, totals.position);
  const clicksDelta = safeDelta(previous?.clicks ?? null, totals.clicks);
  const impressionsDelta = safeDelta(previous?.impressions ?? null, totals.impressions);
  const ctrDelta =
    previous?.ctr !== null && previous?.ctr !== undefined && totals.ctr !== null
      ? (totals.ctr - previous.ctr) * 100
      : null;

  const distribution = positionDistribution(data.queries.map((row) => row.position));
  const topQueries = [...data.queries].sort((a, b) => b.clicks - a.clicks).slice(0, 10);

  return (
    <div className="space-y-5">
      <GscConnectionCard websiteId={site.id} data={data} />

      <Card>
        <CardHeader>
          <CardTitle>Search performance</CardTitle>
          <CardDescription>
            Totals across all {totals.rowCount.toLocaleString("en-US")} query rows Google returned for{" "}
            {data.dateRangeStart} → {data.dateRangeEnd}.
            {data.previous
              ? ` Compared with the previous sync (${data.previous.dateRangeStart} → ${data.previous.dateRangeEnd}).`
              : " This is the first synced batch, so there is nothing to compare it against yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Clicks" value={formatCount(totals.clicks)} delta={clicksDelta} />
            <MetricCard label="Impressions" value={formatCount(totals.impressions)} delta={impressionsDelta} />
            <MetricCard
              label="CTR"
              value={formatRatioAsPercent(totals.ctr, 2)}
              delta={ctrDelta}
              deltaOptions={{ decimals: 2, suffix: "pp" }}
              footer="Total clicks ÷ total impressions"
            />
            <MetricCard
              label="Average position"
              value={
                totals.position === null
                  ? { available: false, text: "Not measured" }
                  : { available: true, text: totals.position.toFixed(1) }
              }
              hint={POSITION_HINT}
              delta={totals.position !== null && previous?.position ? totals.position - previous.position : null}
              deltaOptions={{ lowerIsBetter: POSITION_LOWER_IS_BETTER, decimals: 1 }}
              footer="Impression-weighted, as Search Console reports it"
              trend={<PositionMovementChip movement={positionMovement} />}
            />
          </div>

          <PositionScaleNote />

          {!data.previous && (
            <p className="text-xs text-muted">
              No change figures are shown because only one sync has ever completed for this property. A single
              measurement is not a trend, and a &ldquo;0%&rdquo; chip would claim a stability nobody observed.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where the queries rank</CardTitle>
          <CardDescription>
            All {totals.rowCount.toLocaleString("en-US")} synced queries by their average position over the range. A
            bucket showing 0 is a measured zero, not missing data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PositionDistribution rows={distribution} total={totals.rowCount} noun="queries" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          action={
            <Link
              href={`${base}/queries`}
              className="rounded-sm text-xs font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              View all {data.queries.length.toLocaleString("en-US")} queries →
            </Link>
          }
        >
          <CardTitle>Top queries by clicks</CardTitle>
          <CardDescription>First 10 of {data.queries.length.toLocaleString("en-US")}.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query</TableHead>
                <TableHead numeric>Clicks</TableHead>
                <TableHead numeric>Impressions</TableHead>
                <TableHead numeric>CTR</TableHead>
                <TableHead numeric title={`Average position — ${POSITION_HINT}`}>Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topQueries.map((row) => (
                <TableRow key={row.dimensionValue}>
                  <TableCell>
                    <span className="block max-w-xs truncate" title={row.dimensionValue}>
                      {row.dimensionValue}
                    </span>
                  </TableCell>
                  <TableCell numeric>{row.clicks.toLocaleString("en-US")}</TableCell>
                  <TableCell numeric>{row.impressions.toLocaleString("en-US")}</TableCell>
                  <TableCell numeric>{formatRatioAsPercent(row.ctr, 1).text}</TableCell>
                  <TableCell numeric>
                    <PositionValue position={row.position} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Query totals vs. page totals</CardTitle>
          <CardDescription>
            These two do not add up to the same number, and that is Google&apos;s behaviour, not a bug in this report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dimension</TableHead>
                <TableHead numeric>Rows</TableHead>
                <TableHead numeric>Clicks</TableHead>
                <TableHead numeric>Impressions</TableHead>
                <TableHead numeric>CTR</TableHead>
                <TableHead numeric title={`Average position — ${POSITION_HINT}`}>Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { label: "Queries", totals: data.queryTotals, href: `${base}/queries` },
                { label: "Pages", totals: data.pageTotals, href: `${base}/pages` },
              ].map((entry) => (
                <TableRow key={entry.label}>
                  <TableCell>
                    <Link
                      href={entry.href}
                      className="rounded-sm font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {entry.label}
                    </Link>
                  </TableCell>
                  <TableCell numeric>{entry.totals.rowCount.toLocaleString("en-US")}</TableCell>
                  <TableCell numeric>{entry.totals.clicks.toLocaleString("en-US")}</TableCell>
                  <TableCell numeric>{entry.totals.impressions.toLocaleString("en-US")}</TableCell>
                  <TableCell numeric>{formatRatioAsPercent(entry.totals.ctr, 2).text}</TableCell>
                  <TableCell numeric>
                    <PositionValue position={entry.totals.position} unavailable="Not measured" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted">
            Google withholds rare queries to protect user privacy, and caps each report at 1,000 rows, so the query
            report legitimately accounts for fewer clicks than the page report. Neither figure is scaled up to close
            the gap — that would be an estimate, not a measurement.
          </p>
        </CardContent>
      </Card>

      <StoredDimensionsNote />
    </div>
  );
}

/**
 * The data-limitation notice. Stated in the UI, not only in `read.md`, for the
 * same reason Stage 2 put its Sitemap/Robots limitations on the page: an
 * omission the user cannot see reads as a product that does not have the data,
 * or worse, as data that does not exist.
 */
function StoredDimensionsNote() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-default bg-surface-subtle px-3 py-2 text-xs text-secondary-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
      <span>
        This report covers the two dimensions the platform actually syncs and stores:{" "}
        <strong className="font-semibold">queries</strong> and <strong className="font-semibold">pages</strong>, over a
        rolling 28-day window. Countries, devices, search appearance and per-day breakdowns are not requested from
        Google and are not stored, so they are not reported here rather than being shown as empty.
      </span>
    </p>
  );
}
