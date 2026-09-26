import { describe, it, expect } from "vitest";
import {
  diffScores,
  diffCoreWebVitals,
  buildIssueCountSnapshot,
  diffIssueCounts,
  diffRuleKeys,
  buildRetestVerdict,
  type RuleKeySnapshotEntry,
} from "@/lib/retest/compare";
import type { ScoreResult } from "@/lib/scoring/compute";

function makeScoreResult(technical: number, onPage: number, performance: number | null, overall: number | null): ScoreResult {
  return {
    technical: { score: technical, issueCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, penalties: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, totalPenalty: 0 },
    onPage: { score: onPage, issueCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, penalties: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, totalPenalty: 0 },
    performance: { score: performance, strategiesMeasured: performance === null ? [] : ["mobile"] },
    overall: { score: overall, weights: { technical: 0.35, onPage: 0.35, performance: 0.3 } },
  };
}

describe("diffScores", () => {
  it("computes a real positive delta when scores improve", () => {
    const before = makeScoreResult(70, 60, 50, 60);
    const after = makeScoreResult(90, 80, 100, 90);
    const deltas = diffScores(before, after);
    expect(deltas.technical).toEqual({ before: 70, after: 90, delta: 20 });
    expect(deltas.onPage).toEqual({ before: 60, after: 80, delta: 20 });
    expect(deltas.performance).toEqual({ before: 50, after: 100, delta: 50 });
    expect(deltas.overall).toEqual({ before: 60, after: 90, delta: 30 });
  });

  it("computes a negative delta when scores regress", () => {
    const before = makeScoreResult(90, 90, 90, 90);
    const after = makeScoreResult(70, 70, 70, 70);
    const deltas = diffScores(before, after);
    expect(deltas.overall.delta).toBe(-20);
  });

  it("reports zero delta, not a fabricated change, when nothing changed", () => {
    const before = makeScoreResult(80, 80, 80, 80);
    const after = makeScoreResult(80, 80, 80, 80);
    const deltas = diffScores(before, after);
    expect(deltas.technical.delta).toBe(0);
    expect(deltas.overall.delta).toBe(0);
  });

  it("propagates null (never infers) when either side's performance score is unmeasured", () => {
    const before = makeScoreResult(80, 80, null, 56);
    const after = makeScoreResult(90, 90, 100, 90);
    const deltas = diffScores(before, after);
    expect(deltas.performance).toEqual({ before: null, after: 100, delta: null });
  });
});

