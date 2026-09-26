import { describe, expect, it } from "vitest";
import {
  aggregateDimensions,
  buildSeverityBreakdown,
  computeGscTotals,
  cwvBand,
  cwvBandLabel,
  lighthouseBand,
  SEVERITY_ORDER,
} from "@/lib/dashboard/overview-metrics";

describe("buildSeverityBreakdown", () => {
  it("keeps the fixed severity order regardless of counts", () => {
    const { slices } = buildSeverityBreakdown({ info: 100, critical: 1 });
    expect(slices.map((s) => s.key)).toEqual([...SEVERITY_ORDER]);
  });

  it("computes each tier's share of the total to 1dp", () => {
    const { slices, total } = buildSeverityBreakdown({ critical: 1, high: 1, medium: 1, low: 1 });
    expect(total).toBe(4);
    expect(slices.find((s) => s.key === "critical")?.share).toBe(25);
    // 0 of a non-zero total is a real measured 0 share, not null.
    expect(slices.find((s) => s.key === "info")?.share).toBe(0);
  });

  it("rounds shares to one decimal place", () => {
    const { slices } = buildSeverityBreakdown({ critical: 1, high: 2 });
    expect(slices.find((s) => s.key === "critical")?.share).toBe(33.3);
    expect(slices.find((s) => s.key === "high")?.share).toBe(66.7);
  });

  it("shares sum to ~100 for a real distribution", () => {
    const { slices } = buildSeverityBreakdown({ critical: 3, high: 7, medium: 11, low: 2, info: 5 });
    const sum = slices.reduce((acc, s) => acc + (s.share ?? 0), 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.2);
  });

  it("reports null shares — never 0% — when there are no issues at all", () => {
    const { slices, total } = buildSeverityBreakdown({});
    expect(total).toBe(0);
    // A measured zero total is a real, good result; but there is no
    // composition to describe, so no tier claims a percentage.
    expect(slices.every((s) => s.value === 0)).toBe(true);
    expect(slices.every((s) => s.share === null)).toBe(true);
  });

  it("treats a missing tier as 0 issues, not as missing data", () => {
    const { slices } = buildSeverityBreakdown({ critical: 2 });
    expect(slices.find((s) => s.key === "low")?.value).toBe(0);
  });
});

describe("computeGscTotals", () => {
  it("sums clicks and impressions", () => {
    const totals = computeGscTotals([
      { clicks: 10, impressions: 100, position: 5 },
      { clicks: 5, impressions: 400, position: 20 },
    ]);
    expect(totals.clicks).toBe(15);
    expect(totals.impressions).toBe(500);
  });

  it("derives CTR from the totals, not as a mean of per-row rates", () => {
    const totals = computeGscTotals([
      { clicks: 1, impressions: 1, position: 1 }, // 100% CTR, 1 impression
      { clicks: 0, impressions: 999, position: 50 }, // 0% CTR, 999 impressions
    ]);
    // Mean-of-rates would report 50%; the honest site CTR is 1/1000.
    expect(totals.ctr).toBeCloseTo(0.001, 6);
  });

  it("weights average position by impressions, as Search Console does", () => {
    const totals = computeGscTotals([
      { clicks: 0, impressions: 900, position: 10 },
      { clicks: 0, impressions: 100, position: 100 },
    ]);
    // Unweighted mean would be 55; impression-weighted is 19.
    expect(totals.avgPosition).toBe(19);
  });

  it("returns null CTR and position with no impressions — never a fabricated 0", () => {
    const totals = computeGscTotals([]);
    expect(totals.clicks).toBe(0);
    expect(totals.impressions).toBe(0);
    expect(totals.ctr).toBeNull();
    expect(totals.avgPosition).toBeNull();
  });

  it("reports a genuine measured zero CTR when impressions exist but clicks do not", () => {
    const totals = computeGscTotals([{ clicks: 0, impressions: 250, position: 40 }]);
    expect(totals.ctr).toBe(0);
    expect(totals.avgPosition).toBe(40);
  });
});

