import { describe, expect, it } from "vitest";

import {
  aggregateDimensions,
  splitAssessed,
  uniqueAssessedDimensions,
} from "@/components/report/ai-dimensions";
import {
  computePageAiSearchReadiness,
  unassessedAeoDimensions,
  unassessedGeoDimensions,
  type DimensionResult,
  type PageContentSignals,
} from "@/lib/ai-search/readiness";

/**
 * Stage 3A — site-level rollup of Phase 24's per-page AI Search dimensions.
 *
 * The point of these tests is that a dimension Phase 24 declines to score
 * survives aggregation as "not assessed" rather than being averaged into a 0
 * or dropped so the page looks complete. The last describe block checks that
 * against the REAL readiness engine, not a hand-written fixture.
 */

function assessed(key: string, label: string, score: number, evidence = `evidence for ${key}`): DimensionResult {
  return { key, label, status: "assessed", score, evidence };
}

function unassessed(key: string, label: string, reason: string): DimensionResult {
  return { key, label, status: "unassessed", score: null, evidence: "Not measured.", reason };
}

describe("aggregateDimensions", () => {
  it("averages an assessed dimension across pages and reports the denominator", () => {
    const rows = aggregateDimensions([
      [assessed("lists", "Lists", 100)],
      [assessed("lists", "Lists", 0)],
      [assessed("lists", "Lists", 50)],
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "lists",
      label: "Lists",
      status: "assessed",
      score: 50,
      pagesAssessed: 3,
      pagesConsidered: 3,
    });
  });

  it("rounds to a whole number, matching how every other score in the product reads", () => {
    const rows = aggregateDimensions([[assessed("x", "X", 1)], [assessed("x", "X", 2)]]);
    expect(rows[0].score).toBe(2);
  });

  it("keeps an unassessed dimension unassessed — never 0, never dropped", () => {
    const rows = aggregateDimensions([
      [unassessed("answerability", "Answerability", "Needs semantic judgment.")],
      [unassessed("answerability", "Answerability", "Needs semantic judgment.")],
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("unassessed");
    expect(rows[0].score).toBeNull();
    expect(rows[0].score).not.toBe(0);
    expect(rows[0].pagesAssessed).toBe(0);
    expect(rows[0].reason).toBe("Needs semantic judgment.");
  });

  it("averages only the pages that produced a number when a dimension is mixed", () => {
    // Content Chunkability is genuinely `unassessed` on a zero-word page.
    const rows = aggregateDimensions([
      [assessed("contentChunkability", "Content Chunkability", 80)],
      [unassessed("contentChunkability", "Content Chunkability", "Page has zero measured word count.")],
      [assessed("contentChunkability", "Content Chunkability", 40)],
    ]);

    expect(rows[0]).toMatchObject({
      status: "assessed",
      score: 60,
      pagesAssessed: 2,
      pagesConsidered: 3,
      reason: null,
    });
  });

  it("keeps a measured all-zero dimension as an assessed 0, not as unassessed", () => {
    const rows = aggregateDimensions([[assessed("tables", "Tables", 0)], [assessed("tables", "Tables", 0)]]);
    expect(rows[0].status).toBe("assessed");
    expect(rows[0].score).toBe(0);
  });

  it("takes its example evidence from an assessed page, never from a 'Not measured.' row", () => {
    const rows = aggregateDimensions([
      [unassessed("contentChunkability", "Content Chunkability", "No body content.")],
      [assessed("contentChunkability", "Content Chunkability", 70, "12 headings across 3000 words.")],
    ]);
    expect(rows[0].exampleEvidence).toBe("12 headings across 3000 words.");
  });

  it("preserves first-seen dimension order so the list does not reshuffle between crawls", () => {
    const rows = aggregateDimensions([
      [assessed("a", "A", 1), assessed("b", "B", 1), assessed("c", "C", 1)],
      [assessed("c", "C", 1), assessed("a", "A", 1)],
    ]);
    expect(rows.map((row) => row.key)).toEqual(["a", "b", "c"]);
  });

  it("returns nothing for no pages, rather than a set of zeroes", () => {
    expect(aggregateDimensions([])).toEqual([]);
  });
});

describe("splitAssessed", () => {
  it("separates the two groups the UI must not let look alike", () => {
    const rows = aggregateDimensions([
      [assessed("lists", "Lists", 0), unassessed("evidenceQuality", "Evidence", "Needs source-quality judgment.")],
    ]);
    const { assessed: measured, unassessed: notAssessed } = splitAssessed(rows);

    expect(measured.map((row) => row.key)).toEqual(["lists"]);
    expect(measured[0].score).toBe(0);
    expect(notAssessed.map((row) => row.key)).toEqual(["evidenceQuality"]);
    expect(notAssessed[0].score).toBeNull();
  });
});

describe("uniqueAssessedDimensions", () => {
  it("collapses a dimension that Phase 24 reuses in several composites", () => {
    const entity = assessed("entityClarity", "Entity Clarity", 100);
    const rows = uniqueAssessedDimensions([
      [entity, assessed("questionCoverage", "Question Coverage", 20)],
      [entity, assessed("lists", "Lists", 100)],
      [entity],
    ]);
    expect(rows.map((row) => row.key)).toEqual(["entityClarity", "questionCoverage", "lists"]);
  });

  it("excludes unassessed rows, which are site-constant and stated once at site level", () => {
    const rows = uniqueAssessedDimensions([
      [assessed("lists", "Lists", 100), unassessed("answerability", "Answerability", "Semantic judgment.")],
    ]);
    expect(rows.map((row) => row.key)).toEqual(["lists"]);
  });
});

describe("against the real Phase 24 readiness engine", () => {
  const signals: PageContentSignals = {
    wordCount: 900,
    headings: [
      { level: 2, text: "What is a skin peel?" },
      { level: 2, text: "Pricing" },
    ],
    questionHeadings: ["What is a skin peel?"],
    hasFaqHeading: false,
    listCount: 2,
    tableCount: 0,
    definitionListCount: 0,
    schemaTypes: [],
    hasFaqSchema: false,
    externalLinks: [],
  };

  it("carries every real unassessed GEO/AEO dimension through aggregation as unassessed", () => {
    const page = computePageAiSearchReadiness(signals);

    const geo = splitAssessed(aggregateDimensions([page.geo.dimensions, page.geo.dimensions]));
    const aeo = splitAssessed(aggregateDimensions([page.aeo.dimensions, page.aeo.dimensions]));

    expect(geo.unassessed.map((row) => row.key).sort()).toEqual(
      unassessedGeoDimensions()
        .map((row) => row.key)
        .sort()
    );
    expect(aeo.unassessed.map((row) => row.key).sort()).toEqual(
      unassessedAeoDimensions()
        .map((row) => row.key)
        .sort()
    );

    // None of them leaks a number.
    for (const row of [...geo.unassessed, ...aeo.unassessed]) {
      expect(row.score).toBeNull();
      expect(row.reason).toBeTruthy();
    }
  });

  it("keeps genuinely-measured zeroes (no schema, no tables) in the ASSESSED group", () => {
    const page = computePageAiSearchReadiness(signals);
    const { assessed: measured } = splitAssessed(aggregateDimensions([page.aeo.dimensions]));

    const tables = measured.find((row) => row.key === "tables");
    const structuredData = measured.find((row) => row.key === "structuredData");

    expect(tables?.score).toBe(0);
    expect(structuredData?.score).toBe(0);
  });
});
