import { describe, it, expect } from "vitest";
import { evaluateRobotsIssues } from "@/lib/seo-rules/robots";
import type { RobotsRules } from "@/lib/crawler/robots";

function rules(overrides: Partial<RobotsRules> = {}): RobotsRules {
  return {
    rules: [],
    sitemaps: [],
    found: true,
    syntaxWarnings: [],
    aiCrawlerGroups: [],
    ...overrides,
  };
}

function keys(r: RobotsRules) {
  return evaluateRobotsIssues(r).map((v) => v.ruleKey);
}

describe("evaluateRobotsIssues — clean file", () => {
  it("produces no violations for permissive, well-formed rules", () => {
    expect(keys(rules({ rules: [{ path: "/admin", allow: false }] }))).toEqual([]);
  });
});

describe("syntax", () => {
  it("flags syntax warnings", () => {
    expect(keys(rules({ syntaxWarnings: ["Line 3: bad line"] }))).toContain("ROBOTS_SYNTAX_ERROR");
  });
});

describe("blocking severity", () => {
  it("flags ROBOTS_DISALLOW_ALL for Disallow: /", () => {
    const violations = keys(rules({ rules: [{ path: "/", allow: false }] }));
    expect(violations).toContain("ROBOTS_DISALLOW_ALL");
    expect(violations).not.toContain("ROBOTS_HOMEPAGE_BLOCKED"); // subsumed, avoid noise
  });

  it("flags only ROBOTS_HOMEPAGE_BLOCKED for a homepage-specific block", () => {
    const violations = keys(rules({ rules: [{ path: "/$", allow: false }] }));
    expect(violations).toContain("ROBOTS_HOMEPAGE_BLOCKED");
    expect(violations).not.toContain("ROBOTS_DISALLOW_ALL");
  });

  it("flags neither when only an unrelated path is blocked", () => {
    const violations = keys(rules({ rules: [{ path: "/admin", allow: false }] }));
    expect(violations).not.toContain("ROBOTS_DISALLOW_ALL");
    expect(violations).not.toContain("ROBOTS_HOMEPAGE_BLOCKED");
  });
});

describe("resource blocking", () => {
  it("flags a Disallow rule targeting CSS files", () => {
    expect(keys(rules({ rules: [{ path: "/*.css", allow: false }] }))).toContain("ROBOTS_RESOURCE_BLOCKED");
  });

  it("flags a Disallow rule targeting a /js/ directory", () => {
    expect(keys(rules({ rules: [{ path: "/js/", allow: false }] }))).toContain("ROBOTS_RESOURCE_BLOCKED");
  });

  it("does not flag an unrelated Disallow rule", () => {
    expect(keys(rules({ rules: [{ path: "/private", allow: false }] }))).not.toContain(
      "ROBOTS_RESOURCE_BLOCKED"
    );
  });

  it("does not flag an Allow rule even if it mentions css", () => {
    expect(keys(rules({ rules: [{ path: "/css/", allow: true }] }))).not.toContain("ROBOTS_RESOURCE_BLOCKED");
  });
});

describe("AI crawler custom rules", () => {
  it("flags when a known AI crawler has a dedicated group", () => {
    expect(keys(rules({ aiCrawlerGroups: ["GPTBot"] }))).toContain("ROBOTS_AI_CRAWLER_CUSTOM_RULES");
  });

  it("does not flag when no AI crawler groups are present", () => {
    expect(keys(rules())).not.toContain("ROBOTS_AI_CRAWLER_CUSTOM_RULES");
  });
});
