import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, LineChart } from "lucide-react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricCard } from "@/components/report/metrics";
import { formatCount, formatRatioAsPercent } from "@/components/charts/format";
import { PositionTrendChart } from "@/components/charts/position-trend-chart";
import { DeleteKeywordButton, DeleteRankCheckButton, LogRankCheckForm } from "@/components/report/keyword-actions";
import {
  PositionMovementChip,
  PositionScaleNote,
  PositionSourceBadge,
  PositionValue,
} from "@/components/report/position-display";
import { POSITION_HINT } from "@/components/report/position";
import { SERP_FEATURE_LABELS, type SerpFeature } from "@/lib/serp/constants";

import { loadKeywordDetail } from "../../data";

/**
 * Keywords / SERP → one keyword's detail.
 *
 * A CHILD of the Keywords list, not a third tab: it is about one record, and
 * the tab bar above stays on "Keywords" so the section a user is in is still
 * obvious (`resolveActiveTab`'s longest-matching-prefix rule handles that for
 * free).
 *
 * ─── The two sources are shown SEPARATELY, then together ─────────────────
 *
 * Google Search Console metrics and self-logged rank checks are different
 * kinds of evidence. They get their own cards, each labelled with its source,
 * and the combined chart labels every point. They are never averaged into one
 * unlabelled "position" — that would present a self-reported number and a
 * measured one as the same thing.
 *
 * `keywordId` arrives from the URL and is VALIDATED against this website's own
 * keywords before anything renders — an id belonging to another site, or one
 * that has since been deleted, is a real HTTP 404 rather than an empty shell.
 * The `notFound()` is called in the route segment (never in a shared child)
 * so the 404 is a genuine 404 status, matching Stage 1's decision.
 */
