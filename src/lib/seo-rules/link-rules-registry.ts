import type { RuleDefinition } from "./rules-registry";

/**
 * Link Analysis rules (Phase 9). Deliberately does not re-flag orphan
 * pages — Phase 8's TECH_ORPHAN_PAGE already covers that exact signal
 * (Section 27 lists it as part of "Internal Linking" too, but it was
 * implemented once, in Phase 8, and is reused here rather than duplicated).
 */
export const LINK_RULES: RuleDefinition[] = [
  {
    ruleKey: "LINK_BROKEN_INTERNAL",
    category: "technical",
    severity: "high",
    title: "Broken internal link",
    description: "An internal link on this page points to a URL that returns an error status.",
    recommendation: "Fix the link's destination or remove the link.",
    impact: "Broken internal links waste crawl budget and disrupt navigation.",
  },
  {
    ruleKey: "LINK_BROKEN_EXTERNAL",
    category: "technical",
    severity: "medium",
    title: "Broken external link",
    description: "An external link on this page points to a URL that returns an error status.",
    recommendation: "Update or remove the link to the external resource.",
    impact: "Broken outbound links create a poor user experience, though the target site is outside your control.",
  },
  {
    ruleKey: "LINK_REDIRECT_INTERNAL",
    category: "technical",
    severity: "medium",
    title: "Internal link points to a redirecting URL",
    description: "An internal link's destination redirects rather than returning the final content directly.",
    recommendation: "Update the link to point directly at the final destination URL.",
    impact: "Linking through a redirect adds latency and slightly dilutes link equity.",
  },
  {
    ruleKey: "LINK_REDIRECT_EXTERNAL",
    category: "technical",
    severity: "info",
    title: "External link points to a redirecting URL",
    description: "An external link's destination redirects rather than returning the final content directly.",
    recommendation: "Consider updating the link to point directly at the final destination URL.",
    impact: "Linking through a redirect adds a small amount of latency for users following the link.",
  },
  {
    ruleKey: "LINK_WEAK_ANCHOR_TEXT",
    category: "on_page",
    severity: "low",
    title: "Weak anchor text",
    description: 'The link uses generic anchor text (e.g. "click here", "read more") that doesn\'t describe its destination.',
    recommendation: "Use descriptive anchor text that indicates what the linked page is about.",
    impact: "Descriptive anchor text helps both users and search engines understand linked content.",
  },
];

export const LINK_RULES_BY_KEY = new Map(LINK_RULES.map((r) => [r.ruleKey, r]));
