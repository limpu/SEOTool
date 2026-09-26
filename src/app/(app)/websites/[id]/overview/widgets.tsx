import Link from "next/link";
import {
  Activity,
  BarChart3,
  Bot,
  Gauge as GaugeIcon,
  KeyRound,
  LineChart,
  ListChecks,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GaugeChart } from "@/components/charts/gauge-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { HorizontalBarChart } from "@/components/charts/horizontal-bar-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { StatTile } from "@/components/charts/stat-tile";
import { DeltaChip } from "@/components/charts/delta-chip";
import { CATEGORICAL, NEUTRAL_MARK, STATUS, sequentialFor } from "@/components/charts/palette";
import {
  foldTail,
  formatCls,
  formatCount,
  formatMetric,
  formatMilliseconds,
  formatRatioAsPercent,
  formatUpdatedAt,
  scoreBand,
  shortenUrl,
} from "@/components/charts/format";
import {
  cwvBand,
  cwvBandLabel,
  lighthouseBand,
  type CwvBand,
  type SeverityKey,
} from "@/lib/dashboard/overview-metrics";
import type { OverviewData } from "./data";

// ─── Shared widget chrome ──────────────────────────────────────────────────

/**
 * Every module widget on this dashboard has the same three-part header:
 * a title, a provenance line saying when the underlying data was last
 * measured, and a link into the full report for that module. Consistency
 * here is what makes the grid readable as a dashboard rather than as a pile
 * of unrelated panels.
 */
