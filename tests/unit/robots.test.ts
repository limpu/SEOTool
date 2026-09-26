import { describe, it, expect } from "vitest";
import { parseRobotsTxt, isPathAllowed } from "@/lib/crawler/robots";

describe("parseRobotsTxt", () => {
  it("parses a wildcard group's rules and sitemap declarations", () => {
    const txt = `
User-agent: *
Disallow: /admin
Allow: /admin/public
Sitemap: https://example.com/sitemap.xml
`;
    const rules = parseRobotsTxt(txt);
    expect(rules.rules).toEqual([
      { path: "/admin", allow: false },
      { path: "/admin/public", allow: true },
    ]);
    expect(rules.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("prefers a group targeting our crawler over the wildcard group", () => {
    const txt = `
User-agent: *
Disallow: /

User-agent: AISEOIntelligencePlatform-Crawler
Disallow: /private
`;
    const rules = parseRobotsTxt(txt);
    expect(rules.rules).toEqual([{ path: "/private", allow: false }]);
  });

  it("ignores comments and blank lines", () => {
    const txt = `
# this is a comment
User-agent: *
Disallow: /secret # trailing comment

`;
    const rules = parseRobotsTxt(txt);
    expect(rules.rules).toEqual([{ path: "/secret", allow: false }]);
  });

  it("collects a syntax warning for a Disallow before any User-agent", () => {
    const txt = `Disallow: /orphan\nUser-agent: *\nDisallow: /admin\n`;
    const rules = parseRobotsTxt(txt);
    expect(rules.syntaxWarnings.length).toBeGreaterThan(0);
    expect(rules.syntaxWarnings[0]).toMatch(/before any User-agent/);
  });

  it("collects a syntax warning for a line with no colon", () => {
    const txt = `User-agent: *\nThis is not a directive\nDisallow: /admin\n`;
    const rules = parseRobotsTxt(txt);
    expect(rules.syntaxWarnings.length).toBeGreaterThan(0);
  });

  it("detects a dedicated group for a known AI crawler", () => {
    const txt = `User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nDisallow: /\n`;
    const rules = parseRobotsTxt(txt);
    expect(rules.aiCrawlerGroups).toEqual(["GPTBot"]);
  });

  it("does not report an AI crawler group when only * is present", () => {
    const txt = `User-agent: *\nDisallow: /admin\n`;
    expect(parseRobotsTxt(txt).aiCrawlerGroups).toEqual([]);
  });
});

describe("isPathAllowed — wildcard support", () => {
  it("matches a * wildcard mid-pattern", () => {
    const rules = {
      rules: [{ path: "/*.pdf", allow: false }],
      sitemaps: [],
      found: true,
      syntaxWarnings: [],
      aiCrawlerGroups: [],
    };
    expect(isPathAllowed(rules, "/downloads/report.pdf")).toBe(false);
    expect(isPathAllowed(rules, "/downloads/report.html")).toBe(true);
  });

  it("respects a $ end-anchor", () => {
    const rules = {
      rules: [{ path: "/private$", allow: false }],
      sitemaps: [],
      found: true,
      syntaxWarnings: [],
      aiCrawlerGroups: [],
    };
    expect(isPathAllowed(rules, "/private")).toBe(false);
    expect(isPathAllowed(rules, "/private/nested")).toBe(true);
  });

  it("still does plain prefix matching for patterns without wildcards", () => {
    const rules = {
      rules: [{ path: "/blog", allow: false }],
      sitemaps: [],
      found: true,
      syntaxWarnings: [],
      aiCrawlerGroups: [],
    };
    expect(isPathAllowed(rules, "/blog/post-1")).toBe(false);
    expect(isPathAllowed(rules, "/blogging")).toBe(false); // prefix match is intentionally substring-of-path, per spec
    expect(isPathAllowed(rules, "/other")).toBe(true);
  });
});

describe("isPathAllowed", () => {
  it("allows everything when there are no rules", () => {
    expect(
      isPathAllowed({ rules: [], sitemaps: [], found: true, syntaxWarnings: [], aiCrawlerGroups: [] }, "/anything")
    ).toBe(true);
  });

  it("applies longest-match-wins", () => {
    const rules = {
      rules: [
        { path: "/blog", allow: false },
        { path: "/blog/public", allow: true },
      ],
      sitemaps: [],
      found: true,
      syntaxWarnings: [],
      aiCrawlerGroups: [],
    };
    expect(isPathAllowed(rules, "/blog/private")).toBe(false);
    expect(isPathAllowed(rules, "/blog/public/post")).toBe(true);
  });

  it("breaks an equal-length tie in favor of Allow", () => {
    const rules = {
      rules: [{ path: "/x", allow: false }, { path: "/x", allow: true }],
      sitemaps: [],
      found: true,
      syntaxWarnings: [],
      aiCrawlerGroups: [],
    };
    expect(isPathAllowed(rules, "/x")).toBe(true);
  });
});