describe("cwvBand", () => {
  it("bands LCP across all three Google thresholds", () => {
    expect(cwvBand("lcp", 2000)).toBe("good");
    expect(cwvBand("lcp", 2500)).toBe("good"); // inclusive upper bound
    expect(cwvBand("lcp", 3200)).toBe("needs-improvement");
    expect(cwvBand("lcp", 4001)).toBe("poor");
  });

  it("bands CLS and INP on their own scales", () => {
    expect(cwvBand("cls", 0.05)).toBe("good");
    expect(cwvBand("cls", 0.2)).toBe("needs-improvement");
    expect(cwvBand("cls", 0.4)).toBe("poor");
    expect(cwvBand("inp", 180)).toBe("good");
    expect(cwvBand("inp", 350)).toBe("needs-improvement");
    expect(cwvBand("inp", 800)).toBe("poor");
  });

  it("maps a missing value to unmeasured, never to poor", () => {
    expect(cwvBand("lcp", null)).toBe("unmeasured");
    expect(cwvBand("cls", undefined)).toBe("unmeasured");
    expect(cwvBand("inp", Number.NaN)).toBe("unmeasured");
  });

  it("treats a measured 0 as a real, good result", () => {
    expect(cwvBand("cls", 0)).toBe("good");
  });

  it("gives every band a text label so colour is never the sole carrier", () => {
    expect(cwvBandLabel(cwvBand("lcp", null))).toBe("Not measured");
    expect(cwvBandLabel(cwvBand("lcp", 1000))).toBe("Good");
    expect(cwvBandLabel(cwvBand("lcp", 9000))).toBe("Poor");
  });
});

describe("aggregateDimensions", () => {
  const assessed = (key: string, score: number | null) => ({
    key,
    label: key.toUpperCase(),
    status: "assessed" as const,
    score,
  });
  const unassessed = (key: string) => ({
    key,
    label: key.toUpperCase(),
    status: "unassessed" as const,
    score: null,
  });

  it("averages assessed dimensions across pages", () => {
    const rows = aggregateDimensions([
      { dimensions: [assessed("lists", 100)] },
      { dimensions: [assessed("lists", 50)] },
    ]);
    expect(rows[0].score).toBe(75);
    expect(rows[0].pagesContributing).toBe(2);
  });

  it("keeps an unassessed dimension visible with a null score — never 0, never hidden", () => {
    const rows = aggregateDimensions([{ dimensions: [assessed("lists", 80), unassessed("answerability")] }]);
    expect(rows).toHaveLength(2);
    const answerability = rows.find((r) => r.key === "answerability")!;
    expect(answerability.status).toBe("unassessed");
    expect(answerability.score).toBeNull();
    expect(answerability.score).not.toBe(0);
    expect(answerability.pagesContributing).toBe(0);
  });

  it("stays unassessed if any page reports the dimension as unassessed", () => {
    const rows = aggregateDimensions([
      { dimensions: [assessed("evidence", 90)] },
      { dimensions: [unassessed("evidence")] },
    ]);
    expect(rows[0].status).toBe("unassessed");
    expect(rows[0].score).toBeNull();
  });

  it("preserves a genuine measured 0 as a real score", () => {
    const rows = aggregateDimensions([{ dimensions: [assessed("tables", 0)] }]);
    expect(rows[0].status).toBe("assessed");
    expect(rows[0].score).toBe(0);
    expect(rows[0].pagesContributing).toBe(1);
  });

  it("holds the emitted dimension order rather than re-sorting by score", () => {
    const rows = aggregateDimensions([
      { dimensions: [assessed("a", 10), assessed("b", 90), assessed("c", 50)] },
    ]);
    expect(rows.map((r) => r.key)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list when no pages were assessable at all", () => {
    expect(aggregateDimensions([])).toEqual([]);
  });
});

describe("lighthouseBand", () => {
  it("uses Lighthouse's own 90/50 cutoffs", () => {
    expect(lighthouseBand(95)).toBe("good");
    expect(lighthouseBand(90)).toBe("good");
    expect(lighthouseBand(89)).toBe("needs-improvement");
    expect(lighthouseBand(50)).toBe("needs-improvement");
    expect(lighthouseBand(49)).toBe("poor");
  });

  it("distinguishes a measured 0 from an unmeasured score", () => {
    expect(lighthouseBand(0)).toBe("poor");
    expect(lighthouseBand(null)).toBe("unmeasured");
  });
});
