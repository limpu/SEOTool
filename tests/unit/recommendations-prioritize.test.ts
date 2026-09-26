import { describe, it, expect } from "vitest";
import { buildRecommendations, type RecommendationRuleMeta, type RecommendationIssueInstance } from "@/lib/recommendations/prioritize";
import type { Severity } from "@/lib/scoring/formula";

function rule(ruleKey: string, severity: Severity, overrides: Partial<RecommendationRuleMeta> = {}): RecommendationRuleMeta {
  return {
    ruleKey,
    category: "on_page",
    severity,
    title: `${ruleKey} title`,
    description: `${ruleKey} description`,
    recommendation: `${ruleKey} recommendation`,
    fixExample: null,
    impact: `${ruleKey} impact`,
    ...overrides,
  };
}

function instance(ruleKey: string, pageId: string, pageUrl?: string): RecommendationIssueInstance {
  return { ruleKey, pageId, pageUrl: pageUrl ?? `https://example.com/${pageId}`, evidence: null };
}

describe("buildRecommendations", () => {
  it("returns empty tiers for zero issues", () => {
    const result = buildRecommendations([], []);
    expect(result.totalRules).toBe(0);
    expect(result.totalAffectedPageInstances).toBe(0);
    expect(result.critical).toEqual([]);
    expect(result.high).toEqual([]);
    expect(result.medium).toEqual([]);
    expect(result.low).toEqual([]);
    expect(result.info).toEqual([]);
  });

  it("groups one rule affecting many pages into a single entry with correct affectedPageCount", () => {
    const rules = [rule("RULE_A", "critical")];
    const instances = [instance("RULE_A", "p1"), instance("RULE_A", "p2"), instance("RULE_A", "p3")];
    const result = buildRecommendations(rules, instances);
    expect(result.totalRules).toBe(1);
    expect(result.critical).toHaveLength(1);
    expect(result.critical[0].affectedPageCount).toBe(3);
    expect(result.critical[0].affectedPages).toHaveLength(3);
  });

  it("dedupes multiple instances of the same rule on the same page (does not double-count breadth)", () => {
    const rules = [rule("RULE_A", "high")];
    const instances = [instance("RULE_A", "p1"), instance("RULE_A", "p1"), instance("RULE_A", "p1")];
    const result = buildRecommendations(rules, instances);
    expect(result.high[0].affectedPageCount).toBe(1);
  });

  it("produces one entry per rule when many rules each affect one page", () => {
    const rules = [rule("RULE_A", "medium"), rule("RULE_B", "medium"), rule("RULE_C", "medium")];
    const instances = [instance("RULE_A", "p1"), instance("RULE_B", "p2"), instance("RULE_C", "p3")];
    const result = buildRecommendations(rules, instances);
    expect(result.totalRules).toBe(3);
    expect(result.medium.every((e) => e.affectedPageCount === 1)).toBe(true);
  });

  it("sorts tiers critical > high > medium > low > info and buckets entries by rule severity", () => {
    const rules = [rule("R_INFO", "info"), rule("R_CRIT", "critical"), rule("R_LOW", "low"), rule("R_HIGH", "high"), rule("R_MED", "medium")];
    const instances = [instance("R_INFO", "p1"), instance("R_CRIT", "p1"), instance("R_LOW", "p1"), instance("R_HIGH", "p1"), instance("R_MED", "p1")];
    const result = buildRecommendations(rules, instances);
    expect(result.critical[0].ruleKey).toBe("R_CRIT");
    expect(result.high[0].ruleKey).toBe("R_HIGH");
    expect(result.medium[0].ruleKey).toBe("R_MED");
    expect(result.low[0].ruleKey).toBe("R_LOW");
    expect(result.info[0].ruleKey).toBe("R_INFO");
  });

  it("within a tier, ranks by breadth (affected page count) descending", () => {
    const rules = [rule("RULE_NARROW", "high"), rule("RULE_WIDE", "high")];
    const instances = [
      instance("RULE_NARROW", "p1"),
      instance("RULE_WIDE", "p1"),
      instance("RULE_WIDE", "p2"),
      instance("RULE_WIDE", "p3"),
    ];
    const result = buildRecommendations(rules, instances);
    expect(result.high.map((e) => e.ruleKey)).toEqual(["RULE_WIDE", "RULE_NARROW"]);
  });

  it("tie-breaks equal severity and equal breadth by ruleKey ascending, deterministically", () => {
    const rules = [rule("RULE_Z", "low"), rule("RULE_A", "low")];
    const instances = [instance("RULE_Z", "p1"), instance("RULE_A", "p1")];
    const result = buildRecommendations(rules, instances);
    expect(result.low.map((e) => e.ruleKey)).toEqual(["RULE_A", "RULE_Z"]);
  });

  it("prioritizes a lower-severity issue with huge breadth below any higher-severity issue (tier is primary key, breadth only breaks ties within a tier)", () => {
    const rules = [rule("RULE_LOW_WIDE", "low"), rule("RULE_CRITICAL_NARROW", "critical")];
    const instances = [
      instance("RULE_LOW_WIDE", "p1"),
      instance("RULE_LOW_WIDE", "p2"),
      instance("RULE_LOW_WIDE", "p3"),
      instance("RULE_CRITICAL_NARROW", "p1"),
    ];
    const result = buildRecommendations(rules, instances);
    expect(result.critical).toHaveLength(1);
    expect(result.low).toHaveLength(1);
    // Critical section exists and is conceptually the higher priority tier,
    // regardless of the low-severity issue's larger breadth.
    expect(result.critical[0].ruleKey).toBe("RULE_CRITICAL_NARROW");
    expect(result.low[0].ruleKey).toBe("RULE_LOW_WIDE");
  });

  it("skips issue instances whose rule metadata is missing rather than guessing", () => {
    const rules = [rule("RULE_A", "high")];
    const instances = [instance("RULE_A", "p1"), instance("RULE_UNKNOWN", "p2")];
    const result = buildRecommendations(rules, instances);
    expect(result.totalRules).toBe(1);
    expect(result.high[0].ruleKey).toBe("RULE_A");
  });

  it("carries through static rule metadata (recommendation/fixExample/impact) unchanged, never regenerating it", () => {
    const rules = [rule("RULE_A", "medium", { recommendation: "Do X.", fixExample: "<x/>", impact: "Matters because Y." })];
    const instances = [instance("RULE_A", "p1")];
    const result = buildRecommendations(rules, instances);
    expect(result.medium[0].recommendation).toBe("Do X.");
    expect(result.medium[0].fixExample).toBe("<x/>");
    expect(result.medium[0].impact).toBe("Matters because Y.");
  });

  it("sorts affected pages within an entry by URL for deterministic output", () => {
    const rules = [rule("RULE_A", "info")];
    const instances = [
      instance("RULE_A", "p2", "https://example.com/b"),
      instance("RULE_A", "p1", "https://example.com/a"),
    ];
    const result = buildRecommendations(rules, instances);
    expect(result.info[0].affectedPages.map((p) => p.url)).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("computes totalAffectedPageInstances as the sum of each entry's affectedPageCount", () => {
    const rules = [rule("RULE_A", "high"), rule("RULE_B", "low")];
    const instances = [instance("RULE_A", "p1"), instance("RULE_A", "p2"), instance("RULE_B", "p1")];
    const result = buildRecommendations(rules, instances);
    expect(result.totalAffectedPageInstances).toBe(3);
  });
});
