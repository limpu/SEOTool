import type { RuleDefinition } from "./rules-registry";

/**
 * AI Search Intelligence rules (Phase 24 — GEO/AEO readiness). Every rule
 * here flags a genuine, deterministically-detected *optimization
 * opportunity* for AI/answer-engine consumption, never a defect and never a
 * guarantee of AI Overview/ChatGPT/Perplexity inclusion (master doc Section
 * 79 #3/#4/#5). All `info` severity per that same discipline — these are the
 * same category of "emerging convention, not a ranking requirement" as
 * Phase 18's `LLMS_TXT_MISSING`, not correctness errors.
 */
export const AI_SEARCH_RULES: RuleDefinition[] = [
  {
    ruleKey: "GEO_NO_ENTITY_SCHEMA",
    category: "geo",
    severity: "info",
    title: "No Organization or Person entity schema found on the site",
    description:
      "None of the crawled pages publish Organization or Person JSON-LD structured data, so AI systems have no explicit, machine-readable signal of who publishes this content.",
    recommendation:
      "Add Organization (or Person, for individual authors/creators) JSON-LD schema, typically on the homepage and/or an About page, naming the publisher explicitly.",
    fixExample: '{"@context":"https://schema.org","@type":"Organization","name":"Example Inc.","url":"https://example.com"}',
    impact:
      "Entity clarity is a readiness signal for generative engines (GEO) — it does not guarantee AI citation or visibility.",
  },
  {
    ruleKey: "AEO_NO_HEADING_QUESTIONS",
    category: "aeo",
    severity: "info",
    title: "No question-shaped headings found",
    description:
      "This page's headings do not contain any question-shaped phrasing (e.g. \"What is...\", \"How does...\", or a heading ending in \"?\").",
    recommendation:
      "Where natural, phrase some headings as the actual questions readers (and AI answer engines) are likely to ask, followed by a direct answer.",
    fixExample: "<h2>What is generative engine optimization?</h2>",
    impact:
      "Question-shaped headings are a readiness signal for answer-engine optimization (AEO) — they do not guarantee inclusion in AI-generated answers.",
  },
  {
    ruleKey: "AEO_NO_FAQ_STRUCTURE",
    category: "aeo",
    severity: "info",
    title: "No FAQ structure detected",
    description:
      "This page has neither FAQPage structured data nor an FAQ-style heading (e.g. \"Frequently Asked Questions\") paired with question-shaped headings.",
    recommendation:
      "Where the content naturally supports it, add an FAQ section (with matching FAQPage JSON-LD) covering common reader questions.",
    impact:
      "FAQ structure is a readiness signal, not a guarantee of appearing in an AI-generated answer or featured snippet (master doc Section 39.3).",
  },
  {
    ruleKey: "GEO_NO_CITATION_LINKS",
    category: "geo",
    severity: "info",
    title: "No externally-cited, specifically-labeled sources found",
    description:
      "This page has no outbound links to other domains with descriptive (non-generic) anchor text — a common signal of content that cites or references external sources.",
    recommendation:
      'Where claims rely on external data or sources, link to them with descriptive anchor text (not "click here" or the raw URL).',
    impact:
      "Citation readiness is a GEO readiness signal about how citable the content appears to be — link presence alone cannot verify source quality or guarantee AI citation.",
  },
  {
    ruleKey: "AEO_NO_LISTS_OR_TABLES",
    category: "aeo",
    severity: "info",
    title: "No lists or tables found on a substantial content page",
    description:
      "This page has a meaningful amount of body text but contains no <ul>/<ol> lists or <table> elements — structures that make content easier to extract and chunk for AI consumption.",
    recommendation:
      "Where the content is naturally list-like or comparative (steps, specifications, pros/cons, pricing tiers), format it as an actual HTML list or table rather than prose only.",
    impact: "Structured lists/tables are a content-chunkability readiness signal, not a ranking guarantee.",
  },
  {
    ruleKey: "AEO_NO_STRUCTURED_DATA",
    category: "aeo",
    severity: "info",
    title: "No structured data found on a substantial content page",
    description:
      "This page has a meaningful amount of body text but no JSON-LD, Microdata, or RDFa structured data of any type.",
    recommendation:
      "Add structured data appropriate to this page's content type (Article, Product, FAQPage, HowTo, etc.) to give AI systems and search engines explicit machine-readable context.",
    impact: "Structured data is a readiness signal for both traditional rich results and AI answer engines, not a guarantee of either.",
  },
  {
    ruleKey: "GEO_LOW_CONTENT_CHUNKABILITY",
    category: "geo",
    severity: "info",
    title: "Low content chunkability (too few heading break-points for the content length)",
    description:
      "This page's ratio of headings to body-text length is low, meaning the content offers few natural break points for an AI system to extract a self-contained passage from.",
    recommendation:
      "Break long sections of prose into more sub-headings (H2/H3) so each covers one self-contained idea — roughly one heading per 150-300 words is a reasonable starting point.",
    impact: "Content chunkability is a structural readiness heuristic, not a semantic judgment of content quality.",
  },
];

export const AI_SEARCH_RULES_BY_KEY = new Map(AI_SEARCH_RULES.map((r) => [r.ruleKey, r]));
