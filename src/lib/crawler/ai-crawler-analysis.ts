import type { Rule, RobotsGroup, RobotsRules } from "./robots";
import { isPathAllowedForRules, getMatchingRule } from "./robots";
import { AI_CRAWLER_REGISTRY, type AiCrawlerRegistryEntry } from "./ai-crawler-registry";

export type AiCrawlerStatus = "allowed" | "blocked" | "partial" | "unknown";
export type AiCrawlerMatchedGroup = "dedicated" | "wildcard" | "none";

export interface AiCrawlerVerdict extends AiCrawlerRegistryEntry {
  status: AiCrawlerStatus;
  /** Which User-agent group in robots.txt the verdict was computed against. */
  matchedGroup: AiCrawlerMatchedGroup;
  /** Human-readable citation of the exact directive(s) responsible (Section 43: "always show the exact robots directive responsible"). */
  evidence: string;
}

const PROBE_PATH = "/__ai_crawler_probe_path_unlikely_to_exist_12345__";

/**
 * Computes the Allowed/Blocked/Partial/Unknown verdict for one registry
 * crawler against a site's parsed robots.txt (Phase 19, Section 43).
 *
 * Reuses Phase 6/13's existing path-matching algorithm
 * (`isPathAllowedForRules`/`getMatchingRule`) rather than reimplementing
 * it — the only new logic here is *which* rule set applies to a given
 * crawler (its own dedicated group if one exists, else the wildcard
 * group) and how to summarize that ruleset's effect as one of four
 * verdicts.
 *
 * A missing robots.txt is reported as "unknown" rather than "allowed",
 * per the explicit instruction not to default a missing file to either
 * Allowed or Blocked — even though the standard robots.txt convention
 * (already relied on elsewhere in this codebase, e.g. `fetchRobotsRules`)
 * is that no robots.txt means crawling is currently unrestricted. That
 * default-allow convention is stated in the evidence text so it isn't
 * lost, but the status itself stays "unknown" since it was never actually
 * confirmed against a real directive.
 */
export function computeAiCrawlerVerdict(rules: RobotsRules, crawler: AiCrawlerRegistryEntry): AiCrawlerVerdict {
  if (!rules.found) {
    return {
      ...crawler,
      status: "unknown",
      matchedGroup: "none",
      evidence:
        "No robots.txt file was found for this site. By robots.txt convention, an absent file means crawling is currently unrestricted by default, but this could not be confirmed against an explicit directive.",
    };
  }

  const groups: RobotsGroup[] = rules.rawGroups ?? [];
  const dedicated = groups.find((g) => g.agents.includes(crawler.userAgent));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const group = dedicated ?? wildcard;
  const matchedGroup: AiCrawlerMatchedGroup = dedicated ? "dedicated" : wildcard ? "wildcard" : "none";
  const ruleList: Rule[] = group?.rules ?? [];

  if (ruleList.length === 0) {
    return {
      ...crawler,
      status: "allowed",
      matchedGroup,
      evidence:
        matchedGroup === "none"
          ? "robots.txt has no User-agent group that applies to this crawler; no directive restricts it, so it is currently allowed by default."
          : `The matched User-agent group (${matchedGroup}) defines no Allow/Disallow rules, so this crawler is currently allowed by default.`,
    };
  }

  const disallowRules = ruleList.filter((r) => !r.allow);
  const allowRules = ruleList.filter((r) => r.allow);
  const homeAllowed = isPathAllowedForRules(ruleList, "/");
  const probeAllowed = isPathAllowedForRules(ruleList, PROBE_PATH);

  if (disallowRules.length === 0) {
    return {
      ...crawler,
      status: "allowed",
      matchedGroup,
      evidence: `The matched User-agent group (${matchedGroup}) only defines Allow rules (or none that restrict crawling); this crawler is currently allowed.`,
    };
  }

  // "Blocked" is reserved for a pure Disallow ruleset (no Allow carve-out at
  // all) that also blocks both the homepage and an arbitrary unrelated
  // path. A broad "Disallow: /" paired with even one Allow rule (e.g. BBC's
  // real robots.txt: "Disallow: / / Allow: /storyworks" for GPTBot) is a
  // deliberate partial carve-out, not a full block — checking only home+
  // probe would misclassify that case as "blocked" and hide the exception,
  // so the presence of any Allow rule always forces "partial" instead.
  if (!homeAllowed && !probeAllowed && allowRules.length === 0) {
    const homeRule = getMatchingRule(ruleList, "/");
    return {
      ...crawler,
      status: "blocked",
      matchedGroup,
      evidence: homeRule
        ? `Disallow: ${homeRule.path} in the ${matchedGroup} User-agent group currently blocks this crawler from the entire site.`
        : `The ${matchedGroup} User-agent group's Disallow rules currently block this crawler from the entire site.`,
    };
  }

  return {
    ...crawler,
    status: "partial",
    matchedGroup,
    evidence: `The ${matchedGroup} User-agent group currently disallows some paths for this crawler (${disallowRules
      .map((r) => `Disallow: ${r.path}`)
      .join(", ")})${allowRules.length > 0 ? ` with specific Allow exception(s) (${allowRules.map((r) => `Allow: ${r.path}`).join(", ")})` : ""} while other paths remain allowed.`,
  };
}

/** Computes the verdict for every crawler in the central registry against one site's robots.txt. */
export function analyzeAiCrawlerAccess(rules: RobotsRules): AiCrawlerVerdict[] {
  return AI_CRAWLER_REGISTRY.map((crawler) => computeAiCrawlerVerdict(rules, crawler));
}
