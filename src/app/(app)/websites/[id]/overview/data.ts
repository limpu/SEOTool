/**
 * Server-side data assembly for the website Overview dashboard.
 *
 * Every number on that page comes from an ALREADY-EXISTING compute/query
 * function — this module only calls them, shapes their output into
 * plain-serializable widget props, and applies the honest fallbacks. Nothing
 * here invents a metric.
 *
 * The page is a Server Component and does all of its fetching here; the chart
 * components are thin `"use client"` leaves that receive computed props. No
 * data is ever fetched client-side.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { crawlRuns, pagespeedAudits } from "@/lib/db/schema";
import { computeWebsiteScores, computeCrawlRunScores } from "@/lib/scoring/compute";
import { computeWebsiteRecommendations } from "@/lib/recommendations/compute";
import { computeWebsiteAiSearch } from "@/lib/ai-search/compute";
import { computeWebsiteEeat } from "@/lib/eeat/compute";
import { computeWebsiteModuleReport, type ModuleKey } from "@/lib/module-reports/compute";
import { listCrawlRuns } from "@/lib/crawler/queries";
import { getGscConnection, getLatestGscMetrics } from "@/lib/gsc/queries";
import { getGa4Connection } from "@/lib/ga4/queries";
import { ensureFreshGa4AccessToken, Ga4NotConnectedError, Ga4NoPropertySelectedError } from "@/lib/ga4/token";
import { runGa4Report, Ga4ApiError } from "@/lib/ga4/client";
import { getDefaultGa4DateRange, acquisitionReportBody, trafficReportBody } from "@/lib/ga4/reports";
import { parseAcquisitionReport, parseTrafficReport, type Ga4TrafficSummary } from "@/lib/ga4/parse";
import { listTrackedKeywords } from "@/lib/serp/queries";
import { listCompetitorsForWebsite } from "@/lib/websites/queries";
import { diffScores, type ScoreDeltas } from "@/lib/retest/compare";
import {
  aggregateDimensions,
  buildSeverityBreakdown,
  computeGscTotals,
  type AggregatedDimension,
  type GscTotals,
  type SeverityKey,
  type SeveritySlice,
} from "@/lib/dashboard/overview-metrics";

/**
 * The five modules whose HEADLINE NUMBER on this dashboard is an issue count.
 *
 * Deliberately narrower than `ModuleKey`: Stage 3A added PageSpeed, AI Search
 * Intelligence and E-E-A-T / Trust, whose headline figures are Lighthouse
 * scores and readiness composites, not defect counts. Listing them in this
 * particular card would report, say, "AI Search: 3 issues" as if that were the
 * module's state, when the module's actual state is three readiness scores and
 * a set of dimensions it honestly does not assess. Those three already have
 * their own tiles elsewhere on this dashboard (PageSpeed snapshot, AI Search
 * readiness, Trust score) and their own full reports. The narrowing is what
 * keeps this card's meaning intact — it is not an oversight.
 */
export type IssueCountModuleKey = Extract<ModuleKey, "technical" | "on_page" | "schema" | "sitemap" | "robots">;

export const MODULE_KEYS: IssueCountModuleKey[] = ["technical", "on_page", "schema", "sitemap", "robots"];

export const MODULE_META: Record<IssueCountModuleKey, { label: string; slug: string }> = {
  technical: { label: "Technical", slug: "technical" },
  on_page: { label: "On-Page", slug: "on-page" },
  schema: { label: "Schema", slug: "schema" },
  sitemap: { label: "Sitemap", slug: "sitemap" },
  robots: { label: "Robots.txt", slug: "robots" },
};

export interface PageSpeedSnapshot {
  strategy: "mobile" | "desktop";
  performanceScore: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  measuredAt: Date | null;
}

export interface OverviewData {
  scores: Awaited<ReturnType<typeof computeWebsiteScores>>;
  /**
   * `null` unless TWO completed crawl runs exist. A delta chip is only ever
   * shown when the comparison genuinely exists — never a fabricated "0%".
   */
  scoreDeltas: ScoreDeltas | null;
  /**
   * Overall score at each of the last few completed crawl runs, oldest first.
   * Genuinely measured history — one point per real crawl, never interpolated
   * and never padded out to a fixed length. Fewer than two points means no
   * sparkline is drawn at all (a one-point "trend" is not a trend).
   */
  scoreHistory: { label: string; value: number }[];
  hasCompletedCrawl: boolean;
  lastCrawl: { status: string; startedAt: Date | null; completedAt: Date | null; pagesCrawled: number | null } | null;

  severity: { slices: SeveritySlice[]; total: number };
  topIssues: { ruleKey: string; title: string; severity: string; affectedPageCount: number }[];

  modules: { key: ModuleKey; label: string; slug: string; totalIssues: number; pagesScanned: number }[];

