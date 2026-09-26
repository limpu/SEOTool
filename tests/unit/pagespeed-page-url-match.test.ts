import { describe, expect, it } from "vitest";
import { normalizeCrawlUrl } from "@/lib/crawler/normalize-url";

/**
 * Regression guard for a real bug found during Stage 3A verification.
 *
 * `attachIssuesIfPageKnown` resolved the audited URL to a crawled `pages` row
 * with an EXACT string match. PageSpeed audits the website's stored `url`,
 * while the crawler stores the URL it actually fetched — and those routinely
 * differ by a trailing slash. In the live database:
 *
 *   pagespeed_audits.url = "https://drsdermabd.com"    (no trailing slash)
 *   pages.url            = "https://drsdermabd.com/"   (trailing slash)
 *
 * so every Phase 20/21 PageSpeed signal was silently dropped for that site,
 * while a sibling site whose URL happened to be entered WITH a trailing slash
 * attached its issues fine. Nothing threw; the diagnostics simply never
 * appeared — a silent nothing, which is the failure mode this codebase treats
 * as a real defect rather than cosmetic.
 *
 * The fix falls back to comparing `normalizeCrawlUrl` on both sides. These
 * tests pin the equivalences that fallback depends on, so a future change to
 * the normaliser that reintroduced the mismatch would fail here rather than
 * silently emptying the PageSpeed diagnostics again.
 */
describe("PageSpeed audit URL ↔ crawled page URL matching", () => {
  it("treats the exact production mismatch as the same page", () => {
    // The real values from the live `seo-postgres` database.
    const auditUrl = "https://drsdermabd.com";
    const crawledUrl = "https://drsdermabd.com/";

    expect(auditUrl).not.toBe(crawledUrl); // why exact match failed
    expect(normalizeCrawlUrl(auditUrl)).toBe(normalizeCrawlUrl(crawledUrl));
  });

  it("still matches when the audit URL already carries the trailing slash", () => {
    // The sibling site that worked by luck, not by design.
    const url = "https://www.freebanglatutorial.com/";
    expect(normalizeCrawlUrl(url)).toBe(normalizeCrawlUrl("https://www.freebanglatutorial.com"));
  });

  it("collapses a trailing slash on a deep path too", () => {
    expect(normalizeCrawlUrl("https://example.com/blog/")).toBe(normalizeCrawlUrl("https://example.com/blog"));
  });

  it("ignores fragments and host casing, which neither side controls", () => {
    expect(normalizeCrawlUrl("https://Example.com/blog#top")).toBe(normalizeCrawlUrl("https://example.com/blog"));
  });

  it("does NOT collapse genuinely different pages into one", () => {
    // The fallback must stay a normalisation, never a fuzzy match: distinct
    // paths, hosts and schemes must remain distinct or the fix would attach
    // one page's Lighthouse diagnostics to a different page.
    expect(normalizeCrawlUrl("https://example.com/a")).not.toBe(normalizeCrawlUrl("https://example.com/b"));
    expect(normalizeCrawlUrl("https://example.com/")).not.toBe(normalizeCrawlUrl("https://other.com/"));
    expect(normalizeCrawlUrl("https://example.com/?a=1")).not.toBe(normalizeCrawlUrl("https://example.com/"));
  });

  it("returns null for input the matcher must refuse rather than guess at", () => {
    expect(normalizeCrawlUrl("not-a-url")).toBeNull();
    expect(normalizeCrawlUrl("ftp://example.com/file")).toBeNull();
  });
});
