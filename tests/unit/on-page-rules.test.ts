import { describe, it, expect } from "vitest";
import { evaluatePageIssues, evaluateDuplicateIssues, type OnPageAnalysisInput } from "@/lib/seo-rules/on-page";
import type { ExtractedPage } from "@/lib/crawler/extract";

const BASE_PAGE: ExtractedPage = {
  title: "A Perfectly Reasonable Page Title For Testing",
  titleTagExists: true,
  metaDescription:
    "A meta description that is comfortably within the fifty to one hundred sixty character sweet spot for search snippets.",
  metaDescriptionTagExists: true,
  canonical: "https://example.com/page",
  robots: null,
  h1: "Main Heading",
  wordCount: 500,
};

function baseInput(overrides: Partial<OnPageAnalysisInput> = {}): OnPageAnalysisInput {
  return {
    pageUrl: "https://example.com/page",
    siteHostname: "example.com",
    page: BASE_PAGE,
    headings: [{ level: 1, text: "Main Heading" }, { level: 2, text: "Subheading" }],
    openGraph: { "og:title": "T", "og:description": "D", "og:image": "https://example.com/img.png" },
    twitterCard: { "twitter:card": "summary" },
    hreflang: [],
    images: [
      {
        url: "https://example.com/a.png",
        alt: "A photo",
        altAttributeExists: true,
        width: 100,
        height: 100,
        lazyLoaded: false,
        hasSrcset: false,
      },
    ],
    links: [{ targetUrl: "https://example.com/b", anchorText: "Read more about B", isInternal: true }],
    ...overrides,
  };
}

function violationKeys(input: OnPageAnalysisInput) {
  return evaluatePageIssues(input).map((v) => v.ruleKey);
}

describe("evaluatePageIssues — clean page", () => {
  it("produces no violations for a fully compliant page", () => {
    expect(violationKeys(baseInput())).toEqual([]);
  });
});

describe("title rules", () => {
  it("flags a missing title tag", () => {
    const keys = violationKeys(
      baseInput({ page: { ...BASE_PAGE, titleTagExists: false, title: null } })
    );
    expect(keys).toContain("ONPAGE_TITLE_MISSING");
    expect(keys).not.toContain("ONPAGE_TITLE_EMPTY");
  });

  it("flags an empty title tag distinctly from missing", () => {
    const keys = violationKeys(baseInput({ page: { ...BASE_PAGE, title: null } }));
    expect(keys).toContain("ONPAGE_TITLE_EMPTY");
    expect(keys).not.toContain("ONPAGE_TITLE_MISSING");
  });

  it("flags a too-short title", () => {
    const keys = violationKeys(baseInput({ page: { ...BASE_PAGE, title: "Short" } }));
    expect(keys).toContain("ONPAGE_TITLE_TOO_SHORT");
  });

  it("flags a too-long title", () => {
    const keys = violationKeys(
      baseInput({ page: { ...BASE_PAGE, title: "A".repeat(80) } })
    );
    expect(keys).toContain("ONPAGE_TITLE_TOO_LONG");
  });
});

describe("meta description rules", () => {
  it("flags a missing meta description tag", () => {
    const keys = violationKeys(
      baseInput({ page: { ...BASE_PAGE, metaDescriptionTagExists: false, metaDescription: null } })
    );
    expect(keys).toContain("ONPAGE_META_DESCRIPTION_MISSING");
  });

  it("flags an empty meta description distinctly from missing", () => {
    const keys = violationKeys(baseInput({ page: { ...BASE_PAGE, metaDescription: null } }));
    expect(keys).toContain("ONPAGE_META_DESCRIPTION_EMPTY");
    expect(keys).not.toContain("ONPAGE_META_DESCRIPTION_MISSING");
  });
});

describe("heading rules", () => {
  it("flags a missing H1", () => {
    const keys = violationKeys(baseInput({ headings: [{ level: 2, text: "Only a subheading" }] }));
    expect(keys).toContain("ONPAGE_H1_MISSING");
  });

  it("flags multiple H1 elements", () => {
    const keys = violationKeys(
      baseInput({ headings: [{ level: 1, text: "One" }, { level: 1, text: "Two" }] })
    );
    expect(keys).toContain("ONPAGE_H1_MULTIPLE");
  });

  it("flags an empty H1", () => {
    const keys = violationKeys(baseInput({ headings: [{ level: 1, text: "" }] }));
    expect(keys).toContain("ONPAGE_H1_EMPTY");
  });

  it("flags an empty non-H1 heading", () => {
    const keys = violationKeys(
      baseInput({ headings: [{ level: 1, text: "Main" }, { level: 2, text: "" }] })
    );
    expect(keys).toContain("ONPAGE_HEADING_EMPTY");
  });

  it("flags a heading level skip", () => {
    const keys = violationKeys(
      baseInput({ headings: [{ level: 1, text: "Main" }, { level: 3, text: "Skipped to H3" }] })
    );
    expect(keys).toContain("ONPAGE_HEADING_HIERARCHY_SKIP");
  });

  it("does not flag a proper sequential hierarchy", () => {
    const keys = violationKeys(
      baseInput({
        headings: [
          { level: 1, text: "Main" },
          { level: 2, text: "Sub" },
          { level: 3, text: "Sub-sub" },
          { level: 2, text: "Back to sub" },
        ],
      })
    );
    expect(keys).not.toContain("ONPAGE_HEADING_HIERARCHY_SKIP");
  });
});

