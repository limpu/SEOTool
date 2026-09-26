import { describe, it, expect } from "vitest";
import {
  evaluateTechnicalPageIssues,
  evaluateSiteLevelIssues,
  evaluateOrphanPages,
  evaluateDuplicateUrlVariants,
  evaluateBlockedInternalLinks,
  type TechnicalPageInput,
} from "@/lib/seo-rules/technical";

const GOOD_HEADERS: TechnicalPageInput["headers"] = {
  "strict-transport-security": "max-age=63072000",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

function baseInput(overrides: Partial<TechnicalPageInput> = {}): TechnicalPageInput {
  return {
    finalUrl: "https://example.com/page",
    statusCode: 200,
    redirectCount: 0,
    headers: GOOD_HEADERS,
    ...overrides,
  };
}

function keys(input: TechnicalPageInput) {
  return evaluateTechnicalPageIssues(input).map((v) => v.ruleKey);
}

describe("evaluateTechnicalPageIssues — clean page", () => {
  it("produces no violations for a fully compliant HTTPS response", () => {
    expect(keys(baseInput())).toEqual([]);
  });
});

describe("HTTPS", () => {
  it("flags a plain HTTP final URL", () => {
    expect(keys(baseInput({ finalUrl: "http://example.com/page" }))).toContain("TECH_NOT_HTTPS");
  });

  it("does not require HSTS on an HTTP page (meaningless there)", () => {
    const violations = keys(baseInput({ finalUrl: "http://example.com/page", headers: {} }));
    expect(violations).not.toContain("TECH_MISSING_HSTS");
  });
});

describe("HTTP status", () => {
  it("flags a 4xx as a client error", () => {
    expect(keys(baseInput({ statusCode: 404 }))).toContain("TECH_CLIENT_ERROR_STATUS");
  });

  it("flags a 5xx as a server error", () => {
    expect(keys(baseInput({ statusCode: 503 }))).toContain("TECH_SERVER_ERROR_STATUS");
  });

  it("does not flag a 2xx or 3xx", () => {
    expect(keys(baseInput({ statusCode: 200 }))).toEqual(
      expect.not.arrayContaining(["TECH_CLIENT_ERROR_STATUS", "TECH_SERVER_ERROR_STATUS"])
    );
  });
});

describe("redirects", () => {
  it("does not flag a direct (non-redirected) fetch", () => {
    expect(keys(baseInput({ redirectCount: 0 }))).not.toContain("TECH_REDIRECT_DETECTED");
  });

  it("flags a single redirect as detected but not a chain", () => {
    const violationKeys = keys(baseInput({ redirectCount: 1 }));
    expect(violationKeys).toContain("TECH_REDIRECT_DETECTED");
    expect(violationKeys).not.toContain("TECH_REDIRECT_CHAIN_TOO_LONG");
  });

  it("flags more than two hops as a long chain", () => {
    const violationKeys = keys(baseInput({ redirectCount: 3 }));
    expect(violationKeys).toContain("TECH_REDIRECT_DETECTED");
    expect(violationKeys).toContain("TECH_REDIRECT_CHAIN_TOO_LONG");
  });
});

describe("X-Robots-Tag", () => {
  it("flags a noindex X-Robots-Tag header", () => {
    expect(keys(baseInput({ headers: { ...GOOD_HEADERS, "x-robots-tag": "noindex" } }))).toContain(
      "TECH_NOINDEX_VIA_HEADER"
    );
  });

  it("does not flag when the header is absent", () => {
    expect(keys(baseInput())).not.toContain("TECH_NOINDEX_VIA_HEADER");
  });
});

describe("security headers", () => {
  it("flags each missing security header independently", () => {
    const violationKeys = keys(baseInput({ headers: {} }));
    expect(violationKeys).toEqual(
      expect.arrayContaining([
        "TECH_MISSING_HSTS",
        "TECH_MISSING_X_CONTENT_TYPE_OPTIONS",
        "TECH_MISSING_REFERRER_POLICY",
      ])
    );
  });
});

describe("evaluateSiteLevelIssues", () => {
  it("flags missing robots.txt and missing sitemap independently", () => {
    const issues = evaluateSiteLevelIssues({ robotsTxtFound: false, sitemapFound: false });
    expect(issues.map((i) => i.ruleKey).sort()).toEqual(
      ["TECH_ROBOTS_TXT_MISSING", "TECH_SITEMAP_MISSING"].sort()
    );
  });

  it("flags nothing when both are present", () => {
    expect(evaluateSiteLevelIssues({ robotsTxtFound: true, sitemapFound: true })).toEqual([]);
  });
});

describe("evaluateOrphanPages", () => {
  it("flags a page not linked to by any other crawled page", () => {
    const issues = evaluateOrphanPages(
      [
        { id: "home", url: "https://example.com/" },
        { id: "linked", url: "https://example.com/linked" },
        { id: "orphan", url: "https://example.com/orphan" },
      ],
      new Set(["https://example.com/linked"]),
      "https://example.com/"
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].pageId).toBe("orphan");
  });

  it("never flags the crawl's start URL, even with no inbound links", () => {
    const issues = evaluateOrphanPages(
      [{ id: "home", url: "https://example.com/" }],
      new Set(),
      "https://example.com/"
    );
    expect(issues).toEqual([]);
  });
});

describe("evaluateDuplicateUrlVariants", () => {
  it("flags pages sharing a path but differing only by query string", () => {
    const issues = evaluateDuplicateUrlVariants([
      { id: "a", url: "https://example.com/products" },
      { id: "b", url: "https://example.com/products?sort=price" },
      { id: "c", url: "https://example.com/about" },
    ]);
    const flagged = issues.map((i) => i.pageId).sort();
    expect(flagged).toEqual(["a", "b"]);
  });

  it("does not flag distinct paths", () => {
    const issues = evaluateDuplicateUrlVariants([
      { id: "a", url: "https://example.com/one" },
      { id: "b", url: "https://example.com/two" },
    ]);
    expect(issues).toEqual([]);
  });
});

describe("evaluateBlockedInternalLinks", () => {
  it("flags a link to a disallowed path, attributed to the linking page", () => {
    const isAllowed = (path: string) => !path.startsWith("/admin");
    const issues = evaluateBlockedInternalLinks(
      [
        { sourcePageId: "home", targetUrl: "https://example.com/admin/login" },
        { sourcePageId: "home", targetUrl: "https://example.com/about" },
      ],
      isAllowed
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ pageId: "home", ruleKey: "TECH_BLOCKED_BY_ROBOTS_TXT" });
  });

  it("does not duplicate an issue for the same page linking to the same disallowed path twice", () => {
    const isAllowed = () => false;
    const issues = evaluateBlockedInternalLinks(
      [
        { sourcePageId: "home", targetUrl: "https://example.com/private" },
        { sourcePageId: "home", targetUrl: "https://example.com/private" },
      ],
      isAllowed
    );
    expect(issues).toHaveLength(1);
  });
});