describe("diffCoreWebVitals", () => {
  it("computes real deltas for LCP/CLS/INP", () => {
    const before = { lcp: 4100, cls: 0.3, inp: 400, measuredAt: "2026-01-01T00:00:00.000Z" };
    const after = { lcp: 2200, cls: 0.1, inp: 200, measuredAt: "2026-02-01T00:00:00.000Z" };
    const deltas = diffCoreWebVitals(before, after);
    expect(deltas.lcp).toEqual({ before: 4100, after: 2200, delta: -1900 });
    expect(deltas.cls.delta).toBeCloseTo(-0.2);
    expect(deltas.inp).toEqual({ before: 400, after: 200, delta: -200 });
    expect(deltas.beforeMeasuredAt).toBe("2026-01-01T00:00:00.000Z");
    expect(deltas.afterMeasuredAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("returns null deltas honestly when neither side has PageSpeed data", () => {
    const empty = { lcp: null, cls: null, inp: null, measuredAt: null };
    const deltas = diffCoreWebVitals(empty, empty);
    expect(deltas.lcp.delta).toBeNull();
    expect(deltas.cls.delta).toBeNull();
    expect(deltas.inp.delta).toBeNull();
  });
});

describe("buildIssueCountSnapshot / diffIssueCounts", () => {
  it("buckets by severity and category and diffs correctly", () => {
    const before = buildIssueCountSnapshot([
      { severity: "critical", category: "technical" },
      { severity: "high", category: "on_page" },
      { severity: "high", category: "on_page" },
    ]);
    const after = buildIssueCountSnapshot([
      { severity: "high", category: "on_page" },
      { severity: "low", category: "technical" },
    ]);

    expect(before.total).toBe(3);
    expect(before.bySeverity.critical).toBe(1);
    expect(before.bySeverity.high).toBe(2);

    const deltas = diffIssueCounts(before, after);
    expect(deltas.totalDelta).toBe(-1); // 2 - 3
    expect(deltas.bySeverityDelta.critical).toBe(-1); // resolved
    expect(deltas.bySeverityDelta.high).toBe(-1); // 2 -> 1
    expect(deltas.bySeverityDelta.low).toBe(1); // 0 -> 1 (new)
    expect(deltas.byCategoryDelta.technical).toBe(0); // 1 critical -> 1 low, same category count
    expect(deltas.byCategoryDelta.on_page).toBe(-1);
  });

  it("zero issues on both sides is a valid, honest zero-change snapshot", () => {
    const empty = buildIssueCountSnapshot([]);
    const deltas = diffIssueCounts(empty, empty);
    expect(deltas.totalDelta).toBe(0);
    expect(Object.values(deltas.bySeverityDelta).every((v) => v === 0)).toBe(true);
  });
});

describe("diffRuleKeys", () => {
  const rule = (ruleKey: string, affectedPageCount: number, overrides: Partial<RuleKeySnapshotEntry> = {}): RuleKeySnapshotEntry => ({
    ruleKey,
    title: `Title for ${ruleKey}`,
    category: "on_page",
    severity: "medium",
    affectedPageCount,
    ...overrides,
  });

  it("classifies a rule present only in 'after' as appeared", () => {
    const result = diffRuleKeys([], [rule("NEW_RULE", 3)]);
    expect(result.appeared).toHaveLength(1);
    expect(result.appeared[0].status).toBe("appeared");
    expect(result.appeared[0].beforeAffectedPageCount).toBe(0);
    expect(result.appeared[0].afterAffectedPageCount).toBe(3);
    expect(result.appeared[0].affectedPageCountDelta).toBe(3);
    expect(result.newIssueRuleCount).toBe(1);
    expect(result.disappeared).toHaveLength(0);
    expect(result.persisted).toHaveLength(0);
  });

  it("classifies a rule present only in 'before' as disappeared (resolved)", () => {
    const result = diffRuleKeys([rule("OLD_RULE", 5)], []);
    expect(result.disappeared).toHaveLength(1);
    expect(result.disappeared[0].status).toBe("disappeared");
    expect(result.disappeared[0].beforeAffectedPageCount).toBe(5);
    expect(result.disappeared[0].afterAffectedPageCount).toBe(0);
    expect(result.disappeared[0].affectedPageCountDelta).toBe(-5);
    expect(result.resolvedIssueRuleCount).toBe(1);
  });

  it("classifies a rule present in both as persisted, with a real affected-page-count delta", () => {
    const result = diffRuleKeys([rule("SAME_RULE", 10)], [rule("SAME_RULE", 4)]);
    expect(result.persisted).toHaveLength(1);
    expect(result.persisted[0].status).toBe("persisted");
    expect(result.persisted[0].beforeAffectedPageCount).toBe(10);
    expect(result.persisted[0].afterAffectedPageCount).toBe(4);
    expect(result.persisted[0].affectedPageCountDelta).toBe(-6);
    expect(result.persistedIssueRuleCount).toBe(1);
  });

  it("a persisted rule with an unchanged affected-page-count still reports delta 0, not omitted", () => {
    const result = diffRuleKeys([rule("STABLE", 2)], [rule("STABLE", 2)]);
    expect(result.persisted[0].affectedPageCountDelta).toBe(0);
  });

  it("handles a mixed real-world case: some appeared, some disappeared, some persisted", () => {
    const before = [rule("A", 1), rule("B", 2), rule("C", 3)];
    const after = [rule("B", 2), rule("C", 5), rule("D", 1)];
    const result = diffRuleKeys(before, after);
    expect(result.appeared.map((e) => e.ruleKey)).toEqual(["D"]);
    expect(result.disappeared.map((e) => e.ruleKey)).toEqual(["A"]);
    expect(result.persisted.map((e) => e.ruleKey).sort()).toEqual(["B", "C"]);
  });

  it("sorts each bucket by severity (critical first) then rule key, deterministically", () => {
    const before: RuleKeySnapshotEntry[] = [];
    const after = [
      rule("Z_LOW", 1, { severity: "low" }),
      rule("A_CRITICAL", 1, { severity: "critical" }),
      rule("M_HIGH", 1, { severity: "high" }),
    ];
    const result = diffRuleKeys(before, after);
    expect(result.appeared.map((e) => e.ruleKey)).toEqual(["A_CRITICAL", "M_HIGH", "Z_LOW"]);
  });

  it("two identical snapshots produce zero appeared/disappeared and only persisted with zero deltas — a valid 'no change' result", () => {
    const snapshot = [rule("X", 4), rule("Y", 1)];
    const result = diffRuleKeys(snapshot, snapshot);
    expect(result.appeared).toHaveLength(0);
    expect(result.disappeared).toHaveLength(0);
    expect(result.persisted).toHaveLength(2);
    expect(result.persisted.every((e) => e.affectedPageCountDelta === 0)).toBe(true);
  });
});

describe("buildRetestVerdict", () => {
  it("produces an honest 'no change detected' verdict when scores and issues are identical", () => {
    const scoreDeltas = diffScores(makeScoreResult(80, 80, 80, 80), makeScoreResult(80, 80, 80, 80));
    const ruleKeyDiff = diffRuleKeys([], []);
    const verdict = buildRetestVerdict(scoreDeltas, ruleKeyDiff);
    expect(verdict.noChangeDetected).toBe(true);
    expect(verdict.summary).toBe("No change detected between the two crawls.");
    expect(verdict.newIssueRuleCount).toBe(0);
    expect(verdict.resolvedIssueRuleCount).toBe(0);
  });

  it("summarizes a real improvement with the exact numbers, never a vague claim", () => {
    const scoreDeltas = diffScores(makeScoreResult(65, 65, 65, 71), makeScoreResult(90, 90, 88, 89));
    const ruleKeyDiff = diffRuleKeys(
      [{ ruleKey: "A", title: "A", category: "technical", severity: "high", affectedPageCount: 1 }],
      [],
    );
    const verdict = buildRetestVerdict(scoreDeltas, ruleKeyDiff);
    expect(verdict.overallScoreDelta).toBe(18);
    expect(verdict.summary).toContain("Overall score improved by 18 points (71 → 89).");
    expect(verdict.summary).toContain("1 issue resolved.");
    expect(verdict.noChangeDetected).toBe(false);
  });

  it("summarizes a real regression honestly, including new issues introduced", () => {
    const scoreDeltas = diffScores(makeScoreResult(90, 90, 90, 90), makeScoreResult(70, 70, 70, 70));
    const ruleKeyDiff = diffRuleKeys(
      [],
      [
        { ruleKey: "NEW1", title: "New issue 1", category: "on_page", severity: "critical", affectedPageCount: 2 },
        { ruleKey: "NEW2", title: "New issue 2", category: "on_page", severity: "high", affectedPageCount: 1 },
      ],
    );
    const verdict = buildRetestVerdict(scoreDeltas, ruleKeyDiff);
    expect(verdict.summary).toContain("Overall score dropped by 20 points (90 → 70).");
    expect(verdict.summary).toContain("2 new issues introduced.");
    expect(verdict.noChangeDetected).toBe(false);
  });

  it("never claims not-comparable performance as a fabricated 'no change'", () => {
    const scoreDeltas = diffScores(makeScoreResult(80, 80, null, 80), makeScoreResult(80, 80, 100, 84));
    const ruleKeyDiff = diffRuleKeys([], []);
    const verdict = buildRetestVerdict(scoreDeltas, ruleKeyDiff);
    // Overall did change (80 -> 84) because performance became measured, so this is NOT a no-change case.
    expect(verdict.overallScoreDelta).toBe(4);
    expect(verdict.noChangeDetected).toBe(false);
  });
});
