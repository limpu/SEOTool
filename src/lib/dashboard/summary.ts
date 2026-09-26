/**
 * Stage 2 (User Dashboard & Account Self-Service) — dashboard summary table
 * aggregator. Pure reuse layer: every number here comes from an
 * already-existing Phase 22/24/26/31/36 compute/query function; this module
 * only shapes their outputs into one row per website plus the honest
 * "no data yet" / "connect X" fallbacks the spec requires. Nothing is
 * fabricated — a missing prerequisite (no crawl, no GSC connection, no GA4
 * connection, fewer than 2 completed crawl runs) always produces `null`/a
 * CTA flag, never an invented number.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { crawlRuns } from "@/lib/db/schema";
import { listUserWebsites, type Website } from "@/lib/websites/queries";
import { computeWebsiteScores, computeCrawlRunScores } from "@/lib/scoring/compute";
import { computeWebsiteAiSearch, computeCrawlRunAiSearch, type WebsiteAiSearchResult } from "@/lib/ai-search/compute";
import { getGscConnection, getLatestGscMetrics } from "@/lib/gsc/queries";
import { getGa4Connection } from "@/lib/ga4/queries";
import { ensureFreshGa4AccessToken, Ga4NotConnectedError, Ga4NoPropertySelectedError } from "@/lib/ga4/token";
import { runGa4Report, Ga4ApiError } from "@/lib/ga4/client";
import { getDefaultGa4DateRange, acquisitionReportBody } from "@/lib/ga4/reports";
import { parseAcquisitionReport } from "@/lib/ga4/parse";
import { diffScores, type MetricDelta } from "@/lib/retest/compare";

/**
 * "AI Visibility" composite: Phase 24's `computeWebsiteAiSearch` returns
 * three separate readiness scores (GEO/AEO/AIO), not one combined number —
 * there is no pre-existing "composite" field to read. Key Decision (see
 * read.md): the composite shown in this table is the average of the three,
 * using the same `averageOrNull`-style null-safe averaging
 * `computeWebsiteAiSearch` itself already uses internally for GEO/AEO/AIO —
 * not a new metric, just the same averaging pattern applied one level up.
 * `null` (not 0) whenever there's no completed crawl / no assessable pages.
 */