  pagespeed: { audits: PageSpeedSnapshot[]; measuredAt: Date | null };

  aiSearch: {
    pagesAssessed: number;
    geo: number | null;
    aeo: number | null;
    aio: number | null;
    dimensions: AggregatedDimension[];
  };

  eeat: {
    score: number | null;
    pagesAssessed: number;
    signals: { key: string; label: string; status: "assessed" | "unassessed"; score: number | null; evidence?: string }[];
  };

  gsc:
    | { connected: false }
    | {
        connected: true;
        hasData: false;
        propertyUrl: string | null;
      }
    | {
        connected: true;
        hasData: true;
        propertyUrl: string | null;
        totals: GscTotals;
        dateRangeStart: string | null;
        dateRangeEnd: string | null;
        topQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
      };

  ga4:
    | { connected: false }
    | {
        connected: true;
        traffic: Ga4TrafficSummary;
        channels: { channel: string; sessions: number; users: number }[];
        dateRangeStart: string;
        dateRangeEnd: string;
      };

  keywords: { id: string; keyword: string; targetUrl: string | null; country: string | null }[];
  competitors: { id: string; name: string; url: string }[];
}

/** Latest COMPLETED audit per strategy — a pending/failed run must never be read as a measurement. */
async function loadPageSpeed(websiteId: string): Promise<OverviewData["pagespeed"]> {
  const rows = await db
    .select()
    .from(pagespeedAudits)
    .where(and(eq(pagespeedAudits.websiteId, websiteId), eq(pagespeedAudits.status, "completed")))
    .orderBy(desc(pagespeedAudits.createdAt));

  const latestByStrategy = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByStrategy.has(row.strategy)) latestByStrategy.set(row.strategy, row);
  }

  const audits = (["mobile", "desktop"] as const)
    .map((strategy): PageSpeedSnapshot | null => {
      const row = latestByStrategy.get(strategy);
      if (!row) return null;
      return {
        strategy,
        performanceScore: row.performanceScore,
        lcp: row.lcp,
        cls: row.cls,
        inp: row.inp,
        measuredAt: row.completedAt ?? row.createdAt,
      };
    })
    .filter((entry): entry is PageSpeedSnapshot => entry !== null);

  const measuredAt = audits.reduce<Date | null>((latest, audit) => {
    if (!audit.measuredAt) return latest;
    if (!latest || audit.measuredAt > latest) return audit.measuredAt;
    return latest;
  }, null);

  return { audits, measuredAt };
}

/**
 * Best-effort live GA4 fetch — an EXACT copy of the graceful-failure pattern
 * `src/lib/dashboard/summary.ts` already established. Any failure (not
 * connected, no property selected, API error, expired refresh token) becomes
 * "not connected", never a fabricated number and never a thrown error: one
 * site's stale OAuth token must not 500 the whole dashboard.
 */
async function loadGa4(websiteId: string): Promise<OverviewData["ga4"]> {
  const connection = await getGa4Connection(websiteId);
  if (!connection || !connection.propertyId) return { connected: false };

  try {
    const accessToken = await ensureFreshGa4AccessToken(connection);
    const range = getDefaultGa4DateRange();
    const [trafficJson, acquisitionJson] = await Promise.all([
      runGa4Report(accessToken, connection.propertyId, trafficReportBody(range)),
      runGa4Report(accessToken, connection.propertyId, acquisitionReportBody(range)),
    ]);

    return {
      connected: true,
      traffic: parseTrafficReport(trafficJson),
      channels: parseAcquisitionReport(acquisitionJson).map((row) => ({
        channel: row.channel,
        sessions: row.sessions,
        users: row.users,
      })),
      dateRangeStart: range.startDate,
      dateRangeEnd: range.endDate,
    };
  } catch (err) {
    if (
      err instanceof Ga4NotConnectedError ||
      err instanceof Ga4NoPropertySelectedError ||
      err instanceof Ga4ApiError
    ) {
      return { connected: false };
    }
    return { connected: false };
  }
}

async function loadGsc(websiteId: string): Promise<OverviewData["gsc"]> {
  const connection = await getGscConnection(websiteId);
  if (!connection) return { connected: false };

  const propertyUrl = connection.propertyUrl ?? null;
  const metrics = await getLatestGscMetrics(websiteId);

  // Connected but never synced / no verified property → an honest
  // "connected, no data yet" state, NOT zeros.
  if (metrics.queries.length === 0) {
    return { connected: true, hasData: false, propertyUrl };
  }

  return {
    connected: true,
    hasData: true,
    propertyUrl,
    totals: computeGscTotals(metrics.queries),
    dateRangeStart: metrics.dateRangeStart,
    dateRangeEnd: metrics.dateRangeEnd,
    topQueries: metrics.queries.slice(0, 8).map((row) => ({
      query: row.dimensionValue,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    })),
  };
}

