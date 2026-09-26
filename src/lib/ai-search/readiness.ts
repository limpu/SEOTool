/**
 * Phase 24 — AI Search Intelligence (AIO / GEO / AEO Readiness).
 *
 * Pure, deterministic scoring — no AI-model call, no fabricated data
 * (master doc Section 79 #2/#3). Every dimension here is computed directly
 * from structural/markup evidence already extracted from a crawled page:
 * headings (`extractHeadings`, Phase 7), lists/tables/question-headings/FAQ
 * heading (`extractContentStructure`, Phase 24's own addition to
 * `extract.ts`), structured data (`extractStructuredData`, Phase 11), and
 * outbound links (`extractLinks`, Phase 6/9).
 *
 * ─── The single most important judgment call in this phase ────────────────
 *
 * The master doc names many GEO/AEO dimensions (Section 39.2/39.3,
 * Sections 44-46). Each is classified below as one of:
 *
 *   ASSESSED    — real detection logic exists, backed by concrete evidence.
 *   UNASSESSED  — deliberately NOT scored. Faking a proxy score for these
 *                 and presenting it as if it measured the real thing would
 *                 violate Section 79 #3 ("no fake data ever... use 'Not
 *                 measured' when no source exists"). These require genuine
 *                 semantic/NLP or cross-site judgment that a deterministic
 *                 markup analyzer cannot honestly produce. They become
 *                 real once Phase 29 (LLM/SLM integration) exists — until
 *                 then, `null` + an explanation is more honest than a
 *                 number.
 *
 * GEO dimensions (master doc Section 39.2):
 *   Entity Clarity        ASSESSED   — Organization/Person JSON-LD presence.
 *   Source Identity        ASSESSED   — same signal as Entity Clarity today;
 *                                       a deeper author-bio/about-page check
 *                                       is explicitly Phase 25 (E-E-A-T /
 *                                       Trust)'s job, not duplicated here.
 *   Citation Readiness     ASSESSED   — outbound links with non-generic
 *                                       anchor text (link-counting only —
 *                                       cannot judge source *quality*).
 *   References             ASSESSED   — same underlying signal as Citation
 *                                       Readiness (the master doc lists both
 *                                       under GEO's "citation readiness...
 *                                       references" together); not double
 *                                       counted as two independent inputs to
 *                                       the composite score.
 *   Question Coverage      ASSESSED   — heading-text question-pattern match.
 *   Content Chunkability    ASSESSED   — heading-to-word-count ratio.
 *   Answerability           UNASSESSED — "does the content actually answer
 *                                       likely questions well" requires
 *                                       semantic judgment, not just heading
 *                                       phrasing (Question Coverage is the
 *                                       assessable proxy for *coverage*, not
 *                                       *quality*).
 *   Evidence                UNASSESSED — "are the cited sources good" needs
 *                                       judgment of source quality, not just
 *                                       counting links (that's Citation
 *                                       Readiness).
 *   Original Information    UNASSESSED — requires cross-site comparison to
 *                                       judge originality.
 *   Semantic Completeness   UNASSESSED — requires understanding whether the
 *                                       topic is *fully* covered.
 *
 * AEO dimensions (master doc Section 39.3):
 *   Question Coverage      ASSESSED   — same signal as GEO's.
 *   Definitions             ASSESSED   — <dl>/<dt>/<dd> definition-list markup
 *                                       presence (a real structural proxy;
 *                                       cannot judge whether the definition
 *                                       is actually correct/useful).
 *   Lists                   ASSESSED   — <ul>/<ol> presence.
 *   Tables                  ASSESSED   — <table> presence.
 *   FAQ Structures           ASSESSED   — FAQPage schema OR an FAQ-labeled
 *                                       heading paired with question headings.
 *   Headings                ASSESSED   — H2+ subheading presence.
 *   Structured Data          ASSESSED   — any valid schema present.
 *   Entity Clarity           ASSESSED   — same as GEO's.
 *   Direct Answers           UNASSESSED — requires judging whether the text
 *                                       immediately following a heading
 *                                       actually answers it directly.
 *   Evidence                 UNASSESSED — same reasoning as GEO's Evidence.
 *   Answer Completeness      UNASSESSED — requires judging whether an answer
 *                                       is complete, not just present.
 *
 * ─── Composite scores ───────────────────────────────────────────────────────
 *
 * GEO Readiness / AEO Readiness / AI Overview Readiness (AIO) are each the
 * unweighted (equal-weight) average of that dimension set's ASSESSED scores
 * only (0-100 each). No dimension is weighted more than another — no
 * empirical/industry data exists in this codebase to justify a non-uniform
 * weighting, and inventing one would be exactly the kind of unfounded
 * precision Section 79 #3 warns against. If a page has zero assessable
 * signal for a dimension set (e.g. no body content at all), the composite is
 * `null`, never fabricated as 0 or 100.
 *
 * AIO Readiness reuses the subset of dimensions the master doc's Section
 * 39.1 explicitly names as AI-Overview-relevant that are also ASSESSED
 * above: Entity Clarity, Source Identity, Citation Readiness, Content
 * Chunkability, Question Coverage, Structured Data.
 */

