/**
 * Central AI/LLM crawler registry (Phase 19).
 *
 * Same "single catalog" philosophy as the RBAC feature catalog
 * (`src/lib/rbac/feature-catalog.ts`, Phase 14) and the llms.txt rule
 * registry (Phase 18): one typed source of truth instead of scattering
 * crawler names/user-agent strings across the codebase. `robots.ts`'s
 * Phase 13 "does a dedicated AI-crawler group exist" check and this
 * phase's full Allowed/Blocked/Partial/Unknown verdict both read from here.
 *
 * Crawler names, behavior, and policies can change at any time (Section
 * 42) — this list is a best-effort snapshot, not a live/verified feed, and
 * is not fetched from any paid API (Section 79: zero paid APIs).
 *
 * `purposeConfidence`:
 *  - "verified": the operator publishes an explicit, unambiguous statement
 *    of what this specific user-agent is for (a docs page is linked).
 *  - "best_effort": the purpose description is this platform's own
 *    best-effort characterization (from public reporting, general
 *    knowledge, or an operator's docs that are broad/ambiguous about the
 *    exact token) and has not been independently verified against a single
 *    authoritative source. Per Section 79 ("never fabricate or guarantee"),
 *    this distinction is surfaced in the UI/evidence text, not hidden.
 */

export type AiCrawlerPurposeConfidence = "verified" | "best_effort";

export interface AiCrawlerRegistryEntry {
  /** Display name, as commonly written by the operator. */
  name: string;
  /** Lowercase user-agent token as it appears in a robots.txt `User-agent:` line. */
  userAgent: string;
  /** Company/organization that operates this crawler. */
  provider: string;
  /** Best-effort or verified summary of what this crawler is used for. */
  purpose: string;
  purposeConfidence: AiCrawlerPurposeConfidence;
  /** Operator documentation URL, when one is known to exist. Never fabricated — `null` if unsure. */
  documentationUrl: string | null;
}

export const AI_CRAWLER_REGISTRY: AiCrawlerRegistryEntry[] = [
  {
    name: "GPTBot",
    userAgent: "gptbot",
    provider: "OpenAI",
    purpose: "Crawls web content to help train OpenAI's models.",
    purposeConfidence: "verified",
    documentationUrl: "https://platform.openai.com/docs/gptbot",
  },
  {
    name: "ChatGPT-User",
    userAgent: "chatgpt-user",
    provider: "OpenAI",
    purpose: "Fetches a page on behalf of a user action inside ChatGPT (e.g. browsing or a plugin/action), not for bulk training.",
    purposeConfidence: "verified",
    documentationUrl: "https://platform.openai.com/docs/bots",
  },
  {
    name: "OAI-SearchBot",
    userAgent: "oai-searchbot",
    provider: "OpenAI",
    purpose: "Crawls content that may be surfaced in ChatGPT's search/answer results.",
    purposeConfidence: "verified",
    documentationUrl: "https://platform.openai.com/docs/bots",
  },
  {
    name: "ClaudeBot",
    userAgent: "claudebot",
    provider: "Anthropic",
    purpose: "General-purpose crawling, including for model training and improvement — best-effort classification; Anthropic's own docs describe this at a general level rather than a single narrow purpose.",
    purposeConfidence: "best_effort",
    documentationUrl:
      "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  },
  {
    name: "anthropic-ai",
    userAgent: "anthropic-ai",
    provider: "Anthropic",
    purpose: "Used for AI-related data collection — best-effort classification, kept distinct from ClaudeBot since it is a separate token some sites configure separately.",
    purposeConfidence: "best_effort",
    documentationUrl:
      "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  },
  {
    name: "Claude-Web",
    userAgent: "claude-web",
    provider: "Anthropic",
    purpose: "User-triggered fetch when Claude retrieves a specific page requested in a conversation, not bulk crawling — best-effort classification.",
    purposeConfidence: "best_effort",
    documentationUrl:
      "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  },
  {
    name: "Google-Extended",
    userAgent: "google-extended",
    provider: "Google",
    purpose: "Controls whether this site's content may be used to train Gemini and Vertex AI generative models. Explicitly does not affect Google Search indexing/ranking.",
    purposeConfidence: "verified",
    documentationUrl: "https://developers.google.com/search/docs/crawling-indexing/google-extended",
  },
  {
    name: "GoogleOther",
    userAgent: "googleother",
    provider: "Google",
    purpose: "Used by various internal Google product teams for miscellaneous fetches; Google does not publish one single canonical purpose for this token — best-effort classification.",
    purposeConfidence: "best_effort",
    documentationUrl: "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
  },
  {
    name: "PerplexityBot",
    userAgent: "perplexitybot",
    provider: "Perplexity",
    purpose: "Crawls and indexes content that may be surfaced as an answer/citation in Perplexity's search product.",
    purposeConfidence: "best_effort",
    documentationUrl: "https://docs.perplexity.ai/guides/bots",
  },
  {
    name: "Bytespider",
    userAgent: "bytespider",
    provider: "ByteDance",
    purpose: "Unverified/best-effort — believed to be used for content collection, possibly including AI training data; ByteDance does not publish detailed public documentation for this crawler.",
    purposeConfidence: "best_effort",
    documentationUrl: null,
  },
  {
    name: "Amazonbot",
    userAgent: "amazonbot",
    provider: "Amazon",
    purpose: "Used to improve Amazon products and services (including Alexa); the precise scope of AI-model use is not fully documented — best-effort classification.",
    purposeConfidence: "best_effort",
    documentationUrl: "https://developer.amazon.com/amazonbot",
  },
  {
    name: "Applebot-Extended",
    userAgent: "applebot-extended",
    provider: "Apple",
    purpose: "Controls whether this site's content may be used to train Apple's generative AI models (e.g. Apple Intelligence). Separate from the base Applebot used for Siri/Spotlight search indexing.",
    purposeConfidence: "verified",
    documentationUrl: "https://support.apple.com/en-us/119829",
  },
  {
    name: "CCBot",
    userAgent: "ccbot",
    provider: "Common Crawl Foundation",
    purpose: "Builds the open, publicly downloadable Common Crawl web archive. Not operated by an AI company directly, but the dataset it produces is widely used by third parties (including AI labs) as training data.",
    purposeConfidence: "verified",
    documentationUrl: "https://commoncrawl.org/ccbot",
  },
];

/** Lowercase user-agent token -> display name, derived from the registry above (used by `robots.ts`'s Phase 13 dedicated-group detection). */
export const KNOWN_AI_CRAWLER_NAMES_BY_TOKEN: Record<string, string> = Object.fromEntries(
  AI_CRAWLER_REGISTRY.map((c) => [c.userAgent, c.name])
);