/**
 * The most recent completed crawl runs, newest first. Index 0/1 are the only
 * honest basis for a delta chip; the whole (reversed) set is the score
 * sparkline's history. Capped at 5 because each entry costs a real
 * `computeCrawlRunScores` aggregation.
 */
async function recentCompletedRuns(websiteId: string) {
  return db
    .select({ id: crawlRuns.id, completedAt: crawlRuns.completedAt, createdAt: crawlRuns.createdAt })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(5);
}

export async function loadOverviewData(websiteId: string, userId: string): Promise<OverviewData> {
  const [
    scores,
    recommendations,
    aiSearchResult,
    eeatResult,
    moduleReports,
    runs,
    completedRuns,
    pagespeed,
    gsc,
    ga4,
    keywords,
    competitors,
  ] = await Promise.all([
    computeWebsiteScores(websiteId),
    computeWebsiteRecommendations(websiteId),
    computeWebsiteAiSearch(websiteId),
    computeWebsiteEeat(websiteId),
    Promise.all(MODULE_KEYS.map((key) => computeWebsiteModuleReport(websiteId, key))),
    listCrawlRuns(websiteId),
    recentCompletedRuns(websiteId),
    loadPageSpeed(websiteId),
    loadGsc(websiteId),
    loadGa4(websiteId),
    listTrackedKeywords(websiteId),
    listCompetitorsForWebsite(userId, websiteId),
  ]);

  // One real score per completed crawl run. Runs are fetched newest-first;
  // the history is reversed so the sparkline reads left-to-right in time.
  const runScores = await Promise.all(completedRuns.map((run) => computeCrawlRunScores(run.id, websiteId)));

  const scoreHistory = completedRuns
    .map((run, index) => ({ run, score: runScores[index].overall.score }))
    .filter((entry): entry is { run: (typeof completedRuns)[number]; score: number } => entry.score !== null)
    .reverse()
    .map((entry) => ({
      label: (entry.run.completedAt ?? entry.run.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value: entry.score,
    }));

  // Deltas only exist with a genuine baseline: two completed crawl runs.
  // With one run (or none) there is nothing to compare against, so no chip is
  // rendered at all rather than a fabricated "0%".
  const scoreDeltas: ScoreDeltas | null =
    completedRuns.length >= 2 ? diffScores(runScores[1], runScores[0]) : null;

  const severityCounts: Partial<Record<SeverityKey, number>> = {};
  for (const tier of ["critical", "high", "medium", "low", "info"] as const) {
    severityCounts[tier] = recommendations[tier]?.length ?? 0;
  }

  const topIssues = (["critical", "high", "medium"] as const)
    .flatMap((tier) => recommendations[tier] ?? [])
    .slice(0, 6)
    .map((issue) => ({
      ruleKey: issue.ruleKey,
      title: issue.title,
      severity: issue.severity,
      affectedPageCount: issue.affectedPages.length,
    }));

  const lastRun = runs[0];

  // GEO carries the widest assessed + unassessed dimension set, so it is the
  // one shown as the site-level dimension list.
  const dimensions = aggregateDimensions(aiSearchResult.pages.map((page) => ({ dimensions: page.geo.dimensions })));

  return {
    scores,
    scoreDeltas,
    scoreHistory,
    hasCompletedCrawl: completedRuns.length > 0,
    lastCrawl: lastRun
      ? {
          status: lastRun.status,
          startedAt: lastRun.startedAt,
          completedAt: lastRun.completedAt,
          pagesCrawled: lastRun.pagesCrawled,
        }
      : null,

    severity: buildSeverityBreakdown(severityCounts),
    topIssues,

    modules: MODULE_KEYS.map((key, index) => ({
      key,
      label: MODULE_META[key].label,
      slug: MODULE_META[key].slug,
      totalIssues: moduleReports[index].totalIssues,
      pagesScanned: moduleReports[index].pagesScanned,
    })),

    pagespeed,

    aiSearch: {
      pagesAssessed: aiSearchResult.pagesAssessed,
      geo: aiSearchResult.geo,
      aeo: aiSearchResult.aeo,
      aio: aiSearchResult.aio,
      dimensions,
    },

    eeat: {
      score: eeatResult.score,
      pagesAssessed: eeatResult.pagesAssessed,
      signals: [...eeatResult.dimensions, ...eeatResult.unassessed].map((dimension) => ({
        key: dimension.key,
        label: dimension.label,
        status: dimension.status,
        score: dimension.score,
        evidence: dimension.evidence,
      })),
    },

    gsc,
    ga4,

    keywords: keywords.map((row) => ({
      id: row.id,
      keyword: row.keyword,
      targetUrl: row.targetUrl,
      country: row.country,
    })),
    competitors: competitors.map((row) => ({ id: row.id, name: row.name, url: row.url })),
  };
}
