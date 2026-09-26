import { describe, it, expect } from "vitest";
import {
  scoreEntityClarity,
  scoreSourceIdentity,
  scoreCitationReadiness,
  scoreQuestionCoverage,
  scoreContentChunkability,
  scoreDefinitions,
  scoreLists,
  scoreTables,
  scoreFaqStructures,
  scoreHeadings,
  scoreStructuredData,
  computePageAiSearchReadiness,
  unassessedGeoDimensions,
  unassessedAeoDimensions,
} from "@/lib/ai-search/readiness";

describe("scoreEntityClarity / scoreSourceIdentity", () => {
  it("scores 100 when Organization schema is present", () => {
    expect(scoreEntityClarity(["Organization"]).score).toBe(100);
  });

  it("scores 100 when Person schema is present", () => {
    expect(scoreEntityClarity(["Person"]).score).toBe(100);
  });

  it("scores 0 when neither is present", () => {
    expect(scoreEntityClarity(["Article", "WebSite"]).score).toBe(0);
  });

  it("source identity mirrors entity clarity's score", () => {
    expect(scoreSourceIdentity(["Organization"]).score).toBe(100);
    expect(scoreSourceIdentity([]).score).toBe(0);
  });
});

describe("scoreCitationReadiness", () => {
  it("scores 0 with no external links", () => {
    expect(scoreCitationReadiness([]).score).toBe(0);
  });

  it("scores 0 when all anchor text is generic", () => {
    expect(scoreCitationReadiness([{ anchorText: "click here" }, { anchorText: "here" }]).score).toBe(0);
  });

  it("scores 50 with 1-2 descriptive links", () => {
    expect(scoreCitationReadiness([{ anchorText: "2024 industry report" }]).score).toBe(50);
  });

  it("scores 100 with 3+ descriptive links", () => {
    expect(
      scoreCitationReadiness([
        { anchorText: "2024 industry report" },
        { anchorText: "W3C specification" },
        { anchorText: "peer-reviewed study" },
      ]).score
    ).toBe(100);
  });
});

describe("scoreQuestionCoverage", () => {
  it("scores 0 with no headings", () => {
    expect(scoreQuestionCoverage([], []).score).toBe(0);
  });

  it("computes the ratio of question headings to total headings", () => {
    const headings = [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }];
    const result = scoreQuestionCoverage(headings, ["A", "B"]);
    expect(result.score).toBe(50);
  });
});

describe("scoreContentChunkability", () => {
  it("is unassessed for zero word count", () => {
    const result = scoreContentChunkability(0, 3);
    expect(result.status).toBe("unassessed");
    expect(result.score).toBeNull();
  });

  it("scores near 100 for ~1 heading per 250 words", () => {
    const result = scoreContentChunkability(1000, 4);
    expect(result.score).toBe(100);
  });

  it("scores low for very few headings relative to word count", () => {
    const result = scoreContentChunkability(2000, 1);
    expect(result.score).toBeLessThan(20);
  });
});

describe("scoreDefinitions / scoreLists / scoreTables", () => {
  it("scores 100 when the structural element is present, 0 otherwise", () => {
    expect(scoreDefinitions(1).score).toBe(100);
    expect(scoreDefinitions(0).score).toBe(0);
    expect(scoreLists(2).score).toBe(100);
    expect(scoreLists(0).score).toBe(0);
    expect(scoreTables(1).score).toBe(100);
    expect(scoreTables(0).score).toBe(0);
  });
});

describe("scoreFaqStructures", () => {
  it("scores 100 with FAQPage schema regardless of headings", () => {
    expect(scoreFaqStructures(true, false, 0).score).toBe(100);
  });

  it("scores 70 with an FAQ heading plus 2+ question headings but no schema", () => {
    expect(scoreFaqStructures(false, true, 2).score).toBe(70);
  });

  it("scores 40 with 2+ question headings but no FAQ heading or schema", () => {
    expect(scoreFaqStructures(false, false, 3).score).toBe(40);
  });

  it("scores 0 with nothing", () => {
    expect(scoreFaqStructures(false, false, 0).score).toBe(0);
  });
});

