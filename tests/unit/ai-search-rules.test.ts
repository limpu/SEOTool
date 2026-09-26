import { describe, it, expect } from "vitest";
import { evaluateAiSearchPageIssues, evaluateAiSearchSiteIssues, type AiSearchPageInput } from "@/lib/seo-rules/ai-search";

function baseInput(overrides: Partial<AiSearchPageInput> = {}): AiSearchPageInput {
  return {
    wordCount: 1000,
    headings: [
      { level: 1, text: "Guide" },
      { level: 2, text: "What is GEO?" },
      { level: 2, text: "How does it work?" },
    ],
    listCount: 1,
    tableCount: 0,
    schemaTypes: ["Article"],
    externalLinks: [{ anchorText: "peer-reviewed study" }],
    ...overrides,
  };
}

describe("evaluateAiSearchPageIssues — gating", () => {
  it("returns no violations for a thin page below the word-count threshold", () => {
    expect(evaluateAiSearchPageIssues(baseInput({ wordCount: 50 }))).toEqual([]);
  });
});

describe("evaluateAiSearchPageIssues — AEO_NO_HEADING_QUESTIONS", () => {
  it("flags when no heading is question-shaped", () => {
    const v = evaluateAiSearchPageIssues(baseInput({ headings: [{ level: 1, text: "Home" }, { level: 2, text: "Overview" }] }));
    expect(v.map((x) => x.ruleKey)).toContain("AEO_NO_HEADING_QUESTIONS");
  });

  it("does not flag when at least one heading is question-shaped", () => {
    const v = evaluateAiSearchPageIssues(baseInput());
    expect(v.map((x) => x.ruleKey)).not.toContain("AEO_NO_HEADING_QUESTIONS");
  });
});

describe("evaluateAiSearchPageIssues — AEO_NO_FAQ_STRUCTURE", () => {
  it("flags when there is no FAQPage schema and no qualifying FAQ heading cluster", () => {
    const v = evaluateAiSearchPageIssues(baseInput());
    expect(v.map((x) => x.ruleKey)).toContain("AEO_NO_FAQ_STRUCTURE");
  });

  it("does not flag when FAQPage schema is present", () => {
    const v = evaluateAiSearchPageIssues(baseInput({ schemaTypes: ["FAQPage"] }));
    expect(v.map((x) => x.ruleKey)).not.toContain("AEO_NO_FAQ_STRUCTURE");
  });

  it("does not flag with an FAQ heading plus 2+ question headings", () => {
    const v = evaluateAiSearchPageIssues(
      baseInput({
        headings: [
          { level: 2, text: "Frequently Asked Questions" },
          { level: 3, text: "What is GEO?" },
          { level: 3, text: "How does it work?" },
        ],
      })
    );
    expect(v.map((x) => x.ruleKey)).not.toContain("AEO_NO_FAQ_STRUCTURE");
  });
});

describe("evaluateAiSearchPageIssues — GEO_NO_CITATION_LINKS", () => {
  it("flags when there are no external links", () => {
    const v = evaluateAiSearchPageIssues(baseInput({ externalLinks: [] }));
    expect(v.map((x) => x.ruleKey)).toContain("GEO_NO_CITATION_LINKS");
  });

  it("flags when external links only have generic anchor text", () => {
    const v = evaluateAiSearchPageIssues(baseInput({ externalLinks: [{ anchorText: "click here" }, { anchorText: null }] }));
    expect(v.map((x) => x.ruleKey)).toContain("GEO_NO_CITATION_LINKS");
  });

  it("does not flag with at least one descriptive external link", () => {
    const v = evaluateAiSearchPageIssues(baseInput());
    expect(v.map((x) => x.ruleKey)).not.toContain("GEO_NO_CITATION_LINKS");
  });
});

describe("evaluateAiSearchPageIssues — AEO_NO_LISTS_OR_TABLES", () => {
  it("flags when neither lists nor tables are present", () => {
    const v = evaluateAiSearchPageIssues(baseInput({ listCount: 0, tableCount: 0 }));
    expect(v.map((x) => x.ruleKey)).toContain("AEO_NO_LISTS_OR_TABLES");
  });

  it("does not flag when a list is present", () => {
    const v = evaluateAiSearchPageIssues(baseInput({ listCount: 1, tableCount: 0 }));
    expect(v.map((x) => x.ruleKey)).not.toContain("AEO_NO_LISTS_OR_TABLES");
  });

  it("does not flag when a table is present", () => {
    const v = evaluateAiSearchPageIssues(baseInput({ listCount: 0, tableCount: 1 }));
    expect(v.map((x) => x.ruleKey)).not.toContain("AEO_NO_LISTS_OR_TABLES");
  });
});

describe("evaluateAiSearchPageIssues — AEO_NO_STRUCTURED_DATA", () => {
  it("flags when no structured data is present", () => {
    const v = evaluateAiSearchPageIssues(baseInput({ schemaTypes: [] }));
    expect(v.map((x) => x.ruleKey)).toContain("AEO_NO_STRUCTURED_DATA");
  });

  it("does not flag when structured data is present", () => {
    const v = evaluateAiSearchPageIssues(baseInput());
    expect(v.map((x) => x.ruleKey)).not.toContain("AEO_NO_STRUCTURED_DATA");
  });
});

describe("evaluateAiSearchPageIssues — GEO_LOW_CONTENT_CHUNKABILITY", () => {
  it("flags when heading density is very low for the word count", () => {
    const v = evaluateAiSearchPageIssues(baseInput({ wordCount: 3000, headings: [{ level: 1, text: "Title" }] }));
    expect(v.map((x) => x.ruleKey)).toContain("GEO_LOW_CONTENT_CHUNKABILITY");
  });

  it("does not flag with healthy heading density", () => {
    const v = evaluateAiSearchPageIssues(baseInput());
    expect(v.map((x) => x.ruleKey)).not.toContain("GEO_LOW_CONTENT_CHUNKABILITY");
  });
});

describe("evaluateAiSearchSiteIssues", () => {
  it("flags GEO_NO_ENTITY_SCHEMA when no page on the site has entity schema", () => {
    const v = evaluateAiSearchSiteIssues(false);
    expect(v.map((x) => x.ruleKey)).toEqual(["GEO_NO_ENTITY_SCHEMA"]);
  });

  it("does not flag when at least one page has entity schema", () => {
    expect(evaluateAiSearchSiteIssues(true)).toEqual([]);
  });
});
