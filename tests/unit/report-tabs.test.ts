import { describe, expect, it } from "vitest";

import { resolveActiveTab, type ReportTab } from "@/components/report/tabs";

const TABS: ReportTab[] = [
  { label: "Overview", href: "/websites/abc/site-audit" },
  { label: "Issues", href: "/websites/abc/site-audit/issues", count: 41 },
];

describe("resolveActiveTab", () => {
  it("activates the exact tab on its own route", () => {
    expect(resolveActiveTab("/websites/abc/site-audit", TABS)).toBe("/websites/abc/site-audit");
    expect(resolveActiveTab("/websites/abc/site-audit/issues", TABS)).toBe("/websites/abc/site-audit/issues");
  });

  it("prefers the longest match, so the first tab does not swallow the rest", () => {
    // The naive `startsWith` bug: "/site-audit" is a prefix of "/site-audit/issues".
    expect(resolveActiveTab("/websites/abc/site-audit/issues", TABS)).not.toBe("/websites/abc/site-audit");
  });

  it("keeps the section active on a drill-down route below it", () => {
    expect(resolveActiveTab("/websites/abc/site-audit/issues/TECH_MISSING_HSTS", TABS)).toBe(
      "/websites/abc/site-audit/issues"
    );
  });

  it("only matches on a segment boundary", () => {
    expect(resolveActiveTab("/websites/abc/site-audit-archive", TABS)).toBeNull();
  });

  it("ignores a query string, a hash and a trailing slash", () => {
    expect(resolveActiveTab("/websites/abc/site-audit/issues?severity=critical&page=2", TABS)).toBe(
      "/websites/abc/site-audit/issues"
    );
    expect(resolveActiveTab("/websites/abc/site-audit#crawl-history", TABS)).toBe("/websites/abc/site-audit");
    expect(resolveActiveTab("/websites/abc/site-audit/issues/", TABS)).toBe("/websites/abc/site-audit/issues");
  });

  it("returns null when no tab owns the path", () => {
    expect(resolveActiveTab("/websites/abc/keywords", TABS)).toBeNull();
    expect(resolveActiveTab("", TABS)).toBeNull();
  });

  it("does not confuse one website's tabs with another's", () => {
    expect(resolveActiveTab("/websites/xyz/site-audit/issues", TABS)).toBeNull();
  });
});