export default async function KeywordDetailPage({
  params,
}: {
  params: Promise<{ id: string; keywordId: string }>;
}) {
  const { id, keywordId } = await params;
  const { site, access } = await requireWorkspacePage(id, "keywords");
  if (!access.entitled) return <UpgradeRequired label="Keywords / SERP tracking" />;

  const detail = await loadKeywordDetail(site.id, keywordId);
  if (!detail) notFound();

  const listHref = `/websites/${site.id}/keywords/tracked`;

  // Only observations that carry a REAL position can be plotted. A "not found"
  // entry is excluded rather than drawn at zero — position 0 does not exist.
  const chartPoints = detail.observations
    .filter((point): point is typeof point & { position: number } => point.position !== null)
    .map((point) => ({ label: point.date, position: point.position, source: point.source }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={listHref}
            className="inline-flex items-center gap-1.5 rounded-sm text-xs font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All tracked keywords
          </Link>
          <h2 className="mt-1 text-lg font-bold break-words text-foreground">{detail.keyword}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary-foreground">
            {detail.country && <span>Country: {detail.country}</span>}
            {detail.targetUrl && (
              <a
                href={detail.targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-sm break-all hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {detail.targetUrl}
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
            )}
          </p>
        </div>
        <DeleteKeywordButton
          websiteId={site.id}
          keywordId={detail.id}
          keyword={detail.keyword}
          redirectTo={listHref}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest reading</CardTitle>
          <CardDescription>
            {detail.trend.measuredCount === 0
              ? "No observation has recorded a position for this keyword yet."
              : `From ${detail.trend.measuredCount.toLocaleString("en-US")} measured observation${
                  detail.trend.measuredCount === 1 ? "" : "s"
                } across ${detail.trend.totalCount.toLocaleString("en-US")} total.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Latest position"
              value={
                detail.trend.latest
                  ? { available: true, text: String(detail.trend.latest.position) }
                  : { available: false, text: "Not ranked" }
              }
              hint={POSITION_HINT}
              footer={detail.trend.latest ? `${detail.trend.latest.date} · ${sourceLabel(detail.trend.latest.source)}` : "No position recorded"}
            />
            <MetricCard
              label="Best recorded"
              value={
                detail.trend.best === null
                  ? { available: false, text: "Not measured" }
                  : { available: true, text: String(detail.trend.best) }
              }
              hint={POSITION_HINT}
              footer="Lowest position number ever observed"
            />
            <MetricCard
              label="Worst recorded"
              value={
                detail.trend.worst === null
                  ? { available: false, text: "Not measured" }
                  : { available: true, text: String(detail.trend.worst) }
              }
              hint={POSITION_HINT}
              footer="Highest position number ever observed"
            />
            <div className="rounded-lg border border-default p-3">
              <p className="text-xs font-medium text-secondary-foreground">Movement</p>
              <div className="mt-2">
                {detail.trend.movement ? (
                  <>
                    <PositionMovementChip movement={detail.trend.movement} />
                    <p className="mt-1 text-[11px] text-muted">
                      {detail.trend.previous!.date} → {detail.trend.latest!.date}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm leading-tight font-medium text-muted">Not enough history yet</p>
                    <p className="mt-1 text-[11px] text-muted">
                      Two measured observations are needed before a change can be reported.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <PositionScaleNote className="mt-3" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rank history</CardTitle>
          <CardDescription>
            Position over time. The vertical axis is inverted so position 1 sits at the top — a line that climbs is a
            ranking that improved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {chartPoints.length < 2 ? (
            <EmptyState
              icon={LineChart}
              title="Not enough history yet"
              description={
                chartPoints.length === 0
                  ? "No observation has recorded a position for this keyword. Log a rank check below, or sync Search Console."
                  : "Only one measured position exists. A single reading is not a trend, and drawing it as a flat line would claim a stability nobody observed."
              }
            />
          ) : (
            <PositionTrendChart
              points={chartPoints}
              ariaLabel={`Search position over time for “${detail.keyword}”. Lower is better; the axis is inverted so higher on the chart is a better rank.`}
            />
          )}

          {detail.observations.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead numeric>Position</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...detail.observations]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((point, index) => (
                    <TableRow key={`${point.date}-${point.source}-${index}`}>
                      <TableCell>{point.date}</TableCell>
                      <TableCell numeric>
                        <PositionValue position={point.position} unavailable="Not found" />
                      </TableCell>
                      <TableCell>
                        <PositionSourceBadge source={point.source} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Search Console</CardTitle>
          <CardDescription>
            Real Google-measured metrics for this exact query. Matched case-insensitively on the query string, which
            is the only reliable join key Search Console provides.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.gsc ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Clicks" value={formatCount(detail.gsc.clicks)} />
                <MetricCard label="Impressions" value={formatCount(detail.gsc.impressions)} />
                <MetricCard label="CTR" value={formatRatioAsPercent(detail.gsc.ctr)} />
                <MetricCard
                  label="Average position"
                  value={{ available: true, text: detail.gsc.position.toFixed(1) }}
                  hint={POSITION_HINT}
                />
              </div>
              <p className="text-xs text-muted">
                Range: {detail.gsc.dateRangeStart} to {detail.gsc.dateRangeEnd} (the last completed Search Console
                sync). <Badge variant="accent">Source: Google Search Console</Badge>
              </p>
            </div>
          ) : (
            <Alert variant="info">
              <p className="font-semibold">No Search Console data for this keyword</p>
              <p className="mt-0.5 text-sm text-secondary-foreground">
                Either Search Console is not connected or synced for this website, or this exact query did not appear
                in the last synced range. This is an absence of data, not a result of zero clicks.{" "}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual rank-check log</CardTitle>
          <CardDescription>
            Observations you recorded yourself, including the SERP features you saw. Self-reported, never
            independently measured — labelled &ldquo;Manual entry&rdquo; everywhere it appears.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail.rankChecks.length === 0 ? (
            <p className="text-sm text-muted">No manual rank checks logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {[...detail.rankChecks]
                .sort((a, b) => b.checkedDate.localeCompare(a.checkedDate))
                .map((check) => (
                  <li key={check.id} className="rounded-md border border-default px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-secondary-foreground">
                          <span className="font-medium text-foreground">{check.checkedDate}</span> —{" "}
                          {check.position !== null ? (
                            <>
                              Position <span className="tabular font-semibold text-foreground">{check.position}</span>
                            </>
                          ) : (
                            <span className="text-muted">Not found in the results checked</span>
                          )}
                        </p>
                        {check.serpFeatures.length > 0 && (
                          <p className="mt-1 flex flex-wrap gap-1.5">
                            {check.serpFeatures.map((feature) => (
                              <Badge key={feature} variant="neutral">
                                {SERP_FEATURE_LABELS[feature as SerpFeature] ?? feature}
                              </Badge>
                            ))}
                          </p>
                        )}
                        {check.notes && <p className="mt-1 text-xs text-secondary-foreground">{check.notes}</p>}
                        <p className="mt-1 text-[11px] tracking-wide text-muted uppercase">Source: Manual entry</p>
                      </div>
                      <DeleteRankCheckButton
                        websiteId={site.id}
                        keywordId={detail.id}
                        checkId={check.id}
                        label={check.checkedDate}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          )}

          <div className="rounded-lg border border-dashed border-default p-3">
            <p className="mb-2 text-xs font-semibold text-secondary-foreground">Log a rank check</p>
            <LogRankCheckForm websiteId={site.id} keywordId={detail.id} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function sourceLabel(source: "manual" | "gsc"): string {
  return source === "gsc" ? "Google Search Console" : "Manual entry";
}