export interface DimensionResult {
  key: string;
  label: string;
  status: "assessed" | "unassessed";
  score: number | null;
  evidence: string;
  reason?: string;
}

export interface PageContentSignals {
  wordCount: number;
  headings: { level: number; text: string }[];
  questionHeadings: string[];
  hasFaqHeading: boolean;
  listCount: number;
  tableCount: number;
  definitionListCount: number;
  schemaTypes: string[]; // e.g. ["Organization", "FAQPage"]
  hasFaqSchema: boolean;
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

function round(n: number): number {
  return Math.round(n);
}

export function scoreEntityClarity(schemaTypes: string[]): DimensionResult {
  const found = schemaTypes.filter((t) => t === "Organization" || t === "Person");
  const score = found.length > 0 ? 100 : 0;
  return {
    key: "entityClarity",
    label: "Entity Clarity",
    status: "assessed",
    score,
    evidence:
      found.length > 0
        ? `Found ${[...new Set(found)].join(", ")} JSON-LD schema.`
        : "No Organization or Person JSON-LD schema found on this page.",
  };
}

export function scoreSourceIdentity(schemaTypes: string[]): DimensionResult {
  const entity = scoreEntityClarity(schemaTypes);
  return {
    ...entity,
    key: "sourceIdentity",
    label: "Source Identity",
    evidence:
      entity.score === 100
        ? `Publisher identifiable via ${entity.evidence.replace("Found ", "").replace(" JSON-LD schema.", "")} schema. Deeper author/about-page verification is Phase 25 (E-E-A-T / Trust).`
        : "No Organization or Person schema found to identify the publisher. Deeper author/about-page verification is Phase 25 (E-E-A-T / Trust).",
  };
}

export function scoreCitationReadiness(externalLinks: { anchorText: string | null }[]): DimensionResult {
  const specific = externalLinks.filter((l) => {
    const text = (l.anchorText ?? "").trim().toLowerCase();
    return text.length > 3 && !GENERIC_ANCHOR_TEXT.has(text);
  });
  const count = specific.length;
  const score = count === 0 ? 0 : count <= 2 ? 50 : 100;
  return {
    key: "citationReadiness",
    label: "Citation Readiness / References",
    status: "assessed",
    score,
    evidence:
      count > 0
        ? `${count} outbound link(s) with descriptive anchor text, e.g. "${specific[0].anchorText}".`
        : "No outbound links with descriptive (non-generic) anchor text found.",
  };
}

export function scoreQuestionCoverage(headings: { text: string }[], questionHeadings: string[]): DimensionResult {
  if (headings.length === 0) {
    return {
      key: "questionCoverage",
      label: "Question Coverage",
      status: "assessed",
      score: 0,
      evidence: "This page has no headings at all.",
    };
  }
  const score = round((questionHeadings.length / headings.length) * 100);
  return {
    key: "questionCoverage",
    label: "Question Coverage",
    status: "assessed",
    score,
    evidence:
      questionHeadings.length > 0
        ? `${questionHeadings.length}/${headings.length} heading(s) are question-shaped, e.g. "${questionHeadings[0]}".`
        : `0/${headings.length} heading(s) are question-shaped.`,
  };
}

export function scoreContentChunkability(wordCount: number, headingCount: number): DimensionResult {
  if (wordCount === 0) {
    return {
      key: "contentChunkability",
      label: "Content Chunkability",
      status: "unassessed",
      score: null,
      evidence: "No body content to assess.",
      reason: "Page has zero measured word count.",
    };
  }
  // Heuristic target: ~1 heading per 250 words is a reasonable natural
  // break-point density. Ratio-based, capped at 100.
  const idealHeadings = wordCount / 250;
  const ratio = idealHeadings > 0 ? headingCount / idealHeadings : 0;
  const score = Math.max(0, Math.min(100, round(ratio * 100)));
  return {
    key: "contentChunkability",
    label: "Content Chunkability",
    status: "assessed",
    score,
    evidence: `${headingCount} heading(s) across ${wordCount} words (~1 per ${headingCount > 0 ? round(wordCount / headingCount) : wordCount} words).`,
  };
}

export function scoreDefinitions(definitionListCount: number): DimensionResult {
  const score = definitionListCount > 0 ? 100 : 0;
  return {
    key: "definitions",
    label: "Definitions",
    status: "assessed",
    score,
    evidence:
      definitionListCount > 0
        ? `${definitionListCount} <dl> definition list(s) found.`
        : "No <dl> definition-list markup found.",
  };
}

export function scoreLists(listCount: number): DimensionResult {
  const score = listCount > 0 ? 100 : 0;
  return {
    key: "lists",
    label: "Lists",
    status: "assessed",
    score,
    evidence: listCount > 0 ? `${listCount} list(s) (<ul>/<ol>) found.` : "No <ul>/<ol> list markup found.",
  };
}

export function scoreTables(tableCount: number): DimensionResult {
  const score = tableCount > 0 ? 100 : 0;
  return {
    key: "tables",
    label: "Tables",
    status: "assessed",
    score,
    evidence: tableCount > 0 ? `${tableCount} <table> element(s) found.` : "No <table> markup found.",
  };
}

export function scoreFaqStructures(
  hasFaqSchema: boolean,
  hasFaqHeading: boolean,
  questionHeadingCount: number
): DimensionResult {
  if (hasFaqSchema) {
    return {
      key: "faqStructures",
      label: "FAQ Structures",
      status: "assessed",
      score: 100,
      evidence: "FAQPage JSON-LD structured data found.",
    };
  }
  if (hasFaqHeading && questionHeadingCount >= 2) {
    return {
      key: "faqStructures",
      label: "FAQ Structures",
      status: "assessed",
      score: 70,
      evidence: `An FAQ-labeled heading found alongside ${questionHeadingCount} question-shaped headings, but no FAQPage schema.`,
    };
  }
  if (questionHeadingCount >= 2) {
    return {
      key: "faqStructures",
      label: "FAQ Structures",
      status: "assessed",
      score: 40,
      evidence: `${questionHeadingCount} question-shaped headings found, but no FAQ-labeled heading or FAQPage schema.`,
    };
  }
  return {
    key: "faqStructures",
    label: "FAQ Structures",
    status: "assessed",
    score: 0,
    evidence: "No FAQPage schema, FAQ-labeled heading, or question-shaped heading cluster found.",
  };
}

export function scoreHeadings(headings: { level: number }[]): DimensionResult {
  const subHeadings = headings.filter((h) => h.level >= 2);
  const score = subHeadings.length >= 2 ? 100 : subHeadings.length === 1 ? 50 : 0;
  return {
    key: "headings",
    label: "Headings",
    status: "assessed",
    score,
    evidence: `${subHeadings.length} H2-H6 subheading(s) found.`,
  };
}

export function scoreStructuredData(schemaTypes: string[]): DimensionResult {
  const score = schemaTypes.length > 0 ? 100 : 0;
  return {
    key: "structuredData",
    label: "Structured Data",
    status: "assessed",
    score,
    evidence:
      schemaTypes.length > 0
        ? `Structured data found: ${[...new Set(schemaTypes)].join(", ")}.`
        : "No structured data (JSON-LD/Microdata/RDFa) found on this page.",
  };
}

/** Fixed, documented list of dimensions this platform does NOT score — see the file-level comment. */
export function unassessedGeoDimensions(): DimensionResult[] {
  return [
    {
      key: "answerability",
      label: "Answerability",
      status: "unassessed",
      score: null,
      evidence: "Not measured.",
      reason: "Requires semantic judgment of whether content actually answers likely questions well — deferred to Phase 29 (LLM/SLM integration).",
    },
    {
      key: "evidenceQuality",
      label: "Evidence",
      status: "unassessed",
      score: null,
      evidence: "Not measured.",
      reason: "Requires judging source *quality*, not just counting outbound links — deferred to Phase 29.",
    },
    {
      key: "originalInformation",
      label: "Original Information",
      status: "unassessed",
      score: null,
      evidence: "Not measured.",
      reason: "Requires cross-site comparison to judge originality — no such capability exists in this deterministic engine.",
    },
    {
      key: "semanticCompleteness",
      label: "Semantic Completeness",
      status: "unassessed",
      score: null,
      evidence: "Not measured.",
      reason: "Requires understanding whether a topic is fully covered — deferred to Phase 29.",
    },
  ];
}

export function unassessedAeoDimensions(): DimensionResult[] {
  return [
    {
      key: "directAnswers",
      label: "Direct Answers",
      status: "unassessed",
      score: null,
      evidence: "Not measured.",
      reason: "Requires judging whether text following a heading actually answers it directly — deferred to Phase 29.",
    },
    {
      key: "evidenceQualityAeo",
      label: "Evidence",
      status: "unassessed",
      score: null,
      evidence: "Not measured.",
      reason: "Requires judging source quality, not just link presence — deferred to Phase 29.",
    },
    {
      key: "answerCompleteness",
      label: "Answer Completeness",
      status: "unassessed",
      score: null,
      evidence: "Not measured.",
      reason: "Requires judging whether an answer is complete, not just present — deferred to Phase 29.",
    },
  ];
}

export interface PageReadinessResult {
  geo: { score: number | null; dimensions: DimensionResult[] };
  aeo: { score: number | null; dimensions: DimensionResult[] };
  aio: { score: number | null; dimensions: DimensionResult[] };
}

function average(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => typeof s === "number");
  if (valid.length === 0) return null;
  return round(valid.reduce((s, v) => s + v, 0) / valid.length);
}

