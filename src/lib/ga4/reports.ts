/**
 * Builds Google Analytics Data API v1beta `runReport` request bodies for
 * exactly the four data categories the user scoped for this first version
 * (read.md Phase 36) — no more, no less:
 *   - Traffic: Users, New users, Sessions, Engaged sessions, Engagement rate
 *   - Page performance: Views, Users, Average engagement time, Landing pages
 *   - Acquisition: Organic Search, Direct, Referral, Organic Social, Paid
 *     Search, and any other channel GA4 itself reports (via the standard
 *     `sessionDefaultChannelGroup` dimension — this app does not invent its
 *     own channel taxonomy)
 *   - Conversion: Key events, Conversion count, Conversion rate (only
 *     meaningful if the property has key events configured; an empty/zero
 *     result is rendered honestly, never treated as an error)
 *
 * All metric/dimension names are Google's own documented GA4 Data API API
 * names (https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema).
 */

export interface Ga4DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export function trafficReportBody({ startDate, endDate }: Ga4DateRange) {
  return {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "totalUsers" },
      { name: "newUsers" },
      { name: "sessions" },
      { name: "engagedSessions" },
      { name: "engagementRate" },
    ],
  };
}

export function pagePerformanceReportBody({ startDate, endDate }: Ga4DateRange, limit = 25) {
  return {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "landingPage" }],
    metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }, { name: "userEngagementDuration" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit,
  };
}

export function acquisitionReportBody({ startDate, endDate }: Ga4DateRange) {
  return {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  };
}

export function conversionReportBody({ startDate, endDate }: Ga4DateRange) {
  return {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "keyEvents" }, { name: "sessions" }],
  };
}

/** Default date range: last 28 full days, matching this app's GSC default (Phase 26). */
export function getDefaultGa4DateRange(now: Date = new Date()): Ga4DateRange {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}
