import { describe, expect, it } from "vitest";

import {
  buildFacetHref,
  buildIssueFacets,
  buildPageHref,
  buildQueryString,
  filterIssues,
  groupIssuesBySeverity,
  matchesQuery,
  paginate,
  paginationRange,
  parseIssueFilters,
  readListParam,
  toggleValue,
  type ReportIssue,
} from "@/components/report/filtering";

const ISSUES: ReportIssue[] = [
  { ruleKey: "TECH_MISSING_HSTS", title: "Missing HSTS header", severity: "critical", category: "technical", affectedPageCount: 12, description: "Strict-Transport-Security absent" },
  { ruleKey: "TECH_NO_CANONICAL", title: "No canonical tag", severity: "high", category: "technical", affectedPageCount: 8 },
  { ruleKey: "ONPAGE_TITLE_TOO_LONG", title: "Title too long", severity: "medium", category: "on_page", affectedPageCount: 30 },
  { ruleKey: "ONPAGE_MISSING_H1", title: "Missing H1", severity: "high", category: "on_page", affectedPageCount: 3 },
  { ruleKey: "SCHEMA_INVALID_JSONLD", title: "Invalid JSON-LD", severity: "low", category: "schema", affectedPageCount: 1 },
  { ruleKey: "ROBOTS_AI_BLOCKED", title: "AI crawler blocked", severity: "info", category: "technical", affectedPageCount: 1 },
];

describe("readListParam", () => {
  it("accepts repeated params, the comma form, and both together", () => {
    expect(readListParam(undefined)).toEqual([]);
    expect(readListParam("technical")).toEqual(["technical"]);
    expect(readListParam("technical,on_page")).toEqual(["technical", "on_page"]);
    expect(readListParam(["technical", "on_page,schema"])).toEqual(["technical", "on_page", "schema"]);
  });

  it("trims, drops empties and de-duplicates", () => {
    expect(readListParam(" technical , ,technical, schema ")).toEqual(["technical", "schema"]);
  });
});

describe("parseIssueFilters", () => {
  it("defaults to no filters and page 1", () => {
    expect(parseIssueFilters({})).toEqual({ query: "", categories: [], severities: [], page: 1 });
  });

  it("drops severity values outside the closed vocabulary", () => {
    expect(parseIssueFilters({ severity: ["critical", "urgent", "info"] }).severities).toEqual(["critical", "info"]);
  });

  it("clamps a nonsense page to 1 rather than producing a blank list", () => {
    expect(parseIssueFilters({ page: "0" }).page).toBe(1);
    expect(parseIssueFilters({ page: "-4" }).page).toBe(1);
    expect(parseIssueFilters({ page: "not-a-number" }).page).toBe(1);
    expect(parseIssueFilters({ page: "7" }).page).toBe(7);
  });

  it("honours custom param names", () => {
    expect(parseIssueFilters({ u: "example.com" }, { queryParam: "u" }).query).toBe("example.com");
  });
});

describe("matchesQuery / filterIssues", () => {
  it("matches title, rule key and description case-insensitively", () => {
    expect(matchesQuery(ISSUES[0], "hsts")).toBe(true);
    expect(matchesQuery(ISSUES[0], "MISSING_HSTS")).toBe(true);
    expect(matchesQuery(ISSUES[0], "strict-transport")).toBe(true);
    expect(matchesQuery(ISSUES[0], "canonical")).toBe(false);
  });

  it("treats an empty query as no constraint", () => {
    expect(filterIssues(ISSUES, { query: "", categories: [], severities: [] })).toHaveLength(ISSUES.length);
    expect(filterIssues(ISSUES, { query: "   ", categories: [], severities: [] })).toHaveLength(ISSUES.length);
  });

  it("treats an empty facet list as no constraint, not as match-nothing", () => {
    expect(filterIssues(ISSUES, { query: "", categories: [], severities: [] })).toHaveLength(6);
  });

  it("ANDs across axes and ORs within one axis", () => {
    const result = filterIssues(ISSUES, { query: "", categories: ["technical", "on_page"], severities: ["high"] });
    expect(result.map((issue) => issue.ruleKey)).toEqual(["TECH_NO_CANONICAL", "ONPAGE_MISSING_H1"]);
  });

  it("combines search text with facets", () => {
    const result = filterIssues(ISSUES, { query: "missing", categories: ["on_page"], severities: [] });
    expect(result.map((issue) => issue.ruleKey)).toEqual(["ONPAGE_MISSING_H1"]);
  });
});

describe("groupIssuesBySeverity", () => {
  it("orders groups critical → info regardless of input order", () => {
    const groups = groupIssuesBySeverity(ISSUES);
    expect(groups.map((group) => group.severity)).toEqual(["critical", "high", "medium", "low", "info"]);
  });

  it("omits empty tiers so a header always has rows under it", () => {
    const groups = groupIssuesBySeverity(ISSUES.filter((issue) => issue.severity === "high"));
    expect(groups).toHaveLength(1);
    expect(groups[0].severity).toBe("high");
    expect(groups[0].issues).toHaveLength(2);
  });

  it("returns nothing at all for an empty list", () => {
    expect(groupIssuesBySeverity([])).toEqual([]);
  });
});

