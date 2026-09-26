import type { ExtractedPageSpeedMetrics } from "./extract-metrics";

/**
 * Google's own published Core Web Vitals thresholds ("Good" upper bound).
 * These are stable, publicly documented numbers (web.dev/vitals), not
 * something this project is inventing — safe to hard-code per the task
 * brief. LCP/CLS are in Lighthouse's native units (ms, unitless); INP's
 * public threshold is a field metric (200ms) but Lighthouse's lab-mode INP
 * audit reports in the same ms unit, so the same number applies directly
 * when the metric is available.
 */
export const CWV_THRESHOLDS = {
  lcpMs: 2500,
  cls: 0.1,
  inpMs: 200,
} as const;

/**
 * Not a Google-published number — an internal heuristic threshold for
 * flagging a "poor" Lighthouse Performance score, documented here (not
 * asserted as an official ranking cutoff) per Section 79's "no fake
 * data/never present a proprietary score as a Google metric" rule.
 */
export const POOR_PERFORMANCE_SCORE_THRESHOLD = 50;

export type CwvVerdict = "pass" | "fail" | "unmeasured";

export interface CwvEvaluation {
  lcp: CwvVerdict;
  cls: CwvVerdict;
  inp: CwvVerdict;
}

function verdict(value: number | null, threshold: number): CwvVerdict {
  if (value === null) return "unmeasured";
  return value <= threshold ? "pass" : "fail";
}

export function evaluateCoreWebVitals(metrics: ExtractedPageSpeedMetrics): CwvEvaluation {
  return {
    lcp: verdict(metrics.lcp, CWV_THRESHOLDS.lcpMs),
    cls: verdict(metrics.cls, CWV_THRESHOLDS.cls),
    inp: verdict(metrics.inp, CWV_THRESHOLDS.inpMs),
  };
}

export function isPoorPerformanceScore(performanceScore: number | null): boolean {
  return performanceScore !== null && performanceScore < POOR_PERFORMANCE_SCORE_THRESHOLD;
}

export interface PageSpeedIssueSignal {
  ruleKey: "PAGESPEED_POOR_PERFORMANCE_SCORE" | "PAGESPEED_CWV_LCP_FAIL" | "PAGESPEED_CWV_CLS_FAIL" | "PAGESPEED_CWV_INP_FAIL";
  evidence: string;
}

/**
 * Turns extracted metrics for one audit (one strategy: mobile or desktop)
 * into the set of Phase 20 issue signals that should be raised. Pure
 * function — the caller (the async job runner) is responsible for actually
 * persisting these against `seo_issues`/`seo_rules`.
 */
export function evaluatePageSpeedSignals(
  metrics: ExtractedPageSpeedMetrics,
  strategy: "mobile" | "desktop"
): PageSpeedIssueSignal[] {
  const signals: PageSpeedIssueSignal[] = [];
  const cwv = evaluateCoreWebVitals(metrics);

  if (isPoorPerformanceScore(metrics.performanceScore)) {
    signals.push({
      ruleKey: "PAGESPEED_POOR_PERFORMANCE_SCORE",
      evidence: `Lighthouse Performance score is ${metrics.performanceScore}/100 on ${strategy} (below the ${POOR_PERFORMANCE_SCORE_THRESHOLD} heuristic threshold).`,
    });
  }

  if (cwv.lcp === "fail") {
    signals.push({
      ruleKey: "PAGESPEED_CWV_LCP_FAIL",
      evidence: `LCP is ${(metrics.lcp! / 1000).toFixed(2)}s on ${strategy} (Google's "Good" threshold is ≤ 2.5s).`,
    });
  }

  if (cwv.cls === "fail") {
    signals.push({
      ruleKey: "PAGESPEED_CWV_CLS_FAIL",
      evidence: `CLS is ${metrics.cls!.toFixed(3)} on ${strategy} (Google's "Good" threshold is ≤ 0.1).`,
    });
  }

  if (cwv.inp === "fail") {
    signals.push({
      ruleKey: "PAGESPEED_CWV_INP_FAIL",
      evidence: `INP is ${Math.round(metrics.inp!)}ms on ${strategy} (Google's "Good" threshold is ≤ 200ms).`,
    });
  }

  return signals;
}