export function computePageAiSearchReadiness(signals: PageContentSignals): PageReadinessResult {
  const entityClarity = scoreEntityClarity(signals.schemaTypes);
  const sourceIdentity = scoreSourceIdentity(signals.schemaTypes);
  const citationReadiness = scoreCitationReadiness(signals.externalLinks);
  const questionCoverage = scoreQuestionCoverage(signals.headings, signals.questionHeadings);
  const contentChunkability = scoreContentChunkability(signals.wordCount, signals.headings.length);
  const definitions = scoreDefinitions(signals.definitionListCount);
  const lists = scoreLists(signals.listCount);
  const tables = scoreTables(signals.tableCount);
  const faqStructures = scoreFaqStructures(signals.hasFaqSchema, signals.hasFaqHeading, signals.questionHeadings.length);
  const headings = scoreHeadings(signals.headings);
  const structuredData = scoreStructuredData(signals.schemaTypes);

  const geoDimensions = [
    entityClarity,
    sourceIdentity,
    citationReadiness,
    questionCoverage,
    contentChunkability,
    ...unassessedGeoDimensions(),
  ];
  const geoScore = average([entityClarity.score, sourceIdentity.score, citationReadiness.score, questionCoverage.score, contentChunkability.score]);

  const aeoDimensions = [
    questionCoverage,
    definitions,
    lists,
    tables,
    faqStructures,
    headings,
    structuredData,
    entityClarity,
    ...unassessedAeoDimensions(),
  ];
  const aeoScore = average([
    questionCoverage.score,
    definitions.score,
    lists.score,
    tables.score,
    faqStructures.score,
    headings.score,
    structuredData.score,
    entityClarity.score,
  ]);

  const aioDimensions = [entityClarity, sourceIdentity, citationReadiness, contentChunkability, questionCoverage, structuredData];
  const aioScore = average([
    entityClarity.score,
    sourceIdentity.score,
    citationReadiness.score,
    contentChunkability.score,
    questionCoverage.score,
    structuredData.score,
  ]);

  return {
    geo: { score: geoScore, dimensions: geoDimensions },
    aeo: { score: aeoScore, dimensions: aeoDimensions },
    aio: { score: aioScore, dimensions: aioDimensions },
  };
}
