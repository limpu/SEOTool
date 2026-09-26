import { cache } from "react";

import { getGscConnection, getLatestGscMetrics } from "@/lib/gsc/queries";
import {
  buildTrend,
  findGscQueryMatch,
  getTrackedKeywordForWebsite,
  listRankChecks,
  listTrackedKeywords,
  type GscKeywordMatch,
  type KeywordRankCheckRow,
  type TrackedKeywordRow,
} from "@/lib/serp/queries";
import { summarisePositionTrend, type PositionObservation, type PositionTrendSummary } from "@/components/report/position";

/**
 * Stage 3B — the server-side loader for the Keywords / SERP report.
 *
 * WHY THIS IS NOT `_module-report/data.ts`
 * ----------------------------------------
 * That loader exists for the eight ISSUE-based modules: it calls
 * `computeWebsiteModuleReport(moduleKey)` and shapes `seo_issues` rows into a
 * rule list. Keywords has no `*_` rule prefix in `seo_rules` and not a single
 * row in `seo_issues` — it is a RECORD-based module (tracked keywords and
 * manually-logged rank checks), so forcing it through `ModuleKey` would have
 * meant inventing a rule vocabulary that does not exist. It gets its own
 * loader instead, over the tables it genuinely reads.
 *
 * Every function called here already existed (`src/lib/serp/queries.ts`,
 * `src/lib/gsc/queries.ts`). No `src/lib` business logic, no API route and no
 * DB schema was added or changed, and nothing here derives a metric the
 * platform does not already measure.
 *
 * `cache()`d because the layout needs the header chips and tab counts while
 * the page under it needs the rows — that must be one fetch per request.
 *
 * ─── The N+1 that is deliberately NOT reintroduced ───────────────────────
 * `matchKeywordToGsc()` re-reads the whole `gsc_metrics` table per keyword.
 * Phase 33 already fixed that in the API route by fetching the metrics ONCE
 * and joining in memory through the pure `findGscQueryMatch()`. The same
 * shape is used here, for the same reason.
 */

export interface KeywordRow {
  id: string;
  keyword: string;
  targetUrl: string | null;
  country: string | null;
  createdAt: Date;
  /**
   * Real Google-sourced metrics for this exact query in the last synced GSC
   * range, or `null`. `null` covers "GSC not connected", "never synced" and
   * "this query did not appear" — all genuine absences, never defaulted to 0.
   */
  gsc: GscKeywordMatch | null;
  /** Chronological manual observations + the GSC point, each labelled by source. */
  observations: PositionObservation[];
  trend: PositionTrendSummary;
  /** Count of manually-logged rank checks, including "not found" entries. */
  rankCheckCount: number;
}

export interface KeywordsReportData {
  keywords: KeywordRow[];
  /** Whether a GSC connection row exists for this website at all. */
  gscConnected: boolean;
  /** Whether that connection has a property selected. */
  gscPropertySelected: boolean;
  /** Whether a completed sync produced query rows we can cross-reference against. */
  gscHasSyncedQueries: boolean;
  gscRangeStart: string | null;
  gscRangeEnd: string | null;
  /** How many tracked keywords matched a real GSC query in the synced range. */
  gscMatchedCount: number;
}

function toObservations(rankChecks: KeywordRankCheckRow[], gsc: GscKeywordMatch | null): PositionObservation[] {
  // `buildTrend` is Phase 27's own shaping function — reused verbatim so the
  // report and the existing API cannot disagree about what the history is.
  return buildTrend(rankChecks, gsc).map((point) => ({
    date: point.date,
    position: point.position,
    source: point.source,
  }));
}

export const loadKeywordsReport = cache(async (websiteId: string): Promise<KeywordsReportData> => {
  const [tracked, connection, metrics] = await Promise.all([
    listTrackedKeywords(websiteId),
    getGscConnection(websiteId),
    getLatestGscMetrics(websiteId),
  ]);

  const hasSyncedQueries = Boolean(metrics.syncId) && metrics.queries.length > 0;

  // Rank-check history is per keyword, so this is genuinely one query each.
  // Bounded by how many keywords a user tracks, and every row is needed to
  // state a movement honestly.
  const histories = await Promise.all(tracked.map((row: TrackedKeywordRow) => listRankChecks(row.id)));

  const keywords: KeywordRow[] = tracked.map((row, index) => {
    const gsc = hasSyncedQueries
      ? findGscQueryMatch(
          metrics.queries,
          row.keyword,
          metrics.dateRangeStart as string,
          metrics.dateRangeEnd as string
        )
      : null;
    const rankChecks = histories[index];
    const observations = toObservations(rankChecks, gsc);

    return {
      id: row.id,
      keyword: row.keyword,
      targetUrl: row.targetUrl,
      country: row.country,
      createdAt: row.createdAt,
      gsc,
      observations,
      trend: summarisePositionTrend(observations),
      rankCheckCount: rankChecks.length,
    };
  });

  return {
    keywords,
    gscConnected: Boolean(connection),
    gscPropertySelected: Boolean(connection?.propertyUrl),
    gscHasSyncedQueries: hasSyncedQueries,
    gscRangeStart: metrics.dateRangeStart,
    gscRangeEnd: metrics.dateRangeEnd,
    gscMatchedCount: keywords.filter((entry) => entry.gsc !== null).length,
  };
});

export interface KeywordDetailData extends KeywordRow {
  rankChecks: KeywordRankCheckRow[];
}

/**
 * One keyword's full detail. Returns `null` for a keyword that does not
 * belong to this website, so the route can call `notFound()` — the id arrives
 * from the URL and is never trusted.
 */
export const loadKeywordDetail = cache(
  async (websiteId: string, keywordId: string): Promise<KeywordDetailData | null> => {
    const keyword = await getTrackedKeywordForWebsite(websiteId, keywordId);
    if (!keyword) return null;

    const [rankChecks, metrics] = await Promise.all([
      listRankChecks(keyword.id),
      getLatestGscMetrics(websiteId),
    ]);

    const gsc =
      metrics.syncId && metrics.queries.length > 0
        ? findGscQueryMatch(
            metrics.queries,
            keyword.keyword,
            metrics.dateRangeStart as string,
            metrics.dateRangeEnd as string
          )
        : null;

    const observations = toObservations(rankChecks, gsc);

    return {
      id: keyword.id,
      keyword: keyword.keyword,
      targetUrl: keyword.targetUrl,
      country: keyword.country,
      createdAt: keyword.createdAt,
      gsc,
      observations,
      trend: summarisePositionTrend(observations),
      rankCheckCount: rankChecks.length,
      rankChecks,
    };
  }
);
