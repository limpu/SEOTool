import type { RuleDefinition } from "./rules-registry";

/** Robots.txt rules (Phase 13). Full per-crawler allowed/blocked/partial/unknown reporting is Phase 15's dedicated job. */
export const ROBOTS_RULES: RuleDefinition[] = [
  {
    ruleKey: "ROBOTS_SYNTAX_ERROR",
    category: "technical",
    severity: "low",
    title: "robots.txt syntax problem",
    description: "robots.txt contains a line that doesn't parse as a valid directive.",
    recommendation: "Review the flagged line(s) and correct the directive syntax.",
    impact: "Malformed lines are typically ignored by crawlers, which may not match the site owner's intent.",
  },
  {
    ruleKey: "ROBOTS_DISALLOW_ALL",
    category: "technical",
    severity: "critical",
    title: "robots.txt blocks the entire site",
    description: 'The effective rules for general crawlers include "Disallow: /" with no overriding Allow.',
    recommendation: "Confirm this is intentional — this blocks the whole site from being crawled.",
    impact: "A site-wide disallow prevents indexing of every page on the site.",
  },
  {
    ruleKey: "ROBOTS_HOMEPAGE_BLOCKED",
    category: "technical",
    severity: "critical",
    title: "robots.txt blocks the homepage",
    description: "The site's homepage path is disallowed under the effective robots.txt rules.",
    recommendation: "Remove or narrow the Disallow rule that blocks the homepage.",
    impact: "A blocked homepage severely limits discovery and indexing of the whole site.",
  },
  {
    ruleKey: "ROBOTS_RESOURCE_BLOCKED",
    category: "technical",
    severity: "medium",
    title: "robots.txt blocks CSS/JS resources",
    description: "robots.txt disallows paths that look like CSS/JS/asset resources needed to render the page.",
    recommendation: "Allow crawlers to fetch CSS/JS resources so pages can be rendered correctly.",
    impact: "Blocking render-critical resources can cause search engines to see a broken or incomplete page.",
  },
  {
    ruleKey: "ROBOTS_AI_CRAWLER_CUSTOM_RULES",
    category: "technical",
    severity: "info",
    title: "robots.txt has custom rules for named AI crawlers",
    description: "robots.txt defines a dedicated User-agent group for one or more specific AI crawlers.",
    recommendation: "Confirm the per-crawler rules match your intended AI-crawling policy.",
    impact: "Custom AI crawler rules mean this site's AI-search visibility may differ by crawler — worth reviewing deliberately, not left to defaults.",
  },
];

export const ROBOTS_RULES_BY_KEY = new Map(ROBOTS_RULES.map((r) => [r.ruleKey, r]));
