import { describe, it, expect } from "vitest";
import { parseAccountSummariesResponse, parseRunReportRows, parseTrafficReport, parsePagePerformanceReport, parseAcquisitionReport, parseConversionReport } from "@/lib/ga4/parse";
import { getDefaultGa4DateRange } from "@/lib/ga4/reports";

// Fixtures below are shaped exactly like Google's documented response
// formats for the Analytics Admin API v1beta `accountSummaries.list` and
// the Analytics Data API v1beta `properties.runReport` — hand-written
// fixtures matching Google's real, documented schema, not live data.

const ACCOUNT_SUMMARIES_FIXTURE = {
  accountSummaries: [
    {
      account: "accounts/1000",
      displayName: "Acme Corp",
      propertySummaries: [
        { property: "properties/111111", displayName: "Acme — Main Site" },
        { property: "properties/222222", displayName: "Acme — Blog" },
      ],
    },
    {
      account: "accounts/2000",
      displayName: "Other Business",
      propertySummaries: [{ property: "properties/333333", displayName: "Other — Store" }],
    },
  ],
};

const TRAFFIC_REPORT_FIXTURE = {
  dimensionHeaders: [],
  metricHeaders: [
    { name: "totalUsers", type: "TYPE_INTEGER" },
    { name: "newUsers", type: "TYPE_INTEGER" },
    { name: "sessions", type: "TYPE_INTEGER" },
    { name: "engagedSessions", type: "TYPE_INTEGER" },
    { name: "engagementRate", type: "TYPE_FLOAT" },
  ],
  rows: [
    {
      dimensionValues: [],
      metricValues: [
        { value: "4820" },
        { value: "3110" },
        { value: "6002" },
        { value: "4590" },
        { value: "0.7648" },
      ],
    },
  ],
};

const PAGE_REPORT_FIXTURE = {
  dimensionHeaders: [{ name: "landingPage" }],
  metricHeaders: [
    { name: "screenPageViews" },
    { name: "totalUsers" },
    { name: "userEngagementDuration" },
  ],
  rows: [
    {
      dimensionValues: [{ value: "/blog/best-running-shoes" }],
      metricValues: [{ value: "5100" }, { value: "2200" }, { value: "88000" }],
    },
    {
      dimensionValues: [{ value: "/" }],
      metricValues: [{ value: "2200" }, { value: "0" }, { value: "0" }],
    },
  ],
};

const ACQUISITION_REPORT_FIXTURE = {
  dimensionHeaders: [{ name: "sessionDefaultChannelGroup" }],
  metricHeaders: [{ name: "sessions" }, { name: "totalUsers" }],
  rows: [
    { dimensionValues: [{ value: "Organic Search" }], metricValues: [{ value: "3200" }, { value: "2500" }] },
    { dimensionValues: [{ value: "Direct" }], metricValues: [{ value: "1500" }, { value: "1200" }] },
    { dimensionValues: [{ value: "Referral" }], metricValues: [{ value: "400" }, { value: "350" }] },
  ],
};

const CONVERSION_REPORT_FIXTURE = {
  dimensionHeaders: [],
  metricHeaders: [{ name: "keyEvents" }, { name: "sessions" }],
  rows: [{ dimensionValues: [], metricValues: [{ value: "120" }, { value: "6002" }] }],
};

describe("parseAccountSummariesResponse", () => {
  it("flattens accounts/propertySummaries into a flat property list", () => {
    const result = parseAccountSummariesResponse(ACCOUNT_SUMMARIES_FIXTURE);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      propertyId: "properties/111111",
      displayName: "Acme — Main Site",
      accountDisplayName: "Acme Corp",
    });
    expect(result[2].accountDisplayName).toBe("Other Business");
  });

  it("returns an empty array for malformed/null input rather than throwing", () => {
    expect(parseAccountSummariesResponse(null)).toEqual([]);
    expect(parseAccountSummariesResponse({})).toEqual([]);
    expect(parseAccountSummariesResponse({ accountSummaries: "nope" })).toEqual([]);
  });
});

describe("parseRunReportRows (generic)", () => {
  it("returns an empty array when Google reports no rows (no fabricated placeholder rows)", () => {
    expect(parseRunReportRows({ rows: [] })).toEqual([]);
    expect(parseRunReportRows(null)).toEqual([]);
  });
});

describe("parseTrafficReport", () => {
  it("parses the aggregate Users/New users/Sessions/Engaged sessions/Engagement rate row", () => {
    const result = parseTrafficReport(TRAFFIC_REPORT_FIXTURE);
    expect(result).toEqual({
      totalUsers: 4820,
      newUsers: 3110,
      sessions: 6002,
      engagedSessions: 4590,
      engagementRate: 0.7648,
    });
  });

  it("returns all-zero, not fabricated data, when the property has no rows", () => {
    expect(parseTrafficReport({ rows: [] })).toEqual({
      totalUsers: 0,
      newUsers: 0,
      sessions: 0,
      engagedSessions: 0,
      engagementRate: 0,
    });
  });
});

describe("parsePagePerformanceReport", () => {
  it("parses landing pages with computed average engagement time (userEngagementDuration / users)", () => {
    const result = parsePagePerformanceReport(PAGE_REPORT_FIXTURE);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      landingPage: "/blog/best-running-shoes",
      views: 5100,
      users: 2200,
      averageEngagementTimeSeconds: 40, // 88000 / 2200
    });
  });

  it("reports 0 average engagement time (not NaN/Infinity) when users is 0", () => {
    const result = parsePagePerformanceReport(PAGE_REPORT_FIXTURE);
    const home = result.find((r) => r.landingPage === "/");
    expect(home?.averageEngagementTimeSeconds).toBe(0);
  });
});

describe("parseAcquisitionReport", () => {
  it("parses channel rows matching GA4's own sessionDefaultChannelGroup values", () => {
    const result = parseAcquisitionReport(ACQUISITION_REPORT_FIXTURE);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.channel)).toEqual(["Organic Search", "Direct", "Referral"]);
    expect(result[0]).toEqual({ channel: "Organic Search", sessions: 3200, users: 2500 });
  });
});

describe("parseConversionReport", () => {
  it("computes conversion rate from keyEvents / sessions", () => {
    const result = parseConversionReport(CONVERSION_REPORT_FIXTURE);
    expect(result).toEqual({
      keyEvents: 120,
      sessions: 6002,
      conversionRate: 120 / 6002,
      hasKeyEvents: true,
    });
  });

  it("honestly reports hasKeyEvents: false when a property has no key events configured, never fabricating a rate", () => {
    const result = parseConversionReport({ rows: [] });
    expect(result).toEqual({ keyEvents: 0, sessions: 0, conversionRate: 0, hasKeyEvents: false });
  });
});

describe("getDefaultGa4DateRange", () => {
  it("returns a 28-day inclusive window ending yesterday, matching GSC's own default", () => {
    const now = new Date("2026-08-22T12:00:00Z");
    const { startDate, endDate } = getDefaultGa4DateRange(now);
    expect(endDate).toBe("2026-08-21");
    expect(startDate).toBe("2026-07-25");
  });
});
