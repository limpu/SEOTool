import { describe, it, expect } from "vitest";
import {
  computeCategoryScore,
  computeOverallScore,
  computePerformanceScore,
  type ScoredIssue,
  type Severity,
} from "@/lib/scoring/formula";

function issues(...severities: Severity[]): ScoredIssue[] {
  return severities.map((severity) => ({ severity }));
}

describe("computeCategoryScore", () => {
  it("returns 100 for zero issues", () => {
    const result = computeCategoryScore([]);
    expect(result.score).toBe(100);
    expect(result.totalPenalty).toBe(0);
  });

  it("does not penalize info-only issues", () => {
    const result = computeCategoryScore(issues("info", "info", "info", "info", "info"));
    expect(result.score).toBe(100);
    expect(result.issueCounts.info).toBe(5);
  });

  it("subtracts 20 per critical issue", () => {
    const result = computeCategoryScore(issues("critical"));
    expect(result.score).toBe(80);
  });

  it("subtracts 10 per high issue", () => {
    const result = computeCategoryScore(issues("high", "high"));
    expect(result.score).toBe(80);
  });

  it("subtracts 5 per medium issue", () => {
    const result = computeCategoryScore(issues("medium", "medium", "medium"));
    expect(result.score).toBe(85);
  });

  it("subtracts 2 per low issue", () => {
    const result = computeCategoryScore(issues("low", "low"));
    expect(result.score).toBe(96);
  });

  it("floors at 0 for many critical issues (all-critical case)", () => {
    const result = computeCategoryScore(issues("critical", "critical", "critical", "critical", "critical", "critical"));
    expect(result.score).toBe(0);
  });

  it("caps the low-severity bucket so 50 low issues don't zero the score alone", () => {
    const result = computeCategoryScore(issues(...Array(50).fill("low" as Severity)));
    // Bucket cap is -30, so score should be 70, not 0.
    expect(result.score).toBe(70);
    expect(result.penalties.low).toBe(30);
  });

  it("caps the medium bucket at -60", () => {
    const result = computeCategoryScore(issues(...Array(20).fill("medium" as Severity)));
    expect(result.penalties.medium).toBe(60);
    expect(result.score).toBe(40);
  });

  it("caps the high bucket at -80", () => {
    const result = computeCategoryScore(issues(...Array(20).fill("high" as Severity)));
    expect(result.penalties.high).toBe(80);
    expect(result.score).toBe(20);
  });

  it("caps the critical bucket at -100", () => {
    const result = computeCategoryScore(issues(...Array(20).fill("critical" as Severity)));
    expect(result.penalties.critical).toBe(100);
    expect(result.score).toBe(0);
  });

  it("combines multiple severities correctly", () => {
    const result = computeCategoryScore(issues("critical", "high", "medium", "low", "info"));
    // 20 + 10 + 5 + 2 + 0 = 37
    expect(result.totalPenalty).toBe(37);
    expect(result.score).toBe(63);
  });

  it("never goes below 0 or above 100", () => {
    const zero = computeCategoryScore(issues(...Array(100).fill("critical" as Severity)));
    expect(zero.score).toBeGreaterThanOrEqual(0);
    const full = computeCategoryScore([]);
    expect(full.score).toBeLessThanOrEqual(100);
  });
});

describe("computePerformanceScore", () => {
  it("returns null when no scores are available", () => {
    expect(computePerformanceScore([])).toBeNull();
    expect(computePerformanceScore([null, undefined])).toBeNull();
  });

  it("averages mobile + desktop scores", () => {
    expect(computePerformanceScore([80, 90])).toBe(85);
  });

  it("uses the single available strategy when only one has run", () => {
    expect(computePerformanceScore([70, null])).toBe(70);
  });

  it("rounds to the nearest integer", () => {
    expect(computePerformanceScore([80, 81])).toBe(81); // 80.5 rounds to 81 (banker's-neutral Math.round)
  });
});

describe("computeOverallScore", () => {
  it("returns null when nothing is measured", () => {
    const result = computeOverallScore({ technical: null, onPage: null, performance: null });
    expect(result.score).toBeNull();
  });

  it("weights technical 35 / on-page 35 / performance 30 when all present", () => {
    const result = computeOverallScore({ technical: 100, onPage: 100, performance: 100 });
    expect(result.score).toBe(100);
    expect(result.weights).toEqual({ technical: 0.35, onPage: 0.35, performance: 0.3 });
  });

  it("computes a weighted blend correctly", () => {
    // 80*0.35 + 60*0.35 + 100*0.3 = 28 + 21 + 30 = 79
    const result = computeOverallScore({ technical: 80, onPage: 60, performance: 100 });
    expect(result.score).toBe(79);
  });

  it("renormalizes to 50/50 when performance is unmeasured", () => {
    const result = computeOverallScore({ technical: 80, onPage: 60, performance: null });
    // (80*0.5 + 60*0.5) = 70
    expect(result.score).toBe(70);
    expect(result.weights.performance).toBe(0);
    expect(result.weights.technical).toBeCloseTo(0.5, 1);
    expect(result.weights.onPage).toBeCloseTo(0.5, 1);
  });

  it("uses only the single available component when technical/on-page are both unmeasured", () => {
    const result = computeOverallScore({ technical: null, onPage: null, performance: 42 });
    expect(result.score).toBe(42);
  });

  it("handles a realistic mixed case", () => {
    const result = computeOverallScore({ technical: 63, onPage: 78, performance: null });
    // (63*0.5 + 78*0.5) = 70.5 -> rounds to 70 or 71
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.score).toBeLessThanOrEqual(71);
  });
});
