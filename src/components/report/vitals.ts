/**
 * Stage 3A — pure classification helpers for the PageSpeed Overview.
 *
 * No React, no DOM, no DB — every function here maps a raw Lighthouse number
 * onto a three-band verdict plus a label, so all of it is directly
 * unit-testable (`tests/unit/report-vitals.test.ts`).
 *
 * ─── Why a THIRD band exists here ────────────────────────────────────────
 *
 * `src/lib/pagespeed/evaluate-thresholds.ts` already answers the question it
 * needs to answer: "should this metric raise an `seo_issues` row?" — a binary
 * pass/fail against Google's published "Good" upper bound, plus `unmeasured`.
 * That function is NOT changed and NOT duplicated: the good bounds below are
 * imported from it, so there is exactly one place where 2500 / 0.1 / 200 live.
 *
 * A report page has a different question: *how far* off is it. Google
 * publishes two boundaries per Core Web Vital, not one — the "Good" bound and
 * the "Needs improvement / Poor" bound (web.dev/vitals: LCP 2.5s / 4.0s,
 * CLS 0.1 / 0.25, INP 200ms / 500ms). Those second numbers are added here,
 * clearly attributed, so the Overview can say *needs improvement* instead of
 * flattening a 2.6s LCP and a 49s LCP into the same red word. Nothing about
 * which issues fire changes.
 *
 * ─── The `not-measured` band is not a fourth colour, it is the point ─────
 *
 * INP is `null` on every audit in this dataset — Lighthouse's lab mode cannot
 * produce it without real interaction traces. A `null` therefore NEVER becomes
 * `0` and never becomes "poor": it becomes an explicit "Not measured" carrying
 * its own neutral badge, because a metric nobody could measure is not a metric
 * the site failed.
 */

import { CWV_THRESHOLDS } from "@/lib/pagespeed/evaluate-thresholds";

export type VitalStatus = "good" | "needs-improvement" | "poor" | "not-measured";

/**
 * Google's published upper bound for the "Needs improvement" band — anything
 * above it is "Poor". The "Good" bound is `CWV_THRESHOLDS`, imported above so
 * it is not restated here. Both sets are stable, publicly documented numbers
 * (web.dev/vitals), not values this project invented.
 */
export const CWV_POOR_THRESHOLDS = {
  lcpMs: 4000,
  cls: 0.25,
  inpMs: 500,
} as const;

function band(value: number | null | undefined, goodMax: number, needsImprovementMax: number): VitalStatus {
  if (value === null || value === undefined || !Number.isFinite(value)) return "not-measured";
  if (value <= goodMax) return "good";
  if (value <= needsImprovementMax) return "needs-improvement";
  return "poor";
}

/** Largest Contentful Paint, in milliseconds (Lighthouse's native unit). */
export function classifyLcp(ms: number | null | undefined): VitalStatus {
  return band(ms, CWV_THRESHOLDS.lcpMs, CWV_POOR_THRESHOLDS.lcpMs);
}

/** Cumulative Layout Shift — unitless. */
export function classifyCls(value: number | null | undefined): VitalStatus {
  return band(value, CWV_THRESHOLDS.cls, CWV_POOR_THRESHOLDS.cls);
}

/** Interaction to Next Paint, in milliseconds. `null` in lab mode is the norm, not a failure. */
export function classifyInp(ms: number | null | undefined): VitalStatus {
  return band(ms, CWV_THRESHOLDS.inpMs, CWV_POOR_THRESHOLDS.inpMs);
}

/**
 * A Lighthouse CATEGORY score (Performance / Accessibility / Best Practices /
 * SEO), stored 0-100. Lighthouse publishes its own colour cut-offs at 90 and
 * 50; those are reused verbatim rather than reinvented, and a `null` score
 * (audit never ran, or ran and failed) is "not measured", never 0.
 */
export function classifyCategoryScore(score: number | null | undefined): VitalStatus {
  if (score === null || score === undefined || !Number.isFinite(score)) return "not-measured";
  if (score >= 90) return "good";
  if (score >= 50) return "needs-improvement";
  return "poor";
}

/** The word that must accompany the colour — status is never carried by hue alone. */
export function vitalStatusLabel(status: VitalStatus): string {
  switch (status) {
    case "good":
      return "Pass";
    case "needs-improvement":
      return "Needs improvement";
    case "poor":
      return "Fail";
    case "not-measured":
      return "Not measured";
  }
}

/**
 * Badge variant for a verdict. `not-measured` maps to `unknown`, which is the
 * design system's "we did not measure this" role — deliberately NOT a status
 * hue, so an unmeasured metric can never be misread as a failing one.
 */
export function vitalStatusVariant(status: VitalStatus): "good" | "warning" | "critical" | "unknown" {
  switch (status) {
    case "good":
      return "good";
    case "needs-improvement":
      return "warning";
    case "poor":
      return "critical";
    case "not-measured":
      return "unknown";
  }
}