export function Widget({
  title,
  icon: Icon,
  updatedAt,
  updatedLabel = "Updated",
  href,
  linkLabel = "View full report",
  children,
  className = "",
}: {
  title: string;
  icon?: typeof Search;
  updatedAt?: Date | string | null;
  updatedLabel?: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  const updated = formatUpdatedAt(updatedAt);

  return (
    <Card className={`flex flex-col ${className}`}>
      <CardHeader
        action={
          href ? (
            <Link
              href={href}
              className="rounded-sm text-xs font-semibold whitespace-nowrap text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {linkLabel} →
            </Link>
          ) : undefined
        }
      >
        <CardTitle className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
          {title}
        </CardTitle>
        {/* Provenance, not decoration: a number with no "measured when" is a
            number a user cannot act on. Absent rather than faked when unknown. */}
        <p className="mt-0.5 text-xs text-muted">{updated ? `${updatedLabel}: ${updated}` : "Not measured yet"}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">{children}</CardContent>
    </Card>
  );
}

/** Maps a status band onto the `Badge` variant of the same name. */
function bandBadge(band: CwvBand, label?: string) {
  const variant = band === "good" ? "good" : band === "needs-improvement" ? "warning" : band === "poor" ? "critical" : "unknown";
  return <Badge variant={variant}>{label ?? cwvBandLabel(band)}</Badge>;
}

// ─── 2. SEO Health hero ────────────────────────────────────────────────────

/**
 * Severity colours come from the RESERVED status ramp, in fixed order, with
 * `info` on the neutral mark — an informational finding is not a verdict, so
 * it gets no status hue. Colour follows the severity, never its rank, so a
 * site whose worst tier is "medium" still paints medium amber rather than
 * repainting it as the new "worst" colour.
 */
const SEVERITY_COLOR: Record<SeverityKey, string> = {
  critical: STATUS.critical,
  high: STATUS.serious,
  medium: STATUS.warning,
  low: STATUS.good,
  info: NEUTRAL_MARK,
};

export function HealthHero({ data, websiteId }: { data: OverviewData; websiteId: string }) {
  const { scores, scoreDeltas, scoreHistory, hasCompletedCrawl, lastCrawl } = data;

  // `computeWebsiteScores` returns a real 100 ("zero issues found") even for a
  // site that has NEVER been crawled — arithmetically, zero issues against
  // zero pages. Surfacing that would be a fabricated perfect score, so every
  // score on this card is gated on a completed crawl actually existing.
  const overall = hasCompletedCrawl ? scores.overall.score : null;

  return (
    <Widget
      title="SEO Health"
      icon={GaugeIcon}
      updatedAt={hasCompletedCrawl ? (lastCrawl?.completedAt ?? lastCrawl?.startedAt) : null}
      updatedLabel="Last crawl"
      href={`/websites/${websiteId}/site-audit`}
      linkLabel="View Site Audit"
      className="lg:col-span-2"
    >
      {!hasCompletedCrawl ? (
        <EmptyState
          icon={GaugeIcon}
          title="No crawl yet"
          description="Run a site crawl to measure Technical, On-Page and Performance health. Nothing is scored until there is real crawl data."
          actionLabel="Run a crawl"
          actionHref={`/websites/${websiteId}/site-audit`}
        />
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="shrink-0 sm:w-52">
            <GaugeChart score={overall} size={200} />
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-xs font-medium text-secondary-foreground">Overall score</span>
              <DeltaChip delta={scoreDeltas?.overall.delta} />
            </div>
            {/* One point per completed crawl run — real measured history, not
                an interpolated line. Renders nothing below two points, since a
                one-point "trend" is not a trend. */}
            {scoreHistory.length >= 2 && (
              <div className="mt-2 flex flex-col items-center">
                <Sparkline
                  points={scoreHistory}
                  width={160}
                  height={36}
                  valueLabel="Overall score"
                  ariaLabel="Overall SEO score across recent crawls"
                />
                <span className="mt-0.5 text-[11px] text-muted">
                  Across {scoreHistory.length} crawls
                </span>
              </div>
            )}
          </div>

          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            <StatTile
              label="Technical"
              value={formatMetric(scores.technical.score, { unavailable: "Not measured" })}
              delta={scoreDeltas?.technical.delta}
            />
            <StatTile
              label="On-Page"
              value={formatMetric(scores.onPage.score, { unavailable: "Not measured" })}
              delta={scoreDeltas?.onPage.delta}
            />
            <StatTile
              label="Performance"
              value={formatMetric(scores.performance.score, { unavailable: "Not measured" })}
              delta={scoreDeltas?.performance.delta}
              footer={
                scores.performance.strategiesMeasured.length > 0
                  ? `From ${scores.performance.strategiesMeasured.join(" + ")} Lighthouse runs`
                  : "Run a PageSpeed audit to measure"
              }
            />
          </div>
        </div>
      )}
    </Widget>
  );
}

// ─── 3. Issues by severity ─────────────────────────────────────────────────

export function SeverityWidget({ data, websiteId }: { data: OverviewData; websiteId: string }) {
  const { severity, hasCompletedCrawl, lastCrawl } = data;

  const series = severity.slices.map((slice) => ({
    key: slice.key,
    label: slice.label,
    value: slice.value,
    color: SEVERITY_COLOR[slice.key],
  }));

  return (
    <Widget
      title="Issues by severity"
      icon={ListChecks}
      updatedAt={hasCompletedCrawl ? (lastCrawl?.completedAt ?? lastCrawl?.startedAt) : null}
      updatedLabel="Last crawl"
      href={`/websites/${websiteId}/site-audit`}
      linkLabel="View Site Audit"
    >
      {!hasCompletedCrawl ? (
        <EmptyState
          icon={ListChecks}
          title="No crawl yet"
          description="Issue severity is only known after a crawl has run."
          actionLabel="Run a crawl"
          actionHref={`/websites/${websiteId}/site-audit`}
        />
      ) : severity.total === 0 ? (
        // A MEASURED zero is a real, good result — and must read differently
        // from "we never measured this".
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <Badge variant="good">No issues found</Badge>
          <p className="mt-2 text-xs text-secondary-foreground">
            The last crawl found zero issues across all severities.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl leading-none font-bold text-foreground">
              {severity.total.toLocaleString("en-US")}
            </span>
            <span className="text-xs text-muted">
              distinct issue {severity.total === 1 ? "type" : "types"}
            </span>
          </div>
          {/* This counts distinct RULES, while the "Issues by module" card
              counts per-page OCCURRENCES — two different, both-correct
              measurements that would otherwise look like a contradiction
              sitting next to each other on the same screen. */}
          <p className="mt-1 text-xs text-muted">
            One rule that fires on many pages counts once here.
          </p>

          <div className="mt-3">
            <StackedBarChart series={series} ariaLabel="Issues by severity" />
          </div>

          {/* Legend is always present for ≥2 series, and carries the counts so
              the composition is readable without hovering. */}
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {severity.slices.map((slice) => (
              <li key={slice.key} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: SEVERITY_COLOR[slice.key] }}
                />
                <span className="text-secondary-foreground">{slice.label}</span>
                <span className="tabular ml-auto font-semibold text-foreground">{slice.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Widget>
  );
}

// ─── 4. Issues by module ───────────────────────────────────────────────────

export function ModulesWidget({ data, websiteId }: { data: OverviewData; websiteId: string }) {
  const { modules, hasCompletedCrawl, lastCrawl } = data;
  const total = modules.reduce((sum, module) => sum + module.totalIssues, 0);

  // Colour is keyed to the module's fixed position in MODULE_KEYS, never to
  // its rank by issue count — so a module dropping to zero issues does not
  // repaint every other module on the next crawl.
  const slices = modules.map((module, index) => ({
    key: module.key,
    label: module.label,
    slug: module.slug,
    value: module.totalIssues,
    color: CATEGORICAL[index],
  }));

  return (
    <Widget
      title="Issues by module"
      icon={BarChart3}
      updatedAt={hasCompletedCrawl ? (lastCrawl?.completedAt ?? lastCrawl?.startedAt) : null}
      updatedLabel="Last crawl"
      href={`/websites/${websiteId}/site-audit`}
      linkLabel="View Site Audit"
    >
      {!hasCompletedCrawl ? (
        <EmptyState
          icon={BarChart3}
          title="No crawl yet"
          description="Module breakdowns appear once a crawl has completed."
          actionLabel="Run a crawl"
          actionHref={`/websites/${websiteId}/site-audit`}
        />
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          {/* Counts per-page OCCURRENCES, unlike the "Issues by severity"
              card which counts distinct rules — labelled explicitly so the
              two totals don't read as a contradiction. */}
          <DonutChart
            slices={slices}
            total={total}
            totalLabel="issues across pages"
            emptyMessage="No issues found"
          />

          {/* Our own HTML legend rather than recharts' <Legend>: each row is a
              real link into that module's report. */}
          <ul className="w-full min-w-0 flex-1 space-y-1">
            {slices.map((slice) => (
              <li key={slice.key}>
                <Link
                  href={`/websites/${websiteId}/${slice.slug}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="truncate text-secondary-foreground">{slice.label}</span>
                  <span className="tabular ml-auto font-semibold text-foreground">{slice.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Widget>
  );
}

// ─── 5. PageSpeed ──────────────────────────────────────────────────────────

export function PageSpeedWidget({ data, websiteId }: { data: OverviewData; websiteId: string }) {
  const { audits, measuredAt } = data.pagespeed;

  return (
    <Widget
      title="PageSpeed & Core Web Vitals"
      icon={Activity}
      updatedAt={measuredAt}
      href={`/websites/${websiteId}/pagespeed`}
      linkLabel="View PageSpeed"
    >
      {audits.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No PageSpeed audit yet"
          description="Run a Lighthouse audit to measure mobile and desktop performance and Core Web Vitals."
          actionLabel="Run an audit"
          actionHref={`/websites/${websiteId}/pagespeed`}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {audits.map((audit) => (
              <StatTile
                key={audit.strategy}
                label={audit.strategy === "mobile" ? "Mobile performance" : "Desktop performance"}
                value={formatMetric(audit.performanceScore, { unavailable: "Not measured" })}
                trend={bandBadge(lighthouseBand(audit.performanceScore))}
              />
            ))}
          </div>

          <div className="space-y-3">
            {audits.map((audit) => (
              <div key={`${audit.strategy}-cwv`}>
                <div className="mb-1.5 text-xs font-semibold text-secondary-foreground capitalize">
                  {audit.strategy} Core Web Vitals
                </div>
                <ul className="space-y-1.5">
                  {(
                    [
                      { metric: "lcp" as const, label: "LCP", display: formatMilliseconds(audit.lcp), value: audit.lcp },
                      { metric: "cls" as const, label: "CLS", display: formatCls(audit.cls), value: audit.cls },
                      { metric: "inp" as const, label: "INP", display: formatMilliseconds(audit.inp), value: audit.inp },
                    ] as const
                  ).map((row) => (
                    <li key={row.label} className="flex items-center gap-2 text-xs">
                      <span className="w-9 font-medium text-secondary-foreground">{row.label}</span>
                      <span
                        className={`tabular font-semibold ${row.display.available ? "text-foreground" : "text-muted"}`}
                      >
                        {row.display.text}
                      </span>
                      <span className="ml-auto">{bandBadge(cwvBand(row.metric, row.value))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </Widget>
  );
}

// ─── 6. AI Search readiness ────────────────────────────────────────────────

export function AiReadinessWidget({ data, websiteId }: { data: OverviewData; websiteId: string }) {
  const { aiSearch, hasCompletedCrawl, lastCrawl } = data;

  const composites = [
    { key: "geo", label: "GEO", value: aiSearch.geo },
    { key: "aeo", label: "AEO", value: aiSearch.aeo },
    { key: "aio", label: "AIO", value: aiSearch.aio },
  ];

  const assessed = aiSearch.dimensions.filter((d) => d.status === "assessed");
  const unassessed = aiSearch.dimensions.filter((d) => d.status === "unassessed");

  return (
    <Widget
      title="AI Search readiness"
      icon={Bot}
      updatedAt={hasCompletedCrawl ? (lastCrawl?.completedAt ?? lastCrawl?.startedAt) : null}
      updatedLabel="Last crawl"
      href={`/websites/${websiteId}/ai-overview`}
      linkLabel="View AI Search"
    >
      {aiSearch.pagesAssessed === 0 ? (
        <EmptyState
          icon={Bot}
          title="No pages assessed yet"
          description="GEO / AEO / AIO readiness is computed from crawled page structure. Run a crawl first."
          actionLabel="Run a crawl"
          actionHref={`/websites/${websiteId}/site-audit`}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {composites.map((composite) => (
              <StatTile
                key={composite.key}
                label={composite.label}
                value={formatMetric(composite.value, { unavailable: "Not assessed" })}
                trend={composite.value !== null ? bandBadge(mapScoreBand(composite.value)) : undefined}
              />
            ))}
          </div>

          {assessed.length > 0 && (
            <HorizontalBarChart
              data={assessed.map((dimension) => ({
                label: dimension.label,
                value: dimension.score ?? 0,
                color: sequentialFor((dimension.score ?? 0) / 100),
                display: `${dimension.score}`,
              }))}
              maxDomain={100}
              valueLabel="Score"
              labelWidth={132}
            />
          )}

          {/* Unassessed dimensions are shown explicitly — never hidden, and
              never rendered as 0. "We did not measure this" is a different
              fact from "we measured this and it scored nothing". */}
          {unassessed.length > 0 && (
            <div className="rounded-lg border border-default bg-surface-subtle p-3">
              <div className="mb-2 text-xs font-semibold text-secondary-foreground">Not assessed</div>
              <ul className="flex flex-wrap gap-1.5">
                {unassessed.map((dimension) => (
                  <li key={dimension.key}>
                    <Badge variant="unknown" title="Requires semantic judgment this platform does not yet perform">
                      {dimension.label}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted">
                These need genuine semantic judgment, so they are deliberately left unscored rather than estimated.
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted">
            Assessed across {aiSearch.pagesAssessed.toLocaleString("en-US")} crawled page
            {aiSearch.pagesAssessed === 1 ? "" : "s"}.
          </p>
        </div>
      )}
    </Widget>
  );
}

function mapScoreBand(score: number): CwvBand {
  const band = scoreBand(score);
  if (band === "good") return "good";
  if (band === "warning") return "needs-improvement";
  if (band === "unmeasured") return "unmeasured";
  return "poor";
}

// ─── 7. E-E-A-T / Trust ────────────────────────────────────────────────────

export function TrustWidget({ data, websiteId }: { data: OverviewData; websiteId: string }) {
  const { eeat, hasCompletedCrawl, lastCrawl } = data;

  return (
    <Widget
      title="E-E-A-T / Trust signals"
      icon={ShieldCheck}
      updatedAt={hasCompletedCrawl ? (lastCrawl?.completedAt ?? lastCrawl?.startedAt) : null}
      updatedLabel="Last crawl"
      href={`/websites/${websiteId}/eeat`}
      linkLabel="View E-E-A-T"
    >
      {eeat.pagesAssessed === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No pages assessed yet"
          description="Trust signals are detected from crawled pages (About, Contact, Privacy, Terms, HTTPS, author signals)."
          actionLabel="Run a crawl"
          actionHref={`/websites/${websiteId}/site-audit`}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            {eeat.score === null ? (
              <span className="text-sm font-medium text-muted">Not assessed</span>
            ) : (
              <>
                <span className="text-3xl leading-none font-bold text-foreground">{eeat.score}</span>
                <span className="text-xs text-muted">trust score</span>
                {bandBadge(mapScoreBand(eeat.score))}
              </>
            )}
          </div>

          {/* A checklist, not a chart: these are per-signal present/absent
              facts, and a <div> communicates that better than recharts would. */}
          <ul className="space-y-1.5">
            {eeat.signals.map((signal) => {
              const band: CwvBand =
                signal.status === "unassessed" ? "unmeasured" : mapScoreBand(signal.score ?? 0);
              return (
                <li key={signal.key} className="flex items-center gap-2 text-xs">
                  <span className="truncate text-secondary-foreground" title={signal.evidence}>
                    {signal.label}
                  </span>
                  <span className="ml-auto shrink-0">
                    {signal.status === "unassessed" ? (
                      <Badge variant="unknown">Not assessed</Badge>
                    ) : (
                      bandBadge(band, signal.score === null ? "Not assessed" : `${signal.score}`)
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Widget>
  );
}

// ─── 8. Search Console ─────────────────────────────────────────────────────

export function SearchConsoleWidget({ data, websiteId }: { data: OverviewData; websiteId: string }) {
  const { gsc } = data;

  if (!gsc.connected) {
    return (
      <Widget title="Search Console" icon={Search} href={`/websites/${websiteId}/search-console`} linkLabel="Connect">
        <EmptyState
          icon={Search}
          title="Search Console not connected"
          description="Connect Google Search Console to see clicks, impressions, CTR and average position for this site."
          actionLabel="Connect Search Console"
          actionHref={`/websites/${websiteId}/search-console`}
        />
      </Widget>
    );
  }

  if (!gsc.hasData) {
    return (
      <Widget
        title="Search Console"
        icon={Search}
        href={`/websites/${websiteId}/search-console`}
        linkLabel="View Search Console"
      >
        <EmptyState
          icon={Search}
          title="Connected, but no data synced yet"
          description={
            gsc.propertyUrl
              ? `No metrics have been synced for ${gsc.propertyUrl} yet. Run a sync to pull performance data.`
              : "No verified Search Console property has been selected for this site yet."
          }
          actionLabel="Open Search Console"
          actionHref={`/websites/${websiteId}/search-console`}
        />
      </Widget>
    );
  }

  const { totals, topQueries, dateRangeStart, dateRangeEnd } = gsc;

  return (
    <Widget
      title="Search Console"
      icon={Search}
      updatedAt={dateRangeEnd}
      updatedLabel="Data through"
      href={`/websites/${websiteId}/search-console`}
      linkLabel="View Search Console"
      className="lg:col-span-2"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Clicks" value={formatCount(totals.clicks)} />
        <StatTile label="Impressions" value={formatCount(totals.impressions)} />
        <StatTile label="CTR" value={formatRatioAsPercent(totals.ctr, 2)} />
        <StatTile
          label="Avg. position"
          hint="Lower is better"
          value={formatMetric(totals.avgPosition, { decimals: 1, unavailable: "Not measured" })}
        />
      </div>

      {dateRangeStart && dateRangeEnd && (
        <p className="mt-2 text-[11px] text-muted">
          {dateRangeStart} → {dateRangeEnd}. Average position is impression-weighted, and{" "}
          <strong className="font-semibold">lower is better</strong> — a falling position number is an improvement.
        </p>
      )}

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold text-secondary-foreground">Top queries</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Query</TableHead>
              <TableHead numeric>Clicks</TableHead>
              <TableHead numeric>Impr.</TableHead>
              <TableHead numeric>CTR</TableHead>
              <TableHead numeric>Position</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topQueries.map((row) => (
              <TableRow key={row.query}>
                <TableCell className="max-w-[16rem] truncate" title={row.query}>
                  {row.query}
                </TableCell>
                <TableCell numeric>{row.clicks.toLocaleString("en-US")}</TableCell>
                <TableCell numeric>{row.impressions.toLocaleString("en-US")}</TableCell>
                <TableCell numeric>{(row.ctr * 100).toFixed(1)}%</TableCell>
                <TableCell numeric>{row.position.toFixed(1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Widget>
  );
}

// ─── 9. Google Analytics ───────────────────────────────────────────────────

export function AnalyticsWidget({ data, websiteId }: { data: OverviewData; websiteId: string }) {
  const { ga4 } = data;

  if (!ga4.connected) {
    return (
      <Widget
        title="Google Analytics"
        icon={Users}
        href={`/websites/${websiteId}/google-analytics`}
        linkLabel="Connect"
      >
        <EmptyState
          icon={Users}
          title="Google Analytics not connected"
          description="Connect a GA4 property to see users, sessions, engagement and acquisition channels."
          actionLabel="Connect Google Analytics"
          actionHref={`/websites/${websiteId}/google-analytics`}
        />
      </Widget>
    );
  }

  const { traffic, channels, dateRangeStart, dateRangeEnd } = ga4;
  // ≤7 named channels plus an aggregated "Other", so the ramp is never asked
  // for a 9th step and a long tail of 1-session channels cannot crowd out the
  // ones that matter.
  const folded = foldTail(
    channels.map((row) => ({ label: row.channel, value: row.sessions })),
    7
  );
  const maxSessions = folded.reduce((max, row) => Math.max(max, row.value), 0);

  return (
    <Widget
      title="Google Analytics"
      icon={Users}
      updatedAt={dateRangeEnd}
      updatedLabel="Data through"
      href={`/websites/${websiteId}/google-analytics`}
      linkLabel="View Analytics"
      className="lg:col-span-2"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Users" value={formatCount(traffic.totalUsers)} />
        <StatTile label="Sessions" value={formatCount(traffic.sessions)} />
        <StatTile label="Engaged sessions" value={formatCount(traffic.engagedSessions)} />
        <StatTile label="Engagement rate" value={formatRatioAsPercent(traffic.engagementRate, 1)} />
      </div>

      <p className="mt-2 text-[11px] text-muted">
        {dateRangeStart} → {dateRangeEnd}
      </p>

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold text-secondary-foreground">Acquisition channels</div>
        {folded.length === 0 ? (
          <p className="text-xs text-muted">No sessions reported for this period.</p>
        ) : (
          // Sequential single hue: this is one series ranked by magnitude, not
          // a set of unrelated categories, so it must not be a rainbow.
          <HorizontalBarChart
            data={folded.map((row) => ({
              label: row.label,
              value: row.value,
              color: sequentialFor(maxSessions > 0 ? row.value / maxSessions : 0),
            }))}
            valueLabel="Sessions"
            labelWidth={124}
          />
        )}
      </div>
    </Widget>
  );
}

// ─── 10. Keywords & Competitors ────────────────────────────────────────────

export function KeywordsWidget({ data, websiteId }: { data: OverviewData; websiteId: string }) {
  const { keywords } = data;

  return (
    <Widget title="Tracked keywords" icon={KeyRound} href={`/websites/${websiteId}/keywords`} linkLabel="View keywords">
      {keywords.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No keywords tracked yet"
          description="Add keywords to track their SERP position over time."
          actionLabel="Add a keyword"
          actionHref={`/websites/${websiteId}/keywords`}
        />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl leading-none font-bold text-foreground">{keywords.length}</span>
            <span className="text-xs text-muted">tracked</span>
          </div>
          <Table className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keywords.slice(0, 6).map((keyword) => (
                <TableRow key={keyword.id}>
                  <TableCell className="max-w-[12rem] truncate" title={keyword.keyword}>
                    {keyword.keyword}
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate text-secondary-foreground" title={keyword.targetUrl ?? ""}>
                    {keyword.targetUrl ? shortenUrl(keyword.targetUrl, 28) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Widget>
  );
}

export function CompetitorsWidget({ data, websiteId }: { data: OverviewData; websiteId: string }) {
  const { competitors } = data;

  return (
    <Widget
      title="Competitors"
      icon={LineChart}
      href={`/websites/${websiteId}/competitors`}
      linkLabel="View competitors"
    >
      {competitors.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="No competitors added yet"
          description="Add a competitor to compare structure, schema coverage and issues side by side."
          actionLabel="Add a competitor"
          actionHref={`/websites/${websiteId}/competitors`}
        />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl leading-none font-bold text-foreground">{competitors.length}</span>
            <span className="text-xs text-muted">tracked</span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {competitors.slice(0, 6).map((competitor) => (
              <li key={competitor.id} className="flex items-center gap-2 text-xs">
                <span className="truncate font-medium text-foreground">{competitor.name}</span>
                <span className="ml-auto truncate text-muted" title={competitor.url}>
                  {shortenUrl(competitor.url, 24)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Widget>
  );
}

// ─── Top recommendations ───────────────────────────────────────────────────

export function RecommendationsWidget({ data, websiteId }: { data: OverviewData; websiteId: string }) {
  const { topIssues, hasCompletedCrawl, lastCrawl, severity } = data;

  const severityVariant = (value: string) =>
    value === "critical" ? "critical" : value === "high" ? "serious" : value === "medium" ? "warning" : "neutral";

  return (
    <Widget
      title="Top recommendations"
      icon={ListChecks}
      updatedAt={hasCompletedCrawl ? (lastCrawl?.completedAt ?? lastCrawl?.startedAt) : null}
      updatedLabel="Last crawl"
      href={`/websites/${websiteId}/site-audit`}
      linkLabel="View all"
      className="lg:col-span-2"
    >
      {!hasCompletedCrawl ? (
        <EmptyState
          icon={ListChecks}
          title="No crawl yet"
          description="Recommendations are derived from issues found during a crawl."
          actionLabel="Run a crawl"
          actionHref={`/websites/${websiteId}/site-audit`}
        />
      ) : topIssues.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <Badge variant="good">Nothing high-priority</Badge>
          <p className="mt-2 text-xs text-secondary-foreground">
            The last crawl found no critical, high or medium issues
            {severity.total > 0 ? ` (${severity.total} lower-severity issue${severity.total === 1 ? "" : "s"} remain).` : "."}
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Issue</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead numeric>Pages</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topIssues.map((issue) => (
              <TableRow key={issue.ruleKey}>
                <TableCell className="max-w-[22rem] truncate" title={issue.title}>
                  {issue.title}
                </TableCell>
                <TableCell>
                  <Badge variant={severityVariant(issue.severity)}>{issue.severity}</Badge>
                </TableCell>
                <TableCell numeric>{issue.affectedPageCount.toLocaleString("en-US")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Widget>
  );
}
