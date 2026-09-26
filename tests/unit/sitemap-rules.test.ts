import { describe, it, expect } from "vitest";
import {
  evaluateSitemapDocumentIssues,
  evaluateSitemapUrlCrossReference,
  type SitemapDocumentInput,
  type CrawledPageSummary,
} from "@/lib/seo-rules/sitemap";

function doc(overrides: Partial<SitemapDocumentInput> = {}): SitemapDocumentInput {
  return {
    url: "https://example.com/sitemap.xml",
    httpStatus: 200,
    valid: true,
    xmlErrors: [],
    kind: "urlset",
    urls: [{ loc: "https://example.com/", lastmod: "2026-01-01" }],
    ...overrides,
  };
}

function keys(document: SitemapDocumentInput, siteIsHttps = true) {
  return evaluateSitemapDocumentIssues(document, siteIsHttps).map((v) => v.ruleKey);
}

describe("evaluateSitemapDocumentIssues — clean document", () => {
  it("produces no violations for a valid, well-formed sitemap", () => {
    expect(keys(doc())).toEqual([]);
  });
});

describe("fetch/parse failures", () => {
  it("flags a non-2xx HTTP status and stops (no URL-level checks)", () => {
    const violations = evaluateSitemapDocumentIssues(doc({ httpStatus: 404 }), true);
    expect(violations.map((v) => v.ruleKey)).toEqual(["SITEMAP_HTTP_ERROR"]);
  });

  it("flags a totally unreachable sitemap (null status)", () => {
    expect(keys(doc({ httpStatus: null }))).toEqual(["SITEMAP_HTTP_ERROR"]);
  });

  it("flags invalid XML and stops (no URL-level checks)", () => {
    const violations = evaluateSitemapDocumentIssues(
      doc({ valid: false, xmlErrors: ["unclosed tag"] }),
      true
    );
    expect(violations.map((v) => v.ruleKey)).toEqual(["SITEMAP_INVALID_XML"]);
  });
});

describe("sitemap index documents", () => {
  it("does not run urlset-only checks on a sitemapindex document", () => {
    expect(keys(doc({ kind: "sitemapindex", urls: [] }))).toEqual([]);
  });
});

describe("URL-level checks", () => {
  it("flags duplicate URLs", () => {
    const violations = keys(
      doc({
        urls: [
          { loc: "https://example.com/a", lastmod: "2026-01-01" },
          { loc: "https://example.com/a", lastmod: "2026-01-01" },
        ],
      })
    );
    expect(violations).toContain("SITEMAP_DUPLICATE_URL");
  });

  it("flags an invalid URL entry", () => {
    expect(keys(doc({ urls: [{ loc: "not a url", lastmod: null }] }))).toContain("SITEMAP_INVALID_URL");
  });

  it("flags a ftp:// URL as invalid", () => {
    expect(keys(doc({ urls: [{ loc: "ftp://example.com/file", lastmod: null }] }))).toContain(
      "SITEMAP_INVALID_URL"
    );
  });

  it("flags an http:// URL on an HTTPS site", () => {
    const violations = keys(doc({ urls: [{ loc: "http://example.com/page", lastmod: "2026-01-01" }] }), true);
    expect(violations).toContain("SITEMAP_HTTP_URL_ON_HTTPS_SITE");
  });

  it("does not flag http:// URLs when the site itself is not HTTPS", () => {
    const violations = keys(doc({ urls: [{ loc: "http://example.com/page", lastmod: "2026-01-01" }] }), false);
    expect(violations).not.toContain("SITEMAP_HTTP_URL_ON_HTTPS_SITE");
  });

  it("flags missing lastmod with an aggregate count", () => {
    const violations = evaluateSitemapDocumentIssues(
      doc({
        urls: [
          { loc: "https://example.com/a", lastmod: null },
          { loc: "https://example.com/b", lastmod: "2026-01-01" },
        ],
      }),
      true
    );
    const missing = violations.find((v) => v.ruleKey === "SITEMAP_URL_MISSING_LASTMOD");
    expect(missing?.evidence).toMatch(/1 of 2/);
  });

  it("flags exceeding the 50,000 URL limit", () => {
    const manyUrls = Array.from({ length: 50_001 }, (_, i) => ({
      loc: `https://example.com/page-${i}`,
      lastmod: "2026-01-01",
    }));
    expect(keys(doc({ urls: manyUrls }))).toContain("SITEMAP_TOO_MANY_URLS");
  });

  it("does not flag a sitemap right at the limit", () => {
    const urls = Array.from({ length: 50_000 }, (_, i) => ({
      loc: `https://example.com/page-${i}`,
      lastmod: "2026-01-01",
    }));
    expect(keys(doc({ urls }))).not.toContain("SITEMAP_TOO_MANY_URLS");
  });
});

describe("evaluateSitemapUrlCrossReference", () => {
  function page(overrides: Partial<CrawledPageSummary> = {}): CrawledPageSummary {
    return { statusCode: 200, canonical: "https://example.com/page", robots: null, ...overrides };
  }

  it("flags a sitemap URL that returned a broken status when crawled", () => {
    const crawledPagesByUrl = new Map([["https://example.com/page", page({ statusCode: 404 })]]);
    const issues = evaluateSitemapUrlCrossReference(["https://example.com/page"], crawledPagesByUrl);
    expect(issues).toContainEqual(expect.objectContaining({ ruleKey: "SITEMAP_URL_BROKEN" }));
  });

  it("flags a sitemap URL that is noindex", () => {
    const crawledPagesByUrl = new Map([
      ["https://example.com/page", page({ robots: "noindex, follow", canonical: "https://example.com/page" })],
    ]);
    const issues = evaluateSitemapUrlCrossReference(["https://example.com/page"], crawledPagesByUrl);
    expect(issues).toContainEqual(expect.objectContaining({ ruleKey: "SITEMAP_URL_NOT_INDEXABLE" }));
  });

  it("flags a sitemap URL whose canonical points elsewhere", () => {
    const crawledPagesByUrl = new Map([
      ["https://example.com/page", page({ canonical: "https://example.com/canonical-page" })],
    ]);
    const issues = evaluateSitemapUrlCrossReference(["https://example.com/page"], crawledPagesByUrl);
    expect(issues).toContainEqual(expect.objectContaining({ ruleKey: "SITEMAP_URL_CANONICAL_MISMATCH" }));
  });

  it("does not flag a self-referencing canonical", () => {
    const crawledPagesByUrl = new Map([
      ["https://example.com/page", page({ canonical: "https://example.com/page" })],
    ]);
    const issues = evaluateSitemapUrlCrossReference(["https://example.com/page"], crawledPagesByUrl);
    expect(issues).toEqual([]);
  });

  it("does not flag or assume anything for a sitemap URL that wasn't crawled", () => {
    const issues = evaluateSitemapUrlCrossReference(["https://example.com/not-crawled"], new Map());
    expect(issues).toEqual([]);
  });

  it("produces no issues for a healthy, indexable, canonical-matching page", () => {
    const crawledPagesByUrl = new Map([["https://example.com/page", page()]]);
    expect(evaluateSitemapUrlCrossReference(["https://example.com/page"], crawledPagesByUrl)).toEqual([]);
  });
});
