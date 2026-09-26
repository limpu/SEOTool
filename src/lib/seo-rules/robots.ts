import type { RobotsRules } from "@/lib/crawler/robots";
import { isPathAllowed } from "@/lib/crawler/robots";
import type { RuleViolation } from "./on-page";

const RESOURCE_PATTERNS = [/\.(css|js)(\?|$)/i, /\/css\//i, /\/js\//i, /\/assets\//i, /\/static\//i, /\/scripts\//i, /\/styles\//i];

/**
 * Evaluates robots.txt-level issues (Phase 13): syntax problems, whole-site
 * or homepage blocking, blocked render-critical resources, and the
 * presence of custom AI-crawler-specific rules. Per-crawler allowed/
 * blocked/partial/unknown resolution is Phase 15's dedicated job — this
 * only notes *that* custom AI crawler rules exist, not what they mean.
 */
export function evaluateRobotsIssues(rules: RobotsRules): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (rules.syntaxWarnings.length > 0) {
    violations.push({
      ruleKey: "ROBOTS_SYNTAX_ERROR",
      evidence: `${rules.syntaxWarnings.length} issue(s), e.g. "${rules.syntaxWarnings[0]}"`,
    });
  }

  const homeBlocked = !isPathAllowed(rules, "/");
  const probeBlocked = !isPathAllowed(rules, "/__probe_path_unlikely_to_exist_12345__");

  if (homeBlocked && probeBlocked) {
    violations.push({
      ruleKey: "ROBOTS_DISALLOW_ALL",
      evidence: "The effective rules disallow both the homepage and an arbitrary unrelated path.",
    });
  } else if (homeBlocked) {
    violations.push({
      ruleKey: "ROBOTS_HOMEPAGE_BLOCKED",
      evidence: 'The path "/" is disallowed under the effective rules.',
    });
  }

  const blockedResourceRules = rules.rules.filter(
    (r) => !r.allow && RESOURCE_PATTERNS.some((pattern) => pattern.test(r.path))
  );
  if (blockedResourceRules.length > 0) {
    violations.push({
      ruleKey: "ROBOTS_RESOURCE_BLOCKED",
      evidence: `Disallow rule(s) look like they block CSS/JS resources: ${blockedResourceRules
        .map((r) => r.path)
        .join(", ")}`,
    });
  }

  if (rules.aiCrawlerGroups.length > 0) {
    violations.push({
      ruleKey: "ROBOTS_AI_CRAWLER_CUSTOM_RULES",
      evidence: `Dedicated rules found for: ${rules.aiCrawlerGroups.join(", ")}`,
    });
  }

  return violations;
}
