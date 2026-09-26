import { describe, it, expect } from "vitest";
import { parseSitesListResponse, parseSearchAnalyticsResponse, getDefaultDateRange } from "@/lib/gsc/parse";

// Fixtures below are shaped exactly like Google's documented response
// formats for `webmasters.sites.list` and
// `webmasters.searchanalytics.query` (Search Console API v3) — clearly
// hand-written fixtures, not live data, used purely to verify this app's
// parsing logic.

const SITES_LIST_FIXTURE = {
  siteEntry: [
    { siteUrl: "https://example.com/", permissionLevel: "siteOwner" },
    { siteUrl: "sc-domain:example.com", permissionLevel: "siteFullUser" },
    { siteUrl: "https://unverified.example.com/", permissionLevel: "siteUnverifiedUser" },
  ],
};

const SEARCH_ANALYTICS_QUERY_FIXTURE = {
  rows: [
    { keys: ["best running shoes"], clicks: 142, impressions: 3800, ctr: 0.0373684210526316, position: 4.2 },
    { keys: ["running shoes for flat feet"], clicks: 58, impressions: 1200, ctr: 0.0483333333333333, position: 7.8 },
    { keys: ["marathon training plan"], clicks: 0, impressions: 320, ctr: 0, position: 22.5 },
  ],
};

const SEARCH_ANALYTICS_PAGE_FIXTURE = {
  rows: [
    { keys: ["https://example.com/blog/best-running-shoes"], clicks: 201, impressions: 5100, ctr: 0.0394117647058823, position: 5.1 },
    { keys: ["https://example.com/"], clicks: 89, impressions: 2200, ctr: 0.0404545454545454, position: 3.6 },
  ],
};

describe("parseSitesListResponse", () => {
  it("parses siteEntry rows into { siteUrl, permissionLevel }", () => {
    const result = parseSitesListResponse(SITES_LIST_FIXTURE);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ siteUrl: "https://example.com/", permissionLevel: "siteOwner" });
    expect(result[1].siteUrl).toBe("sc-domain:example.com");
  });

  it("returns an empty array for a response with no siteEntry (account with zero properties)", () => {
    expect(parseSitesListResponse({})).toEqual([]);
  });

  it("returns an empty array for null/malformed input rather than throwing", () => {
    expect(parseSitesListResponse(null)).toEqual([]);
    expect(parseSitesListResponse("not an object")).toEqual([]);
    expect(parseSitesListResponse({ siteEntry: "not an array" })).toEqual([]);
  });
});

describe("parseSearchAnalyticsResponse", () => {
  it("parses query-dimension rows with clicks/impressions/ctr/position", () => {
    const result = parseSearchAnalyticsResponse(SEARCH_ANALYTICS_QUERY_FIXTURE);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      dimensionValue: "best running shoes",
      clicks: 142,
      impressions: 3800,
      ctr: 0.0373684210526316,
      position: 4.2,
    });
  });

  it("parses page-dimension rows (URLs as the dimension value)", () => {
    const result = parseSearchAnalyticsResponse(SEARCH_ANALYTICS_PAGE_FIXTURE);
    expect(result).toHaveLength(2);
    expect(result[0].dimensionValue).toBe("https://example.com/blog/best-running-shoes");
  });

  it("handles a zero-click, zero-ctr row correctly (impressions with no clicks is valid GSC data)", () => {
    const result = parseSearchAnalyticsResponse(SEARCH_ANALYTICS_QUERY_FIXTURE);
    const zeroClickRow = result.find((r) => r.dimensionValue === "marathon training plan");
    expect(zeroClickRow).toEqual({
      dimensionValue: "marathon training plan",
      clicks: 0,
      impressions: 320,
      ctr: 0,
      position: 22.5,
    });
  });

  it("returns an empty array when Google reports no rows for the range (no fabricated placeholder rows)", () => {
    expect(parseSearchAnalyticsResponse({ rows: [] })).toEqual([]);
    expect(parseSearchAnalyticsResponse({})).toEqual([]);
  });

  it("returns an empty array for malformed input rather than throwing", () => {
    expect(parseSearchAnalyticsResponse(null)).toEqual([]);
    expect(parseSearchAnalyticsResponse({ rows: "not an array" })).toEqual([]);
  });
});

describe("getDefaultDateRange", () => {
  it("returns a 28-day inclusive window ending yesterday (matching GSC's own UI default)", () => {
    const now = new Date("2026-08-22T12:00:00Z");
    const { startDate, endDate } = getDefaultDateRange(now);
    expect(endDate).toBe("2026-08-21");
    expect(startDate).toBe("2026-07-25");

    const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) + 1;
    expect(days).toBe(28);
  });
});
