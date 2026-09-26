import { db } from "@/lib/db";
import { trackedKeywords, keywordRankChecks } from "@/lib/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { getLatestGscMetrics } from "@/lib/gsc/queries";

export type TrackedKeywordRow = typeof trackedKeywords.$inferSelect;
export type KeywordRankCheckRow = typeof keywordRankChecks.$inferSelect;

export async function listTrackedKeywords(websiteId: string): Promise<TrackedKeywordRow[]> {
  return db
    .select()
    .from(trackedKeywords)
    .where(eq(trackedKeywords.websiteId, websiteId))
    .orderBy(desc(trackedKeywords.createdAt));
}

export async function getTrackedKeywordForWebsite(
  websiteId: string,
  keywordId: string
): Promise<TrackedKeywordRow | null> {
  const [row] = await db
    .select()
    .from(trackedKeywords)
    .where(and(eq(trackedKeywords.id, keywordId), eq(trackedKeywords.websiteId, websiteId)))
    .limit(1);
  return row ?? null;
}

export async function createTrackedKeyword(input: {
  websiteId: string;
  addedByUserId: string;
  keyword: string;
  targetUrl: string | null;
  country: string | null;
}): Promise<TrackedKeywordRow> {
  const [row] = await db.insert(trackedKeywords).values(input).returning();
  return row;
}

export async function deleteTrackedKeyword(websiteId: string, keywordId: string): Promise<void> {
  await db
    .delete(trackedKeywords)
    .where(and(eq(trackedKeywords.id, keywordId), eq(trackedKeywords.websiteId, websiteId)));
}

export async function listRankChecks(trackedKeywordId: string): Promise<KeywordRankCheckRow[]> {
  return db
    .select()
    .from(keywordRankChecks)
    .where(eq(keywordRankChecks.trackedKeywordId, trackedKeywordId))
    .orderBy(asc(keywordRankChecks.checkedDate));
}

export async function createRankCheck(input: {
  trackedKeywordId: string;
  checkedByUserId: string;
  checkedDate: string;
  position: number | null;
  serpFeatures: string[];
  notes: string | null;
}): Promise<KeywordRankCheckRow> {
  const [row] = await db.insert(keywordRankChecks).values(input).returning();
  return row;
}

export async function deleteRankCheck(trackedKeywordId: string, checkId: string): Promise<void> {
  await db
    .delete(keywordRankChecks)
    .where(and(eq(keywordRankChecks.id, checkId), eq(keywordRankChecks.trackedKeywordId, trackedKeywordId)));
}

export interface GscKeywordMatch {
  source: "gsc";
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  dateRangeStart: string;
  dateRangeEnd: string;
}

/**
 * Cross-references a tracked keyword's text against the website's most
 * recently synced GSC "query" dimension rows (Phase 26's `gsc_metrics`).
 * Case-insensitive exact match on the query string, since that's the only
 * reliable join key GSC gives us. Returns null when there's no GSC
 * connection, no completed sync, or no matching query in the synced range —
 * every one of those is a legitimate "not available" outcome, never
 * defaulted to fabricated data (Section 79 #3).
 */
export interface GscQueryRow {
  dimensionValue: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Pure join logic, factored out so it's unit-testable with fixture rows
 * shaped exactly like `gsc_metrics` "query"-dimension rows (see
 * `tests/unit/serp-gsc-match.test.ts`) without needing a real DB/GSC
 * connection. Case-insensitive exact match on the query string — the only
 * reliable join key GSC's API gives us.
 */
export function findGscQueryMatch(
  queries: GscQueryRow[],
  keyword: string,
  dateRangeStart: string,
  dateRangeEnd: string
): GscKeywordMatch | null {
  const normalized = keyword.trim().toLowerCase();
  const match = queries.find((q) => q.dimensionValue.trim().toLowerCase() === normalized);
  if (!match) return null;

  return {
    source: "gsc",
    clicks: match.clicks,
    impressions: match.impressions,
    ctr: match.ctr,
    position: match.position,
    dateRangeStart,
    dateRangeEnd,
  };
}

export async function matchKeywordToGsc(
  websiteId: string,
  keyword: string
): Promise<GscKeywordMatch | null> {
  const data = await getLatestGscMetrics(websiteId);
  if (!data.syncId) return null;

  return findGscQueryMatch(
    data.queries,
    keyword,
    data.dateRangeStart as string,
    data.dateRangeEnd as string
  );
}

export interface TrendPoint {
  date: string;
  position: number | null;
  source: "manual" | "gsc";
}

/**
 * Shapes a simple position-over-time series for one keyword: every manual
 * rank-check entry (chronological), plus — if GSC has a matching query for
 * the currently synced range — one additional GSC-sourced point labeled
 * with the sync's date range end, so the "did this improve" question is
 * answerable across both sources without conflating them (each point keeps
 * its own `source`).
 */
export function buildTrend(
  rankChecks: KeywordRankCheckRow[],
  gscMatch: GscKeywordMatch | null
): TrendPoint[] {
  const points: TrendPoint[] = rankChecks.map((c) => ({
    date: c.checkedDate,
    position: c.position,
    source: "manual" as const,
  }));

  if (gscMatch) {
    points.push({
      date: gscMatch.dateRangeEnd,
      position: gscMatch.position,
      source: "gsc" as const,
    });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}
