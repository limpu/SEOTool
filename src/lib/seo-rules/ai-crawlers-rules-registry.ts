import type { RuleDefinition } from "./rules-registry";

/**
 * AI crawler verdict rules (Phase 19). These are deliberately `info`
 * severity, mirroring Phase 13's `ROBOTS_AI_CRAWLER_CUSTOM_RULES` — blocking
 * an AI crawler can be an entirely intentional site-owner decision (e.g. to
 * opt out of AI training), so this is a signal to review, not a defect.
 * Per Section 79 and the master doc's Section 43 instruction, wording is
 * careful to describe what robots.txt currently *permits/disallows*, never
 * to claim/imply that this determines whether the crawler will actually
 * visit the site or use its content.
 */
export const AI_CRAWLER_RULES: RuleDefinition[] = [
  {
    ruleKey: "AI_CRAWLER_BLOCKED",
    category: "technical",
    severity: "info",
    title: "robots.txt fully blocks one or more known AI crawlers",
    description: "One or more known AI/LLM crawlers are fully disallowed by the effective robots.txt rules.",
    recommendation:
      "Confirm this matches your intended AI-crawling policy. If unintentional, adjust the relevant User-agent group's Disallow rules.",
    impact:
      "robots.txt currently disallows these crawlers from this site. This may be a deliberate choice and does not by itself guarantee the crawler won't fetch content some other way.",
  },
  {
    ruleKey: "AI_CRAWLER_PARTIALLY_BLOCKED",
    category: "technical",
    severity: "info",
    title: "robots.txt partially blocks one or more known AI crawlers",
    description: "One or more known AI/LLM crawlers are allowed on some paths and disallowed on others by the effective robots.txt rules.",
    recommendation: "Review the specific Disallow paths for these crawlers to confirm the split matches your intent.",
    impact:
      "robots.txt currently permits these crawlers on part of the site and disallows them elsewhere — worth a deliberate review rather than leaving it to whatever the rules happen to produce.",
  },
];

export const AI_CRAWLER_RULES_BY_KEY = new Map(AI_CRAWLER_RULES.map((r) => [r.ruleKey, r]));
