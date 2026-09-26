/**
 * Pure parsers for Google's Search Console API response shapes. Kept
 * side-effect-free and independent of `fetch`/DB so they can be unit-tested
 * directly against fixtures shaped like Google's real, documented response
 * format (see tests/unit/gsc-parse.test.ts), per this phase's verification
 * requirement to test the parser against a realistic fixture without live
 * credentials.
 */

export interface ParsedSite {
  siteUrl: string;
  permissionLevel: string;
}

/**
 * Parses the `sites.list` response:
 * `{ siteEntry: [{ siteUrl, permissionLevel }, ...] }`.
 * Only sites with verified/owner-level access are useful to link — this
 * returns everything Google reports and lets the caller decide, since
 * Google's own `permissionLevel` values (e.g. "siteOwner",
 * "siteFullUser", "siteRestrictedUser", "siteUnverifiedUser") are the
 * authoritative source, not something this app should second-guess.
 */
export function parseSitesListResponse(json: unknown): ParsedSite[] {
  if (!json || typeof json !== "object" || !("siteEntry" in json)) return [];
  const entries = (json as { siteEntry?: unknown }).siteEntry;
  if (!Array.isArray(entries)) return [];

  return entries
    .filter(
      (e): e is { siteUrl: string; permissionLevel: string } =>
        !!e && typeof e === "object" && typeof (e as { siteUrl?: unknown }).siteUrl === "string"
    )
    .map((e) => ({
      siteUrl: e.siteUrl,
      permissionLevel: typeof e.permissionLevel === "string" ? e.permissionLevel : "unknown",
    }));
}

export interface ParsedAnalyticsRow {
  dimensionValue: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Parses a `searchAnalytics/query` response:
 * `{ rows: [{ keys: ["some query"], clicks, impressions, ctr, position }, ...] }`.
 * `keys[0]` is the single requested dimension's value (this app always
 * queries one dimension — "query" or "page" — at a time, never both
 * together, so `keys` is always length 1).
 */
export function parseSearchAnalyticsResponse(json: unknown): ParsedAnalyticsRow[] {
  if (!json || typeof json !== "object" || !("rows" in json)) return [];
  const rows = (json as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => {
      const keys = Array.isArray(r.keys) ? (r.keys as unknown[]) : [];
      const dimensionValue = typeof keys[0] === "string" ? (keys[0] as string) : "";
      return {
        dimensionValue,
        clicks: typeof r.clicks === "number" ? r.clicks : 0,
        impressions: typeof r.impressions === "number" ? r.impressions : 0,
        ctr: typeof r.ctr === "number" ? r.ctr : 0,
        position: typeof r.position === "number" ? r.position : 0,
      };
    })
    .filter((r) => r.dimensionValue !== "");
}

/** Default date range: last 28 full days, matching GSC's own UI default. */
export function getDefaultDateRange(now: Date = new Date()): { startDate: string; endDate: string } {
  // GSC data typically lags 1-3 days; end "yesterday" to avoid requesting a
  // range Google hasn't finished processing yet.
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27); // 28-day window inclusive.

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}
