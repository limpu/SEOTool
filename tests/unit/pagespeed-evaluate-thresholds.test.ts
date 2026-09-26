import { describe, it, expect } from "vitest";
import {
  evaluateCoreWebVitals,
  evaluatePageSpeedSignals,
  isPoorPerformanceScore,
  CWV_THRESHOLDS,
  POOR_PERFORMANCE_SCORE_THRESHOLD,
} from "@/lib/pagespeed/evaluate-thresholds";
import type { ExtractedPageSpeedMetrics } from "@/lib/pagespeed/extract-metrics";

function metrics(overrides: Partial<ExtractedPageSpeedMetrics> = {}): ExtractedPageSpeedMetrics {
  return {
    performanceScore: 90,
    accessibilityScore: 90,
    bestPracticesScore: 90,
    seoScore: 90,
    lcp: 1000,
    cls: 0.02,
    inp: 100,
    fcp: 800,
    tbt: 50,
    speedIndex: 1500,
    ttfb: 200,
    lighthouseVersion: "13.4.1",
    ...overrides,
  };
}

describe("evaluateCoreWebVitals", () => {
  it("passes all three vitals when well under threshold", () => {
    expect(evaluateCoreWebVitals(metrics())).toEqual({ lcp: "pass", cls: "pass", inp: "pass" });
  });

  it("fails LCP exactly above 2.5s, passes exactly at 2.5s", () => {
    expect(evaluateCoreWebVitals(metrics({ lcp: 2501 })).lcp).toBe("fail");
    expect(evaluateCoreWebVitals(metrics({ lcp: CWV_THRESHOLDS.lcpMs })).lcp).toBe("pass");
  });

  it("fails CLS above 0.1, passes at 0.1", () => {
    expect(evaluateCoreWebVitals(metrics({ cls: 0.11 })).cls).toBe("fail");
    expect(evaluateCoreWebVitals(metrics({ cls: CWV_THRESHOLDS.cls })).cls).toBe("pass");
  });

  it("fails INP above 200ms, passes at 200ms", () => {
    expect(evaluateCoreWebVitals(metrics({ inp: 201 })).inp).toBe("fail");
    expect(evaluateCoreWebVitals(metrics({ inp: CWV_THRESHOLDS.inpMs })).inp).toBe("pass");
  });

  it("reports 'unmeasured' (not pass/fail) when a metric is null", () => {
    expect(evaluateCoreWebVitals(metrics({ inp: null })).inp).toBe("unmeasured");
  });
});

describe("isPoorPerformanceScore", () => {
  it("flags scores below the threshold", () => {
    expect(isPoorPerformanceScore(POOR_PERFORMANCE_SCORE_THRESHOLD - 1)).toBe(true);
  });
  it("does not flag a score at or above the threshold", () => {
    expect(isPoorPerformanceScore(POOR_PERFORMANCE_SCORE_THRESHOLD)).toBe(false);
    expect(isPoorPerformanceScore(100)).toBe(false);
  });
  it("does not flag a null (unmeasured) score", () => {
    expect(isPoorPerformanceScore(null)).toBe(false);
  });
});

describe("evaluatePageSpeedSignals", () => {
  it("produces no signals for a clean, fast page", () => {
    expect(evaluatePageSpeedSignals(metrics(), "mobile")).toEqual([]);
  });

  it("flags a poor performance score", () => {
    const signals = evaluatePageSpeedSignals(metrics({ performanceScore: 30 }), "mobile");
    expect(signals.map((s) => s.ruleKey)).toContain("PAGESPEED_POOR_PERFORMANCE_SCORE");
  });

  it("flags a failing LCP with the strategy named in the evidence", () => {
    const signals = evaluatePageSpeedSignals(metrics({ lcp: 4000 }), "desktop");
    const signal = signals.find((s) => s.ruleKey === "PAGESPEED_CWV_LCP_FAIL");
    expect(signal).toBeDefined();
    expect(signal!.evidence).toContain("desktop");
    expect(signal!.evidence).toContain("4.00s");
  });

  it("flags a failing CLS", () => {
    const signals = evaluatePageSpeedSignals(metrics({ cls: 0.4 }), "mobile");
    expect(signals.map((s) => s.ruleKey)).toContain("PAGESPEED_CWV_CLS_FAIL");
  });

  it("flags a failing INP but not when INP is unmeasured", () => {
    expect(evaluatePageSpeedSignals(metrics({ inp: 500 }), "mobile").map((s) => s.ruleKey)).toContain(
      "PAGESPEED_CWV_INP_FAIL"
    );
    expect(evaluatePageSpeedSignals(metrics({ inp: null }), "mobile").map((s) => s.ruleKey)).not.toContain(
      "PAGESPEED_CWV_INP_FAIL"
    );
  });

  it("can raise multiple signals at once for a genuinely bad page", () => {
    const signals = evaluatePageSpeedSignals(
      metrics({ performanceScore: 20, lcp: 5000, cls: 0.5, inp: 600 }),
      "mobile"
    );
    expect(signals.map((s) => s.ruleKey).sort()).toEqual(
      [
        "PAGESPEED_CWV_CLS_FAIL",
        "PAGESPEED_CWV_INP_FAIL",
        "PAGESPEED_CWV_LCP_FAIL",
        "PAGESPEED_POOR_PERFORMANCE_SCORE",
      ].sort()
    );
  });
});
