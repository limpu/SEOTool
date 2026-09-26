import type { RuleViolation } from "./on-page";
import { isFaqHeading, isQuestionHeading } from "@/lib/crawler/extract";

/**
 * Phase 24 — AI Search Intelligence rule evaluation. Turns the same
 * deterministic content-structure signals `src/lib/ai-search/readiness.ts`
 * scores into `seo_issues` rows, following the exact evaluate-function
 * pattern every prior rule registry uses (see `evaluateSchemaIssues`,
 * `evaluateLlmsIssues`). Gated by a minimum word count so thin/navigational
 * pages (which legitimately have no FAQ/lists/citations) don't get flooded
 * with low-value "opportunity" noise.
 */
const MIN_WORD_COUNT_FOR_CONTENT_RULES = 150;

export interface AiSearchPageInput {
  wordCount: number;
  headings: { level: number; text: string }[];
  listCount: number;
  tableCount: number;
  schemaTypes: string[];
  externalLinks: { anchorText: string | null }[];
}

const GENERIC_ANCHOR_TEXT = new Set([
  "click here",
  "here",
  "read more",
  "learn more",
  "this link",
  "link",
  "more",
  "this page",
  "website",
]);

export function evaluateAiSearchPageIssues(input: AiSearchPageInput): RuleViolation[] {
  if (input.wordCount < MIN_WORD_COUNT_FOR_CONTENT_RULES) return [];

  const violations: RuleViolation[] = [];

  const questionHeadings = input.headings.filter((h) => isQuestionHeading(h.text));
  const hasFaqHeading = input.headings.some((h) => isFaqHeading(h.text));
  const hasFaqSchema = input.schemaTypes.includes("FAQPage");

  if (questionHeadings.length === 0) {
    violations.push({
      ruleKey: "AEO_NO_HEADING_QUESTIONS",
      evidence: `${input.headings.length} heading(s) found on a ${input.wordCount}-word page; none are question-shaped.`,
    });
  }

  if (!hasFaqSchema && !(hasFaqHeading && questionHeadings.length >= 2)) {
    violations.push({
      ruleKey: "AEO_NO_FAQ_STRUCTURE",
      evidence: hasFaqHeading
        ? `An FAQ-labeled heading was found, but only ${questionHeadings.length} question-shaped heading(s) accompany it, and no FAQPage schema is present.`
        : "No FAQPage schema or FAQ-labeled heading found.",
    });
  }

  const citationLinks = input.externalLinks.filter((l) => {
    const text = (l.anchorText ?? "").trim().toLowerCase();
    return text.length > 3 && !GENERIC_ANCHOR_TEXT.has(text);
  });
  if (citationLinks.length === 0) {
    violations.push({
      ruleKey: "GEO_NO_CITATION_LINKS",
      evidence: `${input.externalLinks.length} outbound external link(s) found; none have descriptive (non-generic) anchor text.`,
    });
  }

  if (input.listCount === 0 && input.tableCount === 0) {
    violations.push({
      ruleKey: "AEO_NO_LISTS_OR_TABLES",
      evidence: `${input.wordCount}-word page with no <ul>/<ol> lists and no <table> elements.`,
    });
  }

  if (input.schemaTypes.length === 0) {
    violations.push({
      ruleKey: "AEO_NO_STRUCTURED_DATA",
      evidence: `${input.wordCount}-word page with no structured data (JSON-LD/Microdata/RDFa) of any type.`,
    });
  }

  const idealHeadings = input.wordCount / 250;
  const ratio = idealHeadings > 0 ? input.headings.length / idealHeadings : 0;
  if (ratio < 0.4) {
    violations.push({
      ruleKey: "GEO_LOW_CONTENT_CHUNKABILITY",
      evidence: `${input.headings.length} heading(s) across ${input.wordCount} words (roughly 1 per ${input.headings.length > 0 ? Math.round(input.wordCount / input.headings.length) : input.wordCount} words) — few natural break points.`,
    });
  }

  return violations;
}

/**
 * Site-level: fires once, attached to the homepage row (same pattern as
 * every other site-level check in `run-crawl.ts`), when NO crawled page has
 * Organization or Person structured data anywhere on the site.
 */
export function evaluateAiSearchSiteIssues(anyPageHasEntitySchema: boolean): RuleViolation[] {
  if (anyPageHasEntitySchema) return [];
  return [
    {
      ruleKey: "GEO_NO_ENTITY_SCHEMA",
      evidence: "No crawled page on this site publishes Organization or Person JSON-LD structured data.",
    },
  ];
}