describe("buildIssueFacets", () => {
  it("counts each axis against the OTHER axes, not against itself", () => {
    const facets = buildIssueFacets(ISSUES, { query: "", categories: [], severities: ["high"] });
    // Category counts respect the severity filter…
    expect(facets.categories.find((facet) => facet.value === "technical")?.count).toBe(1);
    expect(facets.categories.find((facet) => facet.value === "on_page")?.count).toBe(1);
    expect(facets.categories.find((facet) => facet.value === "schema")?.count).toBe(0);
    // …but severity counts must NOT collapse to only the selected tier.
    expect(facets.severities.find((facet) => facet.value === "critical")?.count).toBe(1);
    expect(facets.severities.find((facet) => facet.value === "medium")?.count).toBe(1);
  });

  it("marks the active facets and leaves the rest inactive", () => {
    const facets = buildIssueFacets(ISSUES, { query: "", categories: ["schema"], severities: [] });
    expect(facets.categories.find((facet) => facet.value === "schema")?.active).toBe(true);
    expect(facets.categories.find((facet) => facet.value === "technical")?.active).toBe(false);
  });

  it("emits no chip for a value that does not occur in the data", () => {
    const facets = buildIssueFacets(ISSUES, { query: "", categories: [], severities: [] });
    expect(facets.categories.map((facet) => facet.value)).toEqual(["on_page", "schema", "technical"]);
    expect(facets.severities.map((facet) => facet.value)).toEqual(["critical", "high", "medium", "low", "info"]);
  });

  it("keeps an active chip that currently matches nothing, showing its real 0", () => {
    const facets = buildIssueFacets(ISSUES, { query: "zzz-no-match", categories: ["schema"], severities: [] });
    const schema = facets.categories.find((facet) => facet.value === "schema");
    expect(schema).toMatchObject({ active: true, count: 0 });
  });

  it("keeps severity order fixed rather than sorting by count", () => {
    const facets = buildIssueFacets(ISSUES, { query: "", categories: [], severities: [] });
    expect(facets.severities.map((facet) => facet.value)).toEqual(["critical", "high", "medium", "low", "info"]);
  });
});

describe("toggleValue / buildQueryString", () => {
  it("adds a missing value and removes a present one", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });

  it("omits empty values entirely rather than serialising key=", () => {
    expect(buildQueryString({ q: "", category: [], page: undefined })).toBe("");
    expect(buildQueryString({ q: "hsts" })).toBe("?q=hsts");
  });

  it("repeats a param per array entry", () => {
    expect(buildQueryString({ category: ["technical", "on_page"] })).toBe("?category=technical&category=on_page");
  });

  it("serialises numbers", () => {
    expect(buildQueryString({ page: 3 })).toBe("?page=3");
  });
});

describe("buildFacetHref", () => {
  const filters = { query: "hsts", categories: ["technical"], severities: [] as never[], page: 4 };

  it("toggles the named axis and leaves the other alone", () => {
    expect(buildFacetHref("/issues", filters, "category", "on_page")).toBe(
      "/issues?q=hsts&category=technical&category=on_page"
    );
    expect(buildFacetHref("/issues", filters, "category", "technical")).toBe("/issues?q=hsts");
  });

  it("always drops the page — a filter change must not land on a now-empty page 4", () => {
    expect(buildFacetHref("/issues", filters, "severity", "critical")).not.toContain("page=");
  });
});

describe("buildPageHref", () => {
  const filters = { query: "", categories: ["technical"], severities: ["high" as const], page: 1 };

  it("preserves every active filter", () => {
    expect(buildPageHref("/issues", filters, 3)).toBe("/issues?category=technical&severity=high&page=3");
  });

  it("leaves page 1 out of the URL", () => {
    expect(buildPageHref("/issues", filters, 1)).toBe("/issues?category=technical&severity=high");
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 23 }, (_, index) => index + 1);

  it("slices a page and reports honest 1-based bounds", () => {
    const slice = paginate(items, 2, 10);
    expect(slice.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(slice).toMatchObject({ page: 2, totalPages: 3, total: 23, firstItemIndex: 11, lastItemIndex: 20 });
  });

  it("handles a short final page", () => {
    const slice = paginate(items, 3, 10);
    expect(slice.items).toEqual([21, 22, 23]);
    expect(slice).toMatchObject({ firstItemIndex: 21, lastItemIndex: 23 });
  });

  it("clamps an out-of-range page instead of showing a blank screen", () => {
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate(items, 0, 10).page).toBe(1);
  });

  it("reports an empty list as page 1 of 1 with zero bounds, never 0 pages", () => {
    const slice = paginate([], 1, 10);
    expect(slice).toMatchObject({ page: 1, totalPages: 1, total: 0, firstItemIndex: 0, lastItemIndex: 0 });
    expect(slice.items).toEqual([]);
  });

  it("never divides by a zero page size", () => {
    expect(paginate(items, 1, 0).totalPages).toBe(23);
  });
});

describe("paginationRange", () => {
  it("lists every page when they all fit", () => {
    expect(paginationRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps first and last and windows around the current page", () => {
    expect(paginationRange(5, 10)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  });

  it("does not open a leading gap near the start, nor a trailing one near the end", () => {
    expect(paginationRange(1, 10)).toEqual([1, 2, 3, 4, "ellipsis", 10]);
    expect(paginationRange(10, 10)).toEqual([1, "ellipsis", 7, 8, 9, 10]);
  });

  it("stays within maxSlots so a 400-page list cannot overflow a 375px screen", () => {
    for (const page of [1, 2, 50, 200, 399, 400]) {
      expect(paginationRange(page, 400).length).toBeLessThanOrEqual(7);
    }
  });

  it("clamps a current page outside the range", () => {
    expect(paginationRange(99, 3)).toEqual([1, 2, 3]);
  });
});