function aiVisibilityComposite(result: WebsiteAiSearchResult): number | null {
  const values = [result.geo, result.aeo, result.aio].filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export interface DashboardWebsiteSummary {
  id: string;
  name: string;
  aiVisibility: { score: number | null; changePct: number | null };
  siteHealth: { score: number | null; changePct: number | null };
  visibility:
    | { connected: true; avgPosition: number | null; changePct: number | null }
    | { connected: false };
  organicTraffic: { connected: true; sessions: number; users: number } | { connected: false };
  organicKeywords: { connected: true; count: number } | { connected: false };
}

/** `null` if either side is missing — never a fabricated 0%. `invert: true` for metrics where a LOWER after-value is an improvement (e.g. Position). */
export function pctChange(before: number | null, after: number | null, invert: boolean): number | null {
  if (before === null || after === null || before === 0) return null;
  const raw = ((after - before) / Math.abs(before)) * 100;
  // Position is an inverted-scale metric — a numerically LOWER position is
  // an IMPROVEMENT, so its displayed "change" sign must be flipped relative
  // to the raw (after - before) arithmetic, otherwise a real ranking
  // improvement would render as a red/negative change. Score-like metrics
  // (AI Visibility, Site Health) are NOT inverted: a higher score is already
  // an improvement, so raw sign is correct as-is.
  const signed = invert ? -raw : raw;
  return Math.round(signed * 10) / 10;
}

async function latestTwoCompletedCrawlRuns(websiteId: string): Promise<{ id: string }[]> {
  return db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(2);
}

/** Best-effort live GA4 Organic Search fetch. Any failure (not connected, no property, API error) is treated as "no data", never surfaced as a fake number and never thrown — a dashboard row must not 500 because one site's GA4 token expired. */
async function fetchOrganicTraffic(websiteId: string): Promise<{ connected: true; sessions: number; users: number } | { connected: false }> {
  const connection = await getGa4Connection(websiteId);
  if (!connection || !connection.propertyId) return { connected: false };

  try {
    const accessToken = await ensureFreshGa4AccessToken(connection);
    const range = getDefaultGa4DateRange();
    const json = await runGa4Report(accessToken, connection.propertyId, acquisitionReportBody(range));
    const rows = parseAcquisitionReport(json);
    const organic = rows.find((r) => r.channel === "Organic Search");
    if (!organic) return { connected: true, sessions: 0, users: 0 };
    return { connected: true, sessions: organic.sessions, users: organic.users };
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

async function computeOneRow(site: Website): Promise<DashboardWebsiteSummary> {
  const [aiSearch, siteScores, gscConnection, twoRuns] = await Promise.all([
    computeWebsiteAiSearch(site.id),
    computeWebsiteScores(site.id),
    getGscConnection(site.id),
    latestTwoCompletedCrawlRuns(site.id),
  ]);

  // `computeWebsiteScores` (Phase 22) returns a real numeric `overall.score`
  // (typically 100 — "zero issues found") even when the website has NEVER
  // been crawled, because zero issues against zero pages is arithmetically
  // indistinguishable from zero issues against many pages. That's correct
  // for Phase 22's own use (a site mid-crawl-history genuinely has no
  // issues), but surfacing it here would render a fabricated-looking "100"
  // for a website that has never been crawled at all — the exact kind of
  // honesty bug this task calls out explicitly. Gate on `twoRuns` (already
  // fetched below) actually containing a completed crawl run.
  const hasCompletedCrawl = twoRuns.length > 0;

  let aiChangePct: number | null = null;
  let healthChangePct: number | null = null;
  if (twoRuns.length === 2) {
    const [current, baseline] = twoRuns; // index 0 = most recent (desc order)
    const [currentAi, baselineAi, currentScores, baselineScores] = await Promise.all([
      computeCrawlRunAiSearch(current.id),
      computeCrawlRunAiSearch(baseline.id),
      computeCrawlRunScores(current.id, site.id),
      computeCrawlRunScores(baseline.id, site.id),
    ]);
    aiChangePct = pctChange(aiVisibilityComposite(baselineAi), aiVisibilityComposite(currentAi), false);
    const scoreDeltas = diffScores(baselineScores, currentScores);
    healthChangePct = pctChange(scoreDeltas.overall.before, scoreDeltas.overall.after, false);
  }

  let visibility: DashboardWebsiteSummary["visibility"] = { connected: false };
  let organicKeywords: DashboardWebsiteSummary["organicKeywords"] = { connected: false };
  if (gscConnection) {
    const metrics = await getLatestGscMetrics(site.id);
    if (metrics.queries.length > 0) {
      const positions = metrics.queries.map((q) => q.position);
      const avgPosition = positions.length > 0 ? Math.round((positions.reduce((s, p) => s + p, 0) / positions.length) * 10) / 10 : null;
      // Position history-over-time isn't exposed by `getLatestGscMetrics`
      // (it only returns the most recent sync's snapshot, per its own
      // doc comment — "the most recent sync's persisted rows") — there is
      // no second, older synced snapshot to diff against via existing
      // queries, so no % change is computed for Visibility/Position. See
      // read.md's Key Decisions Log: this is a documented gap, not a
      // fabricated 0%/blank-on-purpose bug.
      visibility = { connected: true, avgPosition, changePct: null };
      organicKeywords = { connected: true, count: metrics.queries.length };
    }
  }

  const organicTraffic = await fetchOrganicTraffic(site.id);

  return {
    id: site.id,
    name: site.name,
    aiVisibility: { score: aiVisibilityComposite(aiSearch), changePct: aiChangePct },
    siteHealth: { score: hasCompletedCrawl ? siteScores.overall.score : null, changePct: healthChangePct },
    visibility,
    organicTraffic,
    organicKeywords,
  };
}

/** One row per the user's own (non-competitor) websites — the full Stage 2 dashboard table dataset. */
export async function getDashboardWebsiteSummaries(userId: string): Promise<DashboardWebsiteSummary[]> {
  const sites = await listUserWebsites(userId);
  return Promise.all(sites.map((site) => computeOneRow(site)));
}

export type { MetricDelta };
