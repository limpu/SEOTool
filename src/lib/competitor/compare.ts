/**
 * Phase 28 — Competitor / Content Gap (pure, deterministic, no I/O).
 *
 * Scoping decision (see read.md's Phase 28 write-up for the full reasoning):
 * the master doc's Section 57 ("Competitor Analysis") lists the comparison
 * dimensions as Technical SEO / Content / Schema / PageSpeed / Internal
 * links / Topic coverage / SERP visibility / AI readiness, and explicitly
 * warns "Do not claim accurate traffic estimates without reliable data."
 * Of that list, this module (plus `queries.ts`) builds everything this
 * codebase can measure deterministically from a real crawl of the
 * competitor's own public site, reusing Phase 6's crawler, Phase 22's
 * scoring, and Phase 23's issue-aggregation logic verbatim:
 *
 *   - Technical SEO / Content (structural)  -> page count, average word
 *     count, average heading count, rule-key issue diff (this module)
 *   - Schema                                -> schema-type usage diff (this
 *     module)
 *   - PageSpeed                             -> Technical/On-page/Performance/
 *     Overall scores (Phase 22's `computeWebsiteScores`, reused as-is)
 *   - AI readiness                          -> GEO/AEO/AIO readiness scores
 *     (Phase 24's `computeWebsiteAiSearch`, reused as-is)
 *
 * "Topic coverage" and "SERP visibility" in the master doc's list describe
 * genuinely SEMANTIC/topical content-gap analysis ("what topics/keyword
 * clusters does the competitor rank for or write about that I don't") —
 * that requires understanding what a page is ABOUT, not just its HTML
 * structure, which is beyond what deterministic rule-based analysis can
 * honestly claim (same judgment call as Phase 24 marking Answerability /
 * Semantic Completeness "unassessed" pending Phase 29's LLM/SLM
 * integration). This module therefore does NOT claim to detect topical
 * content gaps — the comparison view is labeled "Technical & Structural
 * Comparison" throughout the API/UI, not "Content Gap Analysis", so it
 * never implies deeper topical analysis is happening (Section 79 #3/#5).
 * Real topical/keyword gap analysis is deferred to Phase 29+.
 */

export interface SiteStructuralSnapshot {
  websiteId: string;
  label: string;
  crawledAt: string | null;
  pageCount: number;
  avgWordCount: number | null;
  avgHeadingCount: number | null;
  ruleKeys: string[];
  schemaTypes: string[];
}

export interface StructuralComparisonResult {
  yourSite: Omit<SiteStructuralSnapshot, "ruleKeys" | "schemaTypes"> & { schemaTypes: string[] };
  competitor: Omit<SiteStructuralSnapshot, "ruleKeys" | "schemaTypes"> & { schemaTypes: string[] };
  issuesOnlyYouHave: string[];
  issuesOnlyCompetitorHas: string[];
  issuesBothHave: string[];
  schemaTypesOnlyYouHave: string[];
  schemaTypesOnlyCompetitorHas: string[];
  schemaTypesBothHave: string[];
}

/**
 * Pure set-diff/aggregation over two already-computed structural snapshots.
 * Every array in the result is sorted for deterministic, reproducible
 * output (two runs against the same underlying data must render identically).
 */
export function buildStructuralComparison(
  yours: SiteStructuralSnapshot,
  competitor: SiteStructuralSnapshot
): StructuralComparisonResult {
  const yourRuleKeys = new Set(yours.ruleKeys);
  const competitorRuleKeys = new Set(competitor.ruleKeys);
  const yourSchemaTypes = new Set(yours.schemaTypes);
  const competitorSchemaTypes = new Set(competitor.schemaTypes);

  const issuesOnlyYouHave = [...yourRuleKeys].filter((k) => !competitorRuleKeys.has(k)).sort();
  const issuesOnlyCompetitorHas = [...competitorRuleKeys].filter((k) => !yourRuleKeys.has(k)).sort();
  const issuesBothHave = [...yourRuleKeys].filter((k) => competitorRuleKeys.has(k)).sort();

  const schemaTypesOnlyYouHave = [...yourSchemaTypes].filter((s) => !competitorSchemaTypes.has(s)).sort();
  const schemaTypesOnlyCompetitorHas = [...competitorSchemaTypes].filter((s) => !yourSchemaTypes.has(s)).sort();
  const schemaTypesBothHave = [...yourSchemaTypes].filter((s) => competitorSchemaTypes.has(s)).sort();

  const strip = (s: SiteStructuralSnapshot) => ({
    websiteId: s.websiteId,
    label: s.label,
    crawledAt: s.crawledAt,
    pageCount: s.pageCount,
    avgWordCount: s.avgWordCount,
    avgHeadingCount: s.avgHeadingCount,
    schemaTypes: [...new Set(s.schemaTypes)].sort(),
  });

  return {
    yourSite: strip(yours),
    competitor: strip(competitor),
    issuesOnlyYouHave,
    issuesOnlyCompetitorHas,
    issuesBothHave,
    schemaTypesOnlyYouHave,
    schemaTypesOnlyCompetitorHas,
    schemaTypesBothHave,
  };
}