describe("canonical rules", () => {
  it("flags a missing canonical", () => {
    const keys = violationKeys(baseInput({ page: { ...BASE_PAGE, canonical: null } }));
    expect(keys).toContain("ONPAGE_CANONICAL_MISSING");
  });

  it("flags a cross-domain canonical", () => {
    const keys = violationKeys(
      baseInput({ page: { ...BASE_PAGE, canonical: "https://another-domain.com/page" } })
    );
    expect(keys).toContain("ONPAGE_CANONICAL_CROSS_DOMAIN");
  });
});

describe("robots rule", () => {
  it("flags noindex", () => {
    const keys = violationKeys(baseInput({ page: { ...BASE_PAGE, robots: "noindex, follow" } }));
    expect(keys).toContain("ONPAGE_ROBOTS_NOINDEX");
  });

  it("does not flag when robots meta is absent", () => {
    expect(violationKeys(baseInput())).not.toContain("ONPAGE_ROBOTS_NOINDEX");
  });
});

describe("social metadata rules", () => {
  it("flags missing Open Graph tags individually", () => {
    const keys = violationKeys(baseInput({ openGraph: {} }));
    expect(keys).toEqual(
      expect.arrayContaining([
        "ONPAGE_OG_MISSING_TITLE",
        "ONPAGE_OG_MISSING_DESCRIPTION",
        "ONPAGE_OG_MISSING_IMAGE",
      ])
    );
  });

  it("flags a missing twitter:card", () => {
    const keys = violationKeys(baseInput({ twitterCard: {} }));
    expect(keys).toContain("ONPAGE_TWITTER_MISSING_CARD");
  });
});

describe("hreflang rule", () => {
  it("does nothing when no hreflang tags are present", () => {
    expect(violationKeys(baseInput({ hreflang: [] }))).not.toContain("ONPAGE_HREFLANG_MISSING_SELF");
  });

  it("flags a hreflang set with no self-reference", () => {
    const keys = violationKeys(
      baseInput({ hreflang: [{ lang: "fr", href: "https://example.com/fr/page" }] })
    );
    expect(keys).toContain("ONPAGE_HREFLANG_MISSING_SELF");
  });

  it("does not flag when a self-reference is present", () => {
    const keys = violationKeys(
      baseInput({
        hreflang: [
          { lang: "en", href: "https://example.com/page" },
          { lang: "fr", href: "https://example.com/fr/page" },
        ],
      })
    );
    expect(keys).not.toContain("ONPAGE_HREFLANG_MISSING_SELF");
  });
});

describe("image and link rules", () => {
  it("flags images with no alt attribute at all", () => {
    const keys = violationKeys(
      baseInput({
        images: [
          {
            url: "https://example.com/a.png",
            alt: null,
            altAttributeExists: false,
            width: null,
            height: null,
            lazyLoaded: false,
            hasSrcset: false,
          },
        ],
      })
    );
    expect(keys).toContain("ONPAGE_IMAGE_MISSING_ALT");
  });

  it("does not flag a decorative image with an explicit empty alt attribute", () => {
    const keys = violationKeys(
      baseInput({
        images: [
          {
            url: "https://example.com/a.png",
            alt: null,
            altAttributeExists: true,
            width: null,
            height: null,
            lazyLoaded: false,
            hasSrcset: false,
          },
        ],
      })
    );
    expect(keys).not.toContain("ONPAGE_IMAGE_MISSING_ALT");
  });

  it("flags links with empty anchor text", () => {
    const keys = violationKeys(
      baseInput({ links: [{ targetUrl: "https://example.com/b", anchorText: null, isInternal: true }] })
    );
    expect(keys).toContain("ONPAGE_LINK_EMPTY_ANCHOR");
  });
});

describe("evaluateDuplicateIssues", () => {
  it("flags pages sharing an identical title", () => {
    const issues = evaluateDuplicateIssues([
      { id: "a", title: "Same Title", metaDescription: null },
      { id: "b", title: "Same Title", metaDescription: null },
      { id: "c", title: "Different Title", metaDescription: null },
    ]);
    const flaggedIds = issues.filter((i) => i.ruleKey === "ONPAGE_TITLE_DUPLICATE").map((i) => i.pageId);
    expect(flaggedIds.sort()).toEqual(["a", "b"]);
  });

  it("flags pages sharing an identical meta description", () => {
    const issues = evaluateDuplicateIssues([
      { id: "a", title: null, metaDescription: "Same description" },
      { id: "b", title: null, metaDescription: "Same description" },
    ]);
    expect(issues.every((i) => i.ruleKey === "ONPAGE_META_DESCRIPTION_DUPLICATE")).toBe(true);
    expect(issues).toHaveLength(2);
  });

  it("does not flag unique titles or null titles", () => {
    const issues = evaluateDuplicateIssues([
      { id: "a", title: null, metaDescription: null },
      { id: "b", title: null, metaDescription: null },
      { id: "c", title: "Unique", metaDescription: null },
    ]);
    expect(issues).toEqual([]);
  });
});
