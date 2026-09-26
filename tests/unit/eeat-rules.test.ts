import { describe, it, expect } from "vitest";
import { evaluateEeatPageIssues, evaluateEeatSiteIssues, type EeatPageInput } from "@/lib/seo-rules/eeat";

function baseInput(overrides: Partial<EeatPageInput> = {}): EeatPageInput {
  return {
    wordCount: 800,
    hasAuthorByline: true,
    hasRelAuthorLink: false,
    hasVisibleDate: true,
    schemaTypes: [],
    ...overrides,
  };
}

describe("evaluateEeatPageIssues — gating", () => {
  it("returns no violations for a page below the word-count threshold", () => {
    expect(
      evaluateEeatPageIssues(baseInput({ wordCount: 50, hasAuthorByline: false, hasVisibleDate: false }))
    ).toEqual([]);
  });
});

describe("evaluateEeatPageIssues — EEAT_NO_AUTHOR_BYLINE", () => {
  it("flags when no author/date signal is present at all", () => {
    const v = evaluateEeatPageIssues(
      baseInput({ hasAuthorByline: false, hasRelAuthorLink: false, hasVisibleDate: false, schemaTypes: [] })
    );
    expect(v.map((x) => x.ruleKey)).toContain("EEAT_NO_AUTHOR_BYLINE");
  });

  it("does not flag when a visible byline is present", () => {
    const v = evaluateEeatPageIssues(baseInput());
    expect(v.map((x) => x.ruleKey)).not.toContain("EEAT_NO_AUTHOR_BYLINE");
  });

  it("does not flag when only an Article-schema author property is present", () => {
    const v = evaluateEeatPageIssues(
      baseInput({
        hasAuthorByline: false,
        hasVisibleDate: false,
        schemaTypes: [{ schemaType: "BlogPosting", hasAuthorProperty: true }],
      })
    );
    expect(v.map((x) => x.ruleKey)).not.toContain("EEAT_NO_AUTHOR_BYLINE");
  });

  it("does not flag on Product-schema author (not Article-family)", () => {
    const v = evaluateEeatPageIssues(
      baseInput({
        hasAuthorByline: false,
        hasVisibleDate: false,
        schemaTypes: [{ schemaType: "Product", hasAuthorProperty: true }],
      })
    );
    expect(v.map((x) => x.ruleKey)).toContain("EEAT_NO_AUTHOR_BYLINE");
  });
});

describe("evaluateEeatSiteIssues", () => {
  it("flags all three when no About/Contact/Privacy page is found", () => {
    const v = evaluateEeatSiteIssues({ pages: [{ url: "https://example.com/products", title: "Products" }] });
    expect(v.map((x) => x.ruleKey).sort()).toEqual(["EEAT_NO_ABOUT_PAGE", "EEAT_NO_CONTACT_PAGE", "EEAT_NO_PRIVACY_PAGE"]);
  });

  it("flags none when all three are found", () => {
    const v = evaluateEeatSiteIssues({
      pages: [
        { url: "https://example.com/about", title: "About" },
        { url: "https://example.com/contact", title: "Contact" },
        { url: "https://example.com/privacy-policy", title: "Privacy Policy" },
      ],
    });
    expect(v).toEqual([]);
  });

  it("flags only the missing ones", () => {
    const v = evaluateEeatSiteIssues({
      pages: [{ url: "https://example.com/about-us", title: "About Us" }],
    });
    expect(v.map((x) => x.ruleKey).sort()).toEqual(["EEAT_NO_CONTACT_PAGE", "EEAT_NO_PRIVACY_PAGE"]);
  });
});
