import { describe, it, expect } from "vitest";
import { evaluateLinkIssues, isWeakAnchorText, type LinkRef, type LinkStatus } from "@/lib/seo-rules/links";

describe("isWeakAnchorText", () => {
  it("flags known generic phrases case-insensitively", () => {
    expect(isWeakAnchorText("Click Here")).toBe(true);
    expect(isWeakAnchorText("  read more  ")).toBe(true);
    expect(isWeakAnchorText("HERE")).toBe(true);
  });

  it("does not flag descriptive anchor text", () => {
    expect(isWeakAnchorText("2026 SEO ranking factors guide")).toBe(false);
    expect(isWeakAnchorText("Contact our support team")).toBe(false);
  });
});

describe("evaluateLinkIssues", () => {
  function link(overrides: Partial<LinkRef>): LinkRef {
    return {
      pageId: "page-1",
      targetUrl: "https://example.com/target",
      anchorText: "Descriptive link text",
      isInternal: true,
      ...overrides,
    };
  }

  it("flags a weak anchor text link", () => {
    const issues = evaluateLinkIssues([link({ anchorText: "click here" })], new Map());
    expect(issues).toContainEqual(
      expect.objectContaining({ pageId: "page-1", ruleKey: "LINK_WEAK_ANCHOR_TEXT" })
    );
  });

  it("does not flag null anchor text as weak (that's Phase 7's empty-anchor rule)", () => {
    const issues = evaluateLinkIssues([link({ anchorText: null })], new Map());
    expect(issues).toEqual([]);
  });

  it("flags a broken internal link using a known status", () => {
    const statusByUrl = new Map<string, LinkStatus>([
      ["https://example.com/target", { statusCode: 404, redirectCount: 0 }],
    ]);
    const issues = evaluateLinkIssues([link({})], statusByUrl);
    expect(issues).toContainEqual(
      expect.objectContaining({ pageId: "page-1", ruleKey: "LINK_BROKEN_INTERNAL" })
    );
  });

  it("flags a broken external link with the external rule key", () => {
    const statusByUrl = new Map<string, LinkStatus>([
      ["https://external.com/target", { statusCode: 500, redirectCount: 0 }],
    ]);
    const issues = evaluateLinkIssues(
      [link({ isInternal: false, targetUrl: "https://external.com/target" })],
      statusByUrl
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ pageId: "page-1", ruleKey: "LINK_BROKEN_EXTERNAL" })
    );
  });

  it("flags an unreachable link (null status) as broken", () => {
    const statusByUrl = new Map<string, LinkStatus>([
      ["https://example.com/target", { statusCode: null, redirectCount: -1 }],
    ]);
    const issues = evaluateLinkIssues([link({})], statusByUrl);
    expect(issues).toContainEqual(expect.objectContaining({ ruleKey: "LINK_BROKEN_INTERNAL" }));
  });

  it("flags a redirecting link when status is healthy but redirectCount > 0", () => {
    const statusByUrl = new Map<string, LinkStatus>([
      ["https://example.com/target", { statusCode: 200, redirectCount: 2 }],
    ]);
    const issues = evaluateLinkIssues([link({})], statusByUrl);
    expect(issues).toContainEqual(expect.objectContaining({ ruleKey: "LINK_REDIRECT_INTERNAL" }));
  });

  it("does not flag a redirect when redirectCount is the unknown sentinel (-1)", () => {
    const statusByUrl = new Map<string, LinkStatus>([
      ["https://example.com/target", { statusCode: 200, redirectCount: -1 }],
    ]);
    const issues = evaluateLinkIssues([link({})], statusByUrl);
    expect(issues).toEqual([]);
  });

  it("does not double-flag both broken and redirect for the same link", () => {
    const statusByUrl = new Map<string, LinkStatus>([
      ["https://example.com/target", { statusCode: 404, redirectCount: 3 }],
    ]);
    const issues = evaluateLinkIssues([link({})], statusByUrl);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleKey).toBe("LINK_BROKEN_INTERNAL");
  });

  it("does not flag anything for a healthy, non-redirecting, non-weak-anchor link", () => {
    const statusByUrl = new Map<string, LinkStatus>([
      ["https://example.com/target", { statusCode: 200, redirectCount: 0 }],
    ]);
    expect(evaluateLinkIssues([link({})], statusByUrl)).toEqual([]);
  });

  it("does not duplicate an issue when the same page links to the same broken target twice", () => {
    const statusByUrl = new Map<string, LinkStatus>([
      ["https://example.com/target", { statusCode: 404, redirectCount: 0 }],
    ]);
    const issues = evaluateLinkIssues([link({}), link({ anchorText: "Different text" })], statusByUrl);
    expect(issues.filter((i) => i.ruleKey === "LINK_BROKEN_INTERNAL")).toHaveLength(1);
  });

  it("skips links with no known status entirely (not yet checked)", () => {
    expect(evaluateLinkIssues([link({ targetUrl: "https://example.com/unchecked" })], new Map())).toEqual(
      []
    );
  });
});
