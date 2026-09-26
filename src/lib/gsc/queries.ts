import { db } from "@/lib/db";
import { gscConnections, gscMetrics } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export type GscConnectionRow = typeof gscConnections.$inferSelect;

export async function getGscConnection(websiteId: string): Promise<GscConnectionRow | null> {
  const [row] = await db
    .select()
    .from(gscConnections)
    .where(eq(gscConnections.websiteId, websiteId))
    .limit(1);
  return row ?? null;
}

export async function deleteGscConnection(websiteId: string): Promise<void> {
  await db.delete(gscConnections).where(eq(gscConnections.websiteId, websiteId));
}

/** Returns the most recent sync's persisted rows, split by dimension type. */
export async function getLatestGscMetrics(websiteId: string) {
  const rows = await db
    .select()
    .from(gscMetrics)
    .where(eq(gscMetrics.websiteId, websiteId))
    .orderBy(desc(gscMetrics.createdAt));

  if (rows.length === 0) {
    return { syncId: null as string | null, dateRangeStart: null, dateRangeEnd: null, queries: [], pages: [] };
  }

  const latestSyncId = rows[0].syncId;
  const latest = rows.filter((r) => r.syncId === latestSyncId);

  return {
    syncId: latestSyncId,
    dateRangeStart: latest[0].dateRangeStart,
    dateRangeEnd: latest[0].dateRangeEnd,
    queries: latest
      .filter((r) => r.dimensionType === "query")
      .sort((a, b) => b.clicks - a.clicks),
    pages: latest.filter((r) => r.dimensionType === "page").sort((a, b) => b.clicks - a.clicks),
  };
}

export async function deleteMetricsForWebsite(websiteId: string): Promise<void> {
  await db.delete(gscMetrics).where(eq(gscMetrics.websiteId, websiteId));
}

/** True when a sync is worth re-running: no prior sync, or the last one is older than `staleAfterMs`. */
export function isSyncStale(
  lastSyncCompletedAt: Date | null,
  staleAfterMs = 1000 * 60 * 60 * 6, // 6 hours — GSC data itself only updates ~daily, so this is generous headroom against accidental repeat clicks, not a real staleness SLA.
  now: Date = new Date()
): boolean {
  if (!lastSyncCompletedAt) return true;
  return now.getTime() - lastSyncCompletedAt.getTime() > staleAfterMs;
}
