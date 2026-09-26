/**
 * Pure parsers for Google's Analytics Admin/Data API response shapes. Kept
 * side-effect-free and independent of `fetch`/DB so they can be unit-tested
 * directly against fixtures shaped like Google's real, documented response
 * formats — mirrors src/lib/gsc/parse.ts's discipline.
 */

export interface Ga4Property {
  propertyId: string; // "properties/123456789"
  displayName: string;
  accountDisplayName: string;
}

/**
 * Parses the Admin API `accountSummaries` response:
 * `{ accountSummaries: [{ account, displayName, propertySummaries: [{ property, displayName }] }] }`.
 * Flattens every property across every account the connected Google account
 * can see into one list — same "return everything Google reports, let the
 * caller decide" approach as GSC's `parseSitesListResponse`.
 */
export function parseAccountSummariesResponse(json: unknown): Ga4Property[] {
  if (!json || typeof json !== "object" || !("accountSummaries" in json)) return [];
  const accounts = (json as { accountSummaries?: unknown }).accountSummaries;
  if (!Array.isArray(accounts)) return [];

  const properties: Ga4Property[] = [];
  for (const acc of accounts) {
    if (!acc || typeof acc !== "object") continue;
    const accountDisplayName =
      typeof (acc as { displayName?: unknown }).displayName === "string"
        ? (acc as { displayName: string }).displayName
        : "Unknown account";
    const propertySummaries = (acc as { propertySummaries?: unknown }).propertySummaries;
    if (!Array.isArray(propertySummaries)) continue;
    for (const p of propertySummaries) {
      if (!p || typeof p !== "object") continue;
      const propertyId = (p as { property?: unknown }).property;
      const displayName = (p as { displayName?: unknown }).displayName;
      if (typeof propertyId !== "string") continue;
      properties.push({
        propertyId,
        displayName: typeof displayName === "string" ? displayName : propertyId,
        accountDisplayName,
      });
    }
  }
  return properties;
}

/**
 * Generic parser for a Data API v1beta `runReport` response:
 * `{ dimensionHeaders, metricHeaders, rows: [{ dimensionValues: [{value}], metricValues: [{value}] }] }`.
 * Returns an array of plain records keyed by header name, with metric
 * values coerced to numbers (Google returns all metric values as strings).
 */
export function parseRunReportRows(json: unknown): Array<Record<string, string | number>> {
  if (!json || typeof json !== "object") return [];
  const obj = json as {
    dimensionHeaders?: unknown;
    metricHeaders?: unknown;
    rows?: unknown;
  };
  const dimensionHeaders = Array.isArray(obj.dimensionHeaders)
    ? obj.dimensionHeaders
        .map((h) => (h && typeof h === "object" && typeof (h as { name?: unknown }).name === "string" ? (h as { name: string }).name : null))
        .filter((n): n is string => n !== null)
    : [];
  const metricHeaders = Array.isArray(obj.metricHeaders)
    ? obj.metricHeaders
        .map((h) => (h && typeof h === "object" && typeof (h as { name?: unknown }).name === "string" ? (h as { name: string }).name : null))
        .filter((n): n is string => n !== null)
    : [];
  const rows = Array.isArray(obj.rows) ? obj.rows : [];

  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => {
      const record: Record<string, string | number> = {};
      const dimVals = Array.isArray(r.dimensionValues) ? r.dimensionValues : [];
      const metVals = Array.isArray(r.metricValues) ? r.metricValues : [];
      dimensionHeaders.forEach((name, i) => {
        const v = dimVals[i];
        record[name] = v && typeof v === "object" && typeof (v as { value?: unknown }).value === "string" ? (v as { value: string }).value : "";
      });
      metricHeaders.forEach((name, i) => {
        const v = metVals[i];
        const raw = v && typeof v === "object" ? (v as { value?: unknown }).value : undefined;
        const num = typeof raw === "string" ? Number(raw) : 0;
        record[name] = Number.isFinite(num) ? num : 0;
      });
      return record;
    });
}

export interface Ga4TrafficSummary {
  totalUsers: number;
  newUsers: number;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
}

/** Traffic report has no dimensions — one aggregate row (or zero if the property has no data). */
export function parseTrafficReport(json: unknown): Ga4TrafficSummary {
  const rows = parseRunReportRows(json);
  const r = rows[0];
  return {
    totalUsers: typeof r?.totalUsers === "number" ? r.totalUsers : 0,
    newUsers: typeof r?.newUsers === "number" ? r.newUsers : 0,
    sessions: typeof r?.sessions === "number" ? r.sessions : 0,
    engagedSessions: typeof r?.engagedSessions === "number" ? r.engagedSessions : 0,
    engagementRate: typeof r?.engagementRate === "number" ? r.engagementRate : 0,
  };
}

export interface Ga4PageRow {
  landingPage: string;
  views: number;
  users: number;
  averageEngagementTimeSeconds: number;
}

/**
 * GA4's Data API has no direct "average engagement time" metric — it's
 * derived here as `userEngagementDuration / users`, the standard GA4 UI
 * computation, never fabricated: if `users` is 0 the average is reported as
 * 0, not omitted or guessed.
 */
export function parsePagePerformanceReport(json: unknown): Ga4PageRow[] {
  return parseRunReportRows(json).map((r) => {
    const users = typeof r.totalUsers === "number" ? r.totalUsers : 0;
    const duration = typeof r.userEngagementDuration === "number" ? r.userEngagementDuration : 0;
    return {
      landingPage: typeof r.landingPage === "string" ? r.landingPage : "",
      views: typeof r.screenPageViews === "number" ? r.screenPageViews : 0,
      users,
      averageEngagementTimeSeconds: users > 0 ? duration / users : 0,
    };
  });
}

export interface Ga4ChannelRow {
  channel: string;
  sessions: number;
  users: number;
}

export function parseAcquisitionReport(json: unknown): Ga4ChannelRow[] {
  return parseRunReportRows(json).map((r) => ({
    channel: typeof r.sessionDefaultChannelGroup === "string" ? r.sessionDefaultChannelGroup : "Unassigned",
    sessions: typeof r.sessions === "number" ? r.sessions : 0,
    users: typeof r.totalUsers === "number" ? r.totalUsers : 0,
  }));
}

export interface Ga4ConversionSummary {
  keyEvents: number;
  sessions: number;
  conversionRate: number;
  /** True if the property returned zero key events — this may mean "no key events configured", not an error. */
  hasKeyEvents: boolean;
}

export function parseConversionReport(json: unknown): Ga4ConversionSummary {
  const rows = parseRunReportRows(json);
  const r = rows[0];
  const keyEvents = typeof r?.keyEvents === "number" ? r.keyEvents : 0;
  const sessions = typeof r?.sessions === "number" ? r.sessions : 0;
  return {
    keyEvents,
    sessions,
    conversionRate: sessions > 0 ? keyEvents / sessions : 0,
    hasKeyEvents: keyEvents > 0,
  };
}
