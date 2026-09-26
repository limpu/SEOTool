import { describe, it, expect } from "vitest";
import { renderHtmlReport } from "@/lib/reports/html";
import type { WebsiteReport } from "@/lib/reports/assemble";

function emptyCategoryScore() {
  return {
    score: 100,
    issueCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    penalties: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    totalPenalty: 0,
  };
}

/**
 * Minimal-but-fully-typed fixture, with one crafted "malicious" recommendation
 * title/description and one crafted GEO dimension evidence string standing in
 * for untrusted crawled-page content (a real page title/meta-description
 * could contain the exact same characters). Verifies the HTML renderer
 * escapes every one of them rather than injecting raw markup — the specific
 * stored-XSS-via-crawled-page-content risk this phase was asked to guard
 * against.
 */
function buildFixture(overrides: Partial<WebsiteReport> = {}): WebsiteReport {
  const base: WebsiteReport = {
    generatedAt: "2026-08-22T00:00:00.000Z",
    website: { id: "11111111-1111-1111-1111-111111111111", name: "Test Site", domain: "example.com", url: "https://example.com" },
    crawl: { hasCompletedCrawl: true, crawlRunId: "22222222-2222-2222-2222-222222222222", completedAt: "2026-08-22T00:00:00.000Z", pagesCrawled: 1 },
    scores: {
      technical: emptyCategoryScore(),
      onPage: emptyCategoryScore(),
      performance: { score: null, strategiesMeasured: [] },
      overall: { score: 100, weights: { technical: 0.5, onPage: 0.5, performance: 0 } },
    },
    issueCounts: { totalIssues: 0, byCategory: {}, bySeverity: {} },
    recommendations: {
      critical: [
        {
          ruleKey: "TEST_XSS_RULE",
          category: "on_page",
          severity: "critical",
          title: `<img src=x onerror=alert(1)>`,
          description: `Evidence found: "><script>alert('xss')</script> & more`,
          recommendation: null,
          fixExample: null,
          impact: null,
          affectedPageCount: 1,
          affectedPages: [{ pageId: "p1", url: "https://example.com/", evidence: null }],
        },
      ],
      high: [],
      medium: [],
      low: [],
      info: [],
      totalRules: 1,
      totalAffectedPageInstances: 1,
    },
    aiSearch: {
      pagesAssessed: 1,
      geo: 50,
      aeo: 50,
      aio: 50,
      pages: [
        {
          pageId: "p1",
          url: "https://example.com/",
          geo: {
            score: 50,
            dimensions: [
              {
                key: "entityClarity",
                label: "Entity Clarity",
                status: "assessed",
                score: 0,
                evidence: `<b onmouseover=alert(1)>injected</b>`,
              },
            ],
          },
          aeo: { score: 50, dimensions: [] },
          aio: { score: 50, dimensions: [] },
        },
      ],
    },
    eeat: {
      score: 50,
      dimensions: [
        { key: "aboutPage", label: "About page", status: "assessed", score: 0, evidence: "No page found." },
        { key: "contactPage", label: "Contact page", status: "assessed", score: 0, evidence: "No page found." },
        { key: "privacyPage", label: "Privacy Policy page", status: "assessed", score: 0, evidence: "No page found." },
      ],
      unassessed: [],
      pagesAssessed: 1,
      contentPagesAssessed: 0,
      pages: [],
    },
    pagespeed: { available: false, reason: "No PageSpeed audit has been run yet." },
    gsc: { configured: false, connected: false, hasSyncedData: false, reason: "Not configured." },
    keywords: { count: 0, keywords: [] },
    competitors: { count: 0, competitors: [] },
    aiInferred: { disclaimer: "AI-inferred, not deterministic.", pageAssessments: [], contentGapAnalyses: [] },
    retest: { available: false, reason: "Re-test comparison requires at least 2 completed crawls — run another crawl to compare against this baseline." },
    disclaimers: { scores: "Proprietary score.", recommendations: "Not a ranking guarantee.", aiSearch: "Proprietary readiness signal.", eeat: "Heuristic markers only." },
  };
  return { ...base, ...overrides };
}

describe("renderHtmlReport — XSS defense", () => {
  it("escapes a malicious recommendation title/description instead of injecting raw markup", () => {
    const html = renderHtmlReport(buildFixture());
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("escapes a malicious AI-search dimension evidence string", () => {
    const html = renderHtmlReport(buildFixture());
    expect(html).not.toContain("<b onmouseover=alert(1)>injected</b>");
    expect(html).toContain("&lt;b onmouseover=alert(1)&gt;injected&lt;/b&gt;");
  });

  it("is well-formed enough to contain the doctype, title, and website name", () => {
    const html = renderHtmlReport(buildFixture());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>SEO Report — Test Site</title>");
    expect(html).toContain("Test Site");
  });

  it("labels unassessed AI-inferred dimensions as unavailable, never fabricated", () => {
    const html = renderHtmlReport(buildFixture());
    expect(html).toContain("No completed AI-inferred page assessments");
  });

  it("renders an honest not-available message for PageSpeed/GSC when absent, not a silent omission", () => {
    const html = renderHtmlReport(buildFixture());
    expect(html).toContain("No PageSpeed audit has been run yet.");
    expect(html).toContain("Not configured.");
  });
});
