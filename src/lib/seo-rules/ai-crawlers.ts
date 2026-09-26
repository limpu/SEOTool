import type { RuleViolation } from "./on-page";
import type { RobotsRules } from "@/lib/crawler/robots";
import { analyzeAiCrawlerAccess } from "@/lib/crawler/ai-crawler-analysis";

/**
 * Evaluates the full per-crawler Allowed/Blocked/Partial/Unknown verdict
 * (Phase 19, Section 43) into site-level issues. Only called when
 * robots.txt was actually found (same gate `run-crawl.ts` already applies
 * to `evaluateRobotsIssues`) — with no robots.txt, every crawler's verdict
 * is "unknown" by definition and there is no directive to cite, so nothing
 * useful to flag as an issue.
 */
export function evaluateAiCrawlerIssues(rules: RobotsRules): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const verdicts = analyzeAiCrawlerAccess(rules);

  const blocked = verdicts.filter((v) => v.status === "blocked");
  const partial = verdicts.filter((v) => v.status === "partial");

  if (blocked.length > 0) {
    violations.push({
      ruleKey: "AI_CRAWLER_BLOCKED",
      evidence: `${blocked.length} known AI crawler(s) are fully blocked by robots.txt: ${blocked
        .map((v) => v.name)
        .join(", ")}.`,
    });
  }

  if (partial.length > 0) {
    violations.push({
      ruleKey: "AI_CRAWLER_PARTIALLY_BLOCKED",
      evidence: `${partial.length} known AI crawler(s) have some paths disallowed by robots.txt: ${partial
        .map((v) => v.name)
        .join(", ")}.`,
    });
  }

  return violations;
}
