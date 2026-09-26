import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { gscConnections, gscMetrics } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptToken, encryptToken } from "./crypto";
import { needsRefresh, refreshAccessToken } from "./oauth";
import { fetchSearchAnalytics } from "./client";
import { getDefaultDateRange, parseSearchAnalyticsResponse } from "./parse";
import type { GscConnectionRow } from "./queries";

/**
 * Ensures the connection's access token is valid, refreshing it via the
 * stored (encrypted) refresh token if it has expired or is about to. Always
 * re-encrypts and persists the fresh access token + new expiry so the next
 * call can reuse it without another round trip to Google.
 */
export async function ensureFreshAccessToken(connection: GscConnectionRow): Promise<string> {
  if (!needsRefresh(connection.accessTokenExpiresAt)) {
    return decryptToken(connection.accessTokenEncrypted);
  }

  const refreshToken = decryptToken(connection.refreshTokenEncrypted);
  const refreshed = await refreshAccessToken(refreshToken);

  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await db
    .update(gscConnections)
    .set({
      accessTokenEncrypted: encryptToken(refreshed.access_token),
      accessTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(gscConnections.id, connection.id));

  return refreshed.access_token;
}

export class GscNotConnectedError extends Error {
  constructor() {
    super("Google Search Console is not connected for this website.");
  }
}

export class GscNoPropertySelectedError extends Error {
  constructor() {
    super("No Search Console property has been selected for this website yet.");
  }
}

/**
 * Runs a full sync: refresh token if needed, fetch the Queries and Pages
 * Search Analytics reports for the default 28-day window, and persist them
 * as a new batch (`syncId`). Old rows are left in place (history), UI reads
 * always resolve the latest `syncId` (see `getLatestGscMetrics`).
 */
export async function runGscSync(websiteId: string): Promise<{ syncId: string; queryRows: number; pageRows: number }> {
  const [connection] = await db
    .select()
    .from(gscConnections)
    .where(eq(gscConnections.websiteId, websiteId))
    .limit(1);

  if (!connection) throw new GscNotConnectedError();
  if (!connection.propertyUrl) throw new GscNoPropertySelectedError();

  await db
    .update(gscConnections)
    .set({ lastSyncStatus: "running", lastSyncStartedAt: new Date(), lastSyncError: null })
    .where(eq(gscConnections.id, connection.id));

  try {
    const accessToken = await ensureFreshAccessToken(connection);
    const { startDate, endDate } = getDefaultDateRange();

    const [queryJson, pageJson] = await Promise.all([
      fetchSearchAnalytics(accessToken, connection.propertyUrl, {
        startDate,
        endDate,
        dimensions: ["query"],
      }),
      fetchSearchAnalytics(accessToken, connection.propertyUrl, {
        startDate,
        endDate,
        dimensions: ["page"],
      }),
    ]);

    const queryRows = parseSearchAnalyticsResponse(queryJson);
    const pageRows = parseSearchAnalyticsResponse(pageJson);

    const syncId = randomUUID();
    const rowsToInsert = [
      ...queryRows.map((r) => ({
        websiteId,
        syncId,
        dimensionType: "query" as const,
        dimensionValue: r.dimensionValue,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        dateRangeStart: startDate,
        dateRangeEnd: endDate,
      })),
      ...pageRows.map((r) => ({
        websiteId,
        syncId,
        dimensionType: "page" as const,
        dimensionValue: r.dimensionValue,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        dateRangeStart: startDate,
        dateRangeEnd: endDate,
      })),
    ];

    if (rowsToInsert.length > 0) {
      await db.insert(gscMetrics).values(rowsToInsert);
    }

    await db
      .update(gscConnections)
      .set({ lastSyncStatus: "completed", lastSyncCompletedAt: new Date(), lastSyncError: null })
      .where(eq(gscConnections.id, connection.id));

    return { syncId, queryRows: queryRows.length, pageRows: pageRows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(gscConnections)
      .set({ lastSyncStatus: "failed", lastSyncCompletedAt: new Date(), lastSyncError: message })
      .where(eq(gscConnections.id, connection.id));
    throw err;
  }
}
