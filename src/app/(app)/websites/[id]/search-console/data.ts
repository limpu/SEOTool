import { cache } from "react";
import { and, desc, eq, max } from "drizzle-orm";

import { db } from "@/lib/db";
import { gscMetrics } from "@/lib/db/schema";
import { getGscConnection, getLatestGscMetrics, isSyncStale, type GscConnectionRow } from "@/lib/gsc/queries";
import { isGscConfigured } from "@/lib/gsc/config";
import { overallCtr, weightedAveragePosition } from "@/components/report/position";

/**
 * Stage 3B — the server-side loader for the Search Console report.
 *
 * Like Keywords, this is a RECORD-based module: there is no `GSC_` rule
 * prefix in `seo_rules` and nothing in `seo_issues`, so it does not — and must
 * not — go through `_module-report/data.ts`'s `ModuleKey` machinery.
 *
 * WHAT IS ACTUALLY STORED, AND WHAT THEREFORE CANNOT BE REPORTED
 * --------------------------------------------------------------
 * `runGscSync` fetches exactly TWO Search Analytics reports — `dimensions:
 * ["query"]` and `dimensions: ["page"]` — and persists them as `gsc_metrics`
 * rows tagged `dimensionType`. That is the whole stored surface. There is no
 * country dimension, no device dimension, no search-appearance dimension and
 * no per-day breakdown anywhere in the schema, because none of them is ever
 * requested from Google. So this report has a Queries tab and a Pages tab and
 * stops there: shipping an empty "Countries" tab would advertise a capability
 * the product does not have. (Stated in the UI as well as here.)
 *
 * WHY A SECOND, PREVIOUS-BATCH READ EXISTS
 * ----------------------------------------
 * `getLatestGscMetrics` resolves only the newest `syncId`; old rows are
 * deliberately left in place as history by `runGscSync`. Reporting whether
 * average position IMPROVED needs the batch before it, so the previous
 * `syncId` is read here — read-only, indexed by `websiteId`, and only ever
 * used to produce a delta. When no earlier batch exists the answer is an
 * honest "not enough history yet", never a fabricated 0% change. No
 * `src/lib` business logic, API route or DB schema was added or changed.
 */

export interface GscRow {
  dimensionValue: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscTotals {
  clicks: number;
  impressions: number;
  /** Overall CTR as a 0-1 ratio. `null` when there were no impressions at all — 0/0 is not 0%. */
  ctr: number | null;
  /** Impression-weighted average position, matching Search Console's own aggregation. `null` when unweighable. */
  position: number | null;
  rowCount: number;
}

export type GscState =
  /** No Google OAuth credentials on the server at all. */
  | "not-configured"
  /** Configured, but this website has no connection row. */
  | "not-connected"
  /** Connected to a Google account, but no Search Console property chosen yet. */
  | "no-property"
  /** Property chosen, but no sync has ever produced rows. */
  | "no-data"
  /** Real synced rows exist. */
  | "ready";

export interface SearchConsoleReportData {
  state: GscState;
  connection: GscConnectionRow | null;
  /** True when the last sync ATTEMPT failed, independently of whether older data exists. */
  lastSyncFailed: boolean;
  stale: boolean;
  syncId: string | null;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  queries: GscRow[];
  pages: GscRow[];
  /** Totals over the query-dimension rows — the headline figures. */
  queryTotals: GscTotals;
  /** Totals over the page-dimension rows. Legitimately larger; see the note in the UI. */
  pageTotals: GscTotals;
  /** The batch before the current one, when one exists. */
  previous: {
    syncId: string;
    dateRangeStart: string;
    dateRangeEnd: string;
    queryTotals: GscTotals;
  } | null;
}

function totalsFor(rows: GscRow[]): GscTotals {
  let clicks = 0;
  let impressions = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: overallCtr(clicks, impressions),
    position: weightedAveragePosition(rows),
    rowCount: rows.length,
  };
}

export const loadSearchConsoleReport = cache(async (websiteId: string): Promise<SearchConsoleReportData> => {
  const configured = isGscConfigured();
  const connection = await getGscConnection(websiteId);

  const empty: GscTotals = { clicks: 0, impressions: 0, ctr: null, position: null, rowCount: 0 };
  const base = {
    connection,
    lastSyncFailed: connection?.lastSyncStatus === "failed",
    stale: isSyncStale(connection?.lastSyncCompletedAt ?? null),
    syncId: null,
    dateRangeStart: null,
    dateRangeEnd: null,
    queries: [] as GscRow[],
    pages: [] as GscRow[],
    queryTotals: empty,
    pageTotals: empty,
    previous: null,
  };

  if (!configured) return { ...base, state: "not-configured" };
  if (!connection) return { ...base, state: "not-connected" };
  if (!connection.propertyUrl) return { ...base, state: "no-property" };

  const latest = await getLatestGscMetrics(websiteId);
  if (!latest.syncId) return { ...base, state: "no-data" };

  const queries: GscRow[] = latest.queries.map(toRow);
  const pages: GscRow[] = latest.pages.map(toRow);

  // The batch immediately before the current one, if the user has ever synced
  // twice. One indexed read, and only ever used to state a change.
  const batches = await db
    .select({
      syncId: gscMetrics.syncId,
      dateRangeStart: gscMetrics.dateRangeStart,
      dateRangeEnd: gscMetrics.dateRangeEnd,
      createdAt: max(gscMetrics.createdAt),
    })
    .from(gscMetrics)
    .where(and(eq(gscMetrics.websiteId, websiteId), eq(gscMetrics.dimensionType, "query")))
    .groupBy(gscMetrics.syncId, gscMetrics.dateRangeStart, gscMetrics.dateRangeEnd)
    .orderBy(desc(max(gscMetrics.createdAt)));

  const previousRow = batches.find((entry) => entry.syncId !== latest.syncId) ?? null;

  let previous: SearchConsoleReportData["previous"] = null;
  if (previousRow) {
    const previousRows = await db
      .select({
        dimensionValue: gscMetrics.dimensionValue,
        clicks: gscMetrics.clicks,
        impressions: gscMetrics.impressions,
        ctr: gscMetrics.ctr,
        position: gscMetrics.position,
      })
      .from(gscMetrics)
      .where(and(eq(gscMetrics.syncId, previousRow.syncId), eq(gscMetrics.dimensionType, "query")));

    previous = {
      syncId: previousRow.syncId,
      dateRangeStart: previousRow.dateRangeStart,
      dateRangeEnd: previousRow.dateRangeEnd,
      queryTotals: totalsFor(previousRows.map(toRow)),
    };
  }

  return {
    ...base,
    state: "ready",
    syncId: latest.syncId,
    dateRangeStart: latest.dateRangeStart,
    dateRangeEnd: latest.dateRangeEnd,
    queries,
    pages,
    queryTotals: totalsFor(queries),
    pageTotals: totalsFor(pages),
    previous,
  };
});

function toRow(row: {
  dimensionValue: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}): GscRow {
  return {
    dimensionValue: row.dimensionValue,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  };
}
