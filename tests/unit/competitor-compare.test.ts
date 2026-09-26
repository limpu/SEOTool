import { describe, expect, it } from "vitest";
import { buildStructuralComparison, type SiteStructuralSnapshot } from "@/lib/competitor/compare";

function snapshot(overrides: Partial<SiteStructuralSnapshot> = {}): SiteStructuralSnapshot {
  return {
    websiteId: "site-1",
    label: "My Site",
    crawledAt: "2026-08-22T00:00:00.000Z",
    pageCount: 10,
    avgWordCount: 500,
    avgHeadingCount: 6,
    ruleKeys: [],
    schemaTypes: [],
    ...overrides,
  };
}

describe("buildStructuralComparison", () => {
  it("computes issue rule-key set diffs (only-you / only-competitor / both)", () => {
    const yours = snapshot({ ruleKeys: ["Missing meta description", "Missing HSTS header", "Shared rule"] });
    const competitor = snapshot({
      websiteId: "site-2",
      label: "Competitor",
      ruleKeys: ["No FAQ structure detected", "Shared rule"],
    });

    const result = buildStructuralComparison(yours, competitor);

    expect(result.issuesOnlyYouHave).toEqual(["Missing HSTS header", "Missing meta description"]);
    expect(result.issuesOnlyCompetitorHas).toEqual(["No FAQ structure detected"]);
    expect(result.issuesBothHave).toEqual(["Shared rule"]);
  });

  it("computes schema-type set diffs", () => {
    const yours = snapshot({ schemaTypes: ["Organization", "WebSite"] });
    const competitor = snapshot({ websiteId: "site-2", schemaTypes: ["Organization", "FAQPage", "Product"] });

    const result = buildStructuralComparison(yours, competitor);

    expect(result.schemaTypesOnlyYouHave).toEqual(["WebSite"]);
    expect(result.schemaTypesOnlyCompetitorHas).toEqual(["FAQPage", "Product"]);
    expect(result.schemaTypesBothHave).toEqual(["Organization"]);
  });

  it("carries through structural metrics untouched (page count / avg word / avg heading counts)", () => {
    const yours = snapshot({ pageCount: 42, avgWordCount: 812, avgHeadingCount: 7.5 });
    const competitor = snapshot({ websiteId: "site-2", pageCount: 15, avgWordCount: 300, avgHeadingCount: 3 });

    const result = buildStructuralComparison(yours, competitor);

    expect(result.yourSite).toMatchObject({ pageCount: 42, avgWordCount: 812, avgHeadingCount: 7.5 });
    expect(result.competitor).toMatchObject({ pageCount: 15, avgWordCount: 300, avgHeadingCount: 3 });
  });

  it("handles an uncrawled site honestly (all-zero/null, not a fabricated number)", () => {
    const yours = snapshot();
    const uncrawledCompetitor = snapshot({
      websiteId: "site-2",
      label: "Competitor",
      crawledAt: null,
      pageCount: 0,
      avgWordCount: null,
      avgHeadingCount: null,
      ruleKeys: [],
      schemaTypes: [],
    });

    const result = buildStructuralComparison(yours, uncrawledCompetitor);

    expect(result.competitor.pageCount).toBe(0);
    expect(result.competitor.avgWordCount).toBeNull();
    expect(result.competitor.avgHeadingCount).toBeNull();
    expect(result.competitor.crawledAt).toBeNull();
    // Every one of your issues counts as "only you" since the competitor has none.
    expect(result.issuesOnlyCompetitorHas).toEqual([]);
  });

  it("dedupes and sorts schema types deterministically regardless of input order/duplicates", () => {
    const yours = snapshot({ schemaTypes: ["Product", "Organization", "Organization"] });
    const competitor = snapshot({ websiteId: "site-2", schemaTypes: ["Organization"] });

    const result = buildStructuralComparison(yours, competitor);

    expect(result.yourSite.schemaTypes).toEqual(["Organization", "Product"]);
  });
});