describe("scoreHeadings", () => {
  it("scores 0 with only an H1", () => {
    expect(scoreHeadings([{ level: 1 }]).score).toBe(0);
  });

  it("scores 50 with exactly one H2-H6", () => {
    expect(scoreHeadings([{ level: 1 }, { level: 2 }]).score).toBe(50);
  });

  it("scores 100 with 2+ H2-H6", () => {
    expect(scoreHeadings([{ level: 1 }, { level: 2 }, { level: 3 }]).score).toBe(100);
  });
});

describe("scoreStructuredData", () => {
  it("scores 100 when any schema type is present, 0 otherwise", () => {
    expect(scoreStructuredData(["Article"]).score).toBe(100);
    expect(scoreStructuredData([]).score).toBe(0);
  });
});

describe("unassessed dimension lists", () => {
  it("marks every entry status='unassessed' with a null score and a reason", () => {
    for (const dim of [...unassessedGeoDimensions(), ...unassessedAeoDimensions()]) {
      expect(dim.status).toBe("unassessed");
      expect(dim.score).toBeNull();
      expect(dim.reason).toBeTruthy();
    }
  });

  it("GEO unassessed set matches the documented 4 dimensions", () => {
    expect(unassessedGeoDimensions().map((d) => d.key).sort()).toEqual(
      ["answerability", "evidenceQuality", "originalInformation", "semanticCompleteness"].sort()
    );
  });

  it("AEO unassessed set matches the documented 3 dimensions", () => {
    expect(unassessedAeoDimensions().map((d) => d.key).sort()).toEqual(
      ["answerCompleteness", "directAnswers", "evidenceQualityAeo"].sort()
    );
  });
});

describe("computePageAiSearchReadiness — composite scores", () => {
  it("computes a full-signal page as strong across GEO/AEO/AIO", () => {
    const result = computePageAiSearchReadiness({
      wordCount: 1000,
      headings: [
        { level: 1, text: "Guide" },
        { level: 2, text: "What is GEO?" },
        { level: 2, text: "How does it work?" },
        { level: 2, text: "Frequently Asked Questions" },
      ],
      questionHeadings: ["What is GEO?", "How does it work?"],
      hasFaqHeading: true,
      listCount: 2,
      tableCount: 1,
      definitionListCount: 1,
      schemaTypes: ["Organization", "FAQPage"],
      hasFaqSchema: true,
      externalLinks: [{ anchorText: "peer-reviewed study" }, { anchorText: "W3C spec" }, { anchorText: "industry report" }],
    });

    expect(result.geo.score).not.toBeNull();
    expect(result.geo.score as number).toBeGreaterThanOrEqual(80);
    expect(result.aeo.score as number).toBeGreaterThanOrEqual(80);
    expect(result.aio.score as number).toBeGreaterThanOrEqual(80);
  });

  it("computes a bare page (no signals) as weak, never null for a page with word count", () => {
    const result = computePageAiSearchReadiness({
      wordCount: 500,
      headings: [{ level: 1, text: "Home" }],
      questionHeadings: [],
      hasFaqHeading: false,
      listCount: 0,
      tableCount: 0,
      definitionListCount: 0,
      schemaTypes: [],
      hasFaqSchema: false,
      externalLinks: [],
    });

    expect(result.geo.score).not.toBeNull();
    expect(result.geo.score as number).toBeLessThanOrEqual(20);
    expect(result.aeo.score as number).toBeLessThanOrEqual(20);
    expect(result.aio.score as number).toBeLessThanOrEqual(20);
  });

  it("always includes both assessed and unassessed dimensions in the dimension lists", () => {
    const result = computePageAiSearchReadiness({
      wordCount: 100,
      headings: [],
      questionHeadings: [],
      hasFaqHeading: false,
      listCount: 0,
      tableCount: 0,
      definitionListCount: 0,
      schemaTypes: [],
      hasFaqSchema: false,
      externalLinks: [],
    });
    const geoStatuses = result.geo.dimensions.map((d) => d.status);
    expect(geoStatuses).toContain("assessed");
    expect(geoStatuses).toContain("unassessed");
  });
});
