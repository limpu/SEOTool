import { describe, expect, it } from "vitest";

import {
  CWV_POOR_THRESHOLDS,
  classifyCategoryScore,
  classifyCls,
  classifyInp,
  classifyLcp,
  vitalStatusLabel,
  vitalStatusVariant,
  type VitalStatus,
} from "@/components/report/vitals";
import { CWV_THRESHOLDS } from "@/lib/pagespeed/evaluate-thresholds";

/**
 * Stage 3A — the PageSpeed Overview's verdict logic.
 *
 * The tests that matter most here are the `null` ones. INP is genuinely
 * unmeasured on every Lighthouse lab audit in this dataset, and the single
 * worst thing this page could do is render that absence as a `0` or as a
 * failing metric. Both are pinned below.
 */
describe("Core Web Vitals banding", () => {
  it("uses the same Good bound as the issue-raising thresholds, not a second copy", () => {
    expect(classifyLcp(CWV_THRESHOLDS.lcpMs)).toBe("good");
    expect(classifyLcp(CWV_THRESHOLDS.lcpMs + 1)).toBe("needs-improvement");
    expect(classifyCls(CWV_THRESHOLDS.cls)).toBe("good");
    expect(classifyInp(CWV_THRESHOLDS.inpMs)).toBe("good");
  });

  it("bands LCP across good / needs-improvement / poor", () => {
    expect(classifyLcp(1200)).toBe("good");
    expect(classifyLcp(3200)).toBe("needs-improvement");
    expect(classifyLcp(CWV_POOR_THRESHOLDS.lcpMs)).toBe("needs-improvement");
    expect(classifyLcp(CWV_POOR_THRESHOLDS.lcpMs + 1)).toBe("poor");
    // The real Drs Derma mobile measurement.
    expect(classifyLcp(48891.94)).toBe("poor");
  });

  it("bands CLS across good / needs-improvement / poor", () => {
    expect(classifyCls(0)).toBe("good");
    expect(classifyCls(0.18)).toBe("needs-improvement");
    expect(classifyCls(CWV_POOR_THRESHOLDS.cls)).toBe("needs-improvement");
    expect(classifyCls(0.55243164)).toBe("poor");
  });

  it("bands INP across good / needs-improvement / poor when a value exists", () => {
    expect(classifyInp(120)).toBe("good");
    expect(classifyInp(350)).toBe("needs-improvement");
    expect(classifyInp(900)).toBe("poor");
  });

  /** The load-bearing one — see the file header. */
  it("treats a missing metric as not-measured, never as 0 and never as poor", () => {
    for (const classify of [classifyLcp, classifyCls, classifyInp]) {
      expect(classify(null)).toBe("not-measured");
      expect(classify(undefined)).toBe("not-measured");
      expect(classify(Number.NaN)).toBe("not-measured");
      expect(classify(Number.POSITIVE_INFINITY)).toBe("not-measured");
      // And the distinction that matters: a real 0 is a real measurement.
      expect(classify(0)).toBe("good");
      expect(classify(null)).not.toBe(classify(0));
    }
  });

  it("keeps a measured 0 CLS distinguishable from an unmeasured CLS", () => {
    expect(classifyCls(0)).toBe("good");
    expect(classifyCls(null)).toBe("not-measured");
    expect(vitalStatusLabel(classifyCls(0))).toBe("Pass");
    expect(vitalStatusLabel(classifyCls(null))).toBe("Not measured");
  });
});

describe("Lighthouse category score banding", () => {
  it("uses Lighthouse's own 90 / 50 cut-offs", () => {
    expect(classifyCategoryScore(100)).toBe("good");
    expect(classifyCategoryScore(90)).toBe("good");
    expect(classifyCategoryScore(89)).toBe("needs-improvement");
    expect(classifyCategoryScore(50)).toBe("needs-improvement");
    expect(classifyCategoryScore(49)).toBe("poor");
    // Real Drs Derma values.
    expect(classifyCategoryScore(33)).toBe("poor");
    expect(classifyCategoryScore(82)).toBe("needs-improvement");
  });

  it("reports an absent score as not measured, not as zero", () => {
    expect(classifyCategoryScore(null)).toBe("not-measured");
    expect(classifyCategoryScore(undefined)).toBe("not-measured");
    expect(classifyCategoryScore(0)).toBe("poor");
    expect(classifyCategoryScore(null)).not.toBe(classifyCategoryScore(0));
  });
});

describe("verdict presentation", () => {
  const ALL: VitalStatus[] = ["good", "needs-improvement", "poor", "not-measured"];

  it("gives every status a distinct word, so colour is never the only carrier", () => {
    const labels = ALL.map(vitalStatusLabel);
    expect(new Set(labels).size).toBe(ALL.length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });

  it("never gives an unmeasured metric a pass or fail hue", () => {
    expect(vitalStatusVariant("not-measured")).toBe("unknown");
    expect(vitalStatusVariant("good")).toBe("good");
    expect(vitalStatusVariant("needs-improvement")).toBe("warning");
    expect(vitalStatusVariant("poor")).toBe("critical");
  });
});
