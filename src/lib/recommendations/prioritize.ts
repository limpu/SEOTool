/**
 * Phase 23 — Recommendation Engine (pure, deterministic, no I/O).
 *
 * Scoping decision (see read.md Phase 23 write-up for full reasoning):
 * every `seo_rules` row already carries static `recommendation` /
 * `fixExample` / `impact` text (Phase 7's Rule Model, Section 14 of the
 * master doc) — that text is *reused* here, never regenerated. Phase 23's
 * actual job is turning a flat, unprioritized list of `seo_issues` rows
 * (one row per rule-violation per page) into a ranked, deduplicated action
 * plan: one recommendation entry per distinct rule, aggregated across every
 * page it fires on, sorted into Critical/High/Medium/Low/Info tiers.
 *
 * No AI model is called anywhere in this module. Per Section 79 #2
 * ("Deterministic first, AI second") and #3 ("no fake data"), and because
 * this project's LLM/SLM integration is explicitly a later phase (Phase 29,
 * not yet built), Phase 23 does not generate any new recommendation TEXT —
 * it aggregates and ranks the deterministic rule metadata that already
 * exists. A future AI-integration phase may add rewritten/summarized
 * copy on top of this, but must not silently replace the underlying
 * deterministic evidence (rule key, affected pages, evidence strings).
 *
 * ─── Prioritization algorithm ──────────────────────────────────────────────
 *
 * 1. Group every `seo_issues` row by `rule_key` (via its `seo_rules` row).
 * 2. Within a group, compute `affectedPageCount` = the number of DISTINCT
 *    pages that rule fired on (an issue firing twice on the same page, if
 *    that were ever possible, must not double-count breadth).
 * 3. Primary sort key: severity tier, using the exact critical > high >
 *    medium > low > info ordering Phase 22's `formula.ts` already
 *    establishes as this codebase's severity vocabulary (`SEVERITY_ORDER`,
 *    reused here, not redefined) — an issue's own rule-level severity is
 *    authoritative (all instances of one rule share one severity, since
 *    severity is a property of the rule, not of an individual violation).
 * 4. Secondary sort key, WITHIN a severity tier: breadth. An issue affecting
 *    40 pages is a bigger, more valuable fix than the same-severity issue
 *    affecting 1 page (fixing the site-wide template problem once resolves
 *    40 issues; fixing the one-off problem resolves 1) — so entries are
 *    ordered by `affectedPageCount` descending.
 * 5. Tie-break: `ruleKey` ascending, for fully deterministic, reproducible
 *    output (two rules with identical severity and identical page count
 *    must always render in the same order, not depend on DB row order).
 *
 * Effort/quick-win estimation was considered (per the task's explicit
 * instruction to check for a real signal before adding one) and rejected:
 * `fixExample`/`impact` are free-text strings with no structured
 * quick-win/large-effort signal anywhere in the `seo_rules` schema or the
 * rule registries. Fabricating an effort score with no backing data would
 * violate Section 79 #3 ("no fake data ... every metric must show its
 * source"), so no effort dimension is included.
 */

import { SEVERITY_ORDER, type Severity } from "@/lib/scoring/formula";

export interface RecommendationRuleMeta {
  ruleKey: string;
  category: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string | null;
  fixExample: string | null;
  impact: string | null;
}

export interface RecommendationIssueInstance {
  ruleKey: string;
  pageId: string;
  pageUrl: string;
  evidence: string | null;
}

export interface AffectedPage {
  pageId: string;
  url: string;
  evidence: string | null;
}

export interface RecommendationEntry {
  ruleKey: string;
  category: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string | null;
  fixExample: string | null;
  impact: string | null;
  affectedPageCount: number;
  affectedPages: AffectedPage[];
}

export type RecommendationTier = "critical" | "high" | "medium" | "low" | "info";

export type TieredRecommendations = Record<RecommendationTier, RecommendationEntry[]> & {
  totalRules: number;
  totalAffectedPageInstances: number;
};

const SEVERITY_RANK: Record<Severity, number> = Object.fromEntries(
  SEVERITY_ORDER.map((sev, idx) => [sev, idx]),
) as Record<Severity, number>;

/**
 * Groups issue instances by rule, joins in each rule's static metadata, and
 * returns a fully ranked Critical/High/Medium/Low/Info structure. Rules with
 * zero matching instances are omitted (nothing to recommend fixing).
 */
export function buildRecommendations(
  rules: RecommendationRuleMeta[],
  instances: RecommendationIssueInstance[],
): TieredRecommendations {
  const ruleByKey = new Map(rules.map((r) => [r.ruleKey, r]));

  // ruleKey -> pageId -> AffectedPage (Map dedupes repeat instances on the
  // same page so affectedPageCount reflects distinct pages, not raw rows).
  const grouped = new Map<string, Map<string, AffectedPage>>();
  for (const instance of instances) {
    const rule = ruleByKey.get(instance.ruleKey);
    if (!rule) continue; // orphaned instance with no known rule metadata — skip rather than guess

    let pageMap = grouped.get(instance.ruleKey);
    if (!pageMap) {
      pageMap = new Map();
      grouped.set(instance.ruleKey, pageMap);
    }
    if (!pageMap.has(instance.pageId)) {
      pageMap.set(instance.pageId, {
        pageId: instance.pageId,
        url: instance.pageUrl,
        evidence: instance.evidence,
      });
    }
  }

  const entries: RecommendationEntry[] = [];
  for (const [ruleKey, pageMap] of grouped) {
    const rule = ruleByKey.get(ruleKey)!;
    const affectedPages = Array.from(pageMap.values()).sort((a, b) => a.url.localeCompare(b.url));
    entries.push({
      ruleKey: rule.ruleKey,
      category: rule.category,
      severity: rule.severity,
      title: rule.title,
      description: rule.description,
      recommendation: rule.recommendation,
      fixExample: rule.fixExample,
      impact: rule.impact,
      affectedPageCount: affectedPages.length,
      affectedPages,
    });
  }

  entries.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const breadthDiff = b.affectedPageCount - a.affectedPageCount;
    if (breadthDiff !== 0) return breadthDiff;
    return a.ruleKey.localeCompare(b.ruleKey);
  });

  const tiers: Record<RecommendationTier, RecommendationEntry[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: [],
  };
  let totalAffectedPageInstances = 0;
  for (const entry of entries) {
    tiers[entry.severity].push(entry);
    totalAffectedPageInstances += entry.affectedPageCount;
  }

  return {
    ...tiers,
    totalRules: entries.length,
    totalAffectedPageInstances,
  };
}
