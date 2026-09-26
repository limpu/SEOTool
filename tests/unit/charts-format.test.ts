import { describe, expect, it } from "vitest";
import {
  describeDelta,
  foldTail,
  formatCls,
  formatCount,
  formatMetric,
  formatMilliseconds,
  formatRatioAsPercent,
  formatUpdatedAt,
  safeDelta,
  scoreBand,
  scoreBandLabel,
  shortenUrl,
} from "@/components/charts/format";

describe("formatMetric — unavailable vs. a measured zero", () => {
  it("formats a measured 0 as a real number", () => {
    const result = formatMetric(0);
    expect(result.available).toBe(true);
    expect(result.text).toBe("0");
  });

  it("never turns a missing value into 0", () => {
    for (const missing of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = formatMetric(missing);
      expect(result.available).toBe(false);
      expect(result.text).toBe("Not measured");
      expect(result.text).not.toContain("0");
    }
  });

  it("lets the caller word the missing case", () => {
    expect(formatMetric(null, { unavailable: "Connect Search Console" }).text).toBe("Connect Search Console");
  });

  it("groups thousands and applies suffixes/decimals", () => {
    expect(formatMetric(1234567).text).toBe("1,234,567");
    expect(formatMetric(12.345, { decimals: 1, suffix: "%" }).text).toBe("12.3%");
    expect(formatMetric(1234, { grouped: false }).text).toBe("1234");
  });
});

describe("formatCount / formatRatioAsPercent / formatMilliseconds / formatCls", () => {
  it("distinguishes zero from no data in counts", () => {
    expect(formatCount(0)).toEqual({ available: true, text: "0" });
    expect(formatCount(null)).toEqual({ available: false, text: "No data" });
  });

  it("converts a 0-1 ratio to a percentage", () => {
    expect(formatRatioAsPercent(0.0342).text).toBe("3.4%");
    // A genuine 0% click-through rate is a real measurement.
    expect(formatRatioAsPercent(0)).toEqual({ available: true, text: "0.0%" });
    expect(formatRatioAsPercent(null).available).toBe(false);
  });

  it("keeps sub-second timings in milliseconds", () => {
    expect(formatMilliseconds(480).text).toBe("480 ms");
    expect(formatMilliseconds(2500).text).toBe("2.50 s");
    expect(formatMilliseconds(null).available).toBe(false);
  });

  it("reports CLS to three decimals", () => {
    expect(formatCls(0.024).text).toBe("0.024");
    expect(formatCls(null).available).toBe(false);
  });
});

describe("scoreBand", () => {
  it("bands real scores", () => {
    expect(scoreBand(95)).toBe("good");
    expect(scoreBand(80)).toBe("good");
    expect(scoreBand(70)).toBe("warning");
    expect(scoreBand(45)).toBe("serious");
    expect(scoreBand(10)).toBe("critical");
  });

  it("maps a missing score to unmeasured, never to critical", () => {
    expect(scoreBand(null)).toBe("unmeasured");
    expect(scoreBand(undefined)).toBe("unmeasured");
    // A site nobody has crawled is not a failing site.
    expect(scoreBand(null)).not.toBe("critical");
  });

  it("still bands a genuine 0 as critical", () => {
    expect(scoreBand(0)).toBe("critical");
  });

  it("gives every band a label", () => {
    expect(scoreBandLabel("unmeasured")).toBe("Not measured");
    expect(scoreBandLabel("good")).toBe("Good");
  });
});

describe("describeDelta — direction, and the inverted Position scale", () => {
  it("treats a rising number as an improvement on a normal metric", () => {
    const delta = describeDelta(4);
    expect(delta?.direction).toBe("up");
    expect(delta?.improvement).toBe(true);
    expect(delta?.text).toBe("+4");
  });

  it("treats a falling number as a regression on a normal metric", () => {
    const delta = describeDelta(-4);
    expect(delta?.direction).toBe("down");
    expect(delta?.improvement).toBe(false);
  });

  it("treats a FALLING Search Console position as an IMPROVEMENT", () => {
    // Moving from position 12 to position 8 is a delta of −4 and is good news.
    const delta = describeDelta(-4, { lowerIsBetter: true });
    expect(delta?.direction).toBe("down");
    expect(delta?.improvement).toBe(true);
    expect(delta?.description).toContain("Improved");
    expect(delta?.description).toContain("lower is better");
  });

  it("treats a RISING Search Console position as a regression", () => {
    const delta = describeDelta(3.2, { lowerIsBetter: true, decimals: 1 });
    expect(delta?.direction).toBe("up");
    expect(delta?.improvement).toBe(false);
    expect(delta?.text).toBe("+3.2");
    expect(delta?.description).toContain("Worsened");
  });

  it("renders no chip at all when there is no honest delta to show", () => {
    // No comparable baseline — e.g. only one crawl run has ever completed.
    expect(describeDelta(null)).toBeNull();
    expect(describeDelta(undefined)).toBeNull();
    // Exactly unchanged: an arrow would imply movement that did not happen.
    expect(describeDelta(0)).toBeNull();
    expect(describeDelta(0, { lowerIsBetter: true })).toBeNull();
  });

  it("uses a true minus sign so figures stay aligned in tabular columns", () => {
    expect(describeDelta(-7)?.text).toBe("−7");
  });
});

describe("safeDelta", () => {
  it("subtracts only when both sides are real numbers", () => {
    expect(safeDelta(10, 14)).toBe(4);
    expect(safeDelta(14, 10)).toBe(-4);
  });

  it("returns null when a baseline is missing, rather than treating it as 0", () => {
    // Otherwise a brand-new measurement reads as a giant improvement.
    expect(safeDelta(null, 90)).toBeNull();
    expect(safeDelta(90, null)).toBeNull();
    expect(safeDelta(undefined, undefined)).toBeNull();
  });

  it("still reports a real difference against a measured 0 baseline", () => {
    expect(safeDelta(0, 5)).toBe(5);
  });
});

describe("foldTail", () => {
  it("leaves a short list untouched but sorted by value", () => {
    const rows = foldTail([{ label: "a", value: 1 }, { label: "b", value: 9 }], 7);
    expect(rows.map((r) => r.label)).toEqual(["b", "a"]);
    expect(rows.every((r) => !r.isOther)).toBe(true);
  });

  it("folds the tail into a single Other row so no 9th colour is needed", () => {
    const rows = foldTail(
      Array.from({ length: 10 }, (_, i) => ({ label: `c${i}`, value: 10 - i })),
      3
    );
    expect(rows).toHaveLength(4);
    expect(rows[3].isOther).toBe(true);
    // 7 + 6 + 5 + 4 + 3 + 2 + 1 = 28
    expect(rows[3].value).toBe(28);
  });

  it("never emits an Other row worth 0", () => {
    const rows = foldTail(
      [
        { label: "a", value: 5 },
        { label: "b", value: 3 },
        { label: "c", value: 0 },
      ],
      2
    );
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.isOther)).toBe(false);
  });
});

describe("formatUpdatedAt / shortenUrl", () => {
  it("returns null rather than a fake date for missing input", () => {
    expect(formatUpdatedAt(null)).toBeNull();
    expect(formatUpdatedAt(undefined)).toBeNull();
    expect(formatUpdatedAt("not a date")).toBeNull();
  });

  it("formats a real date", () => {
    expect(formatUpdatedAt(new Date("2026-08-23T10:00:00Z"))).toContain("2026");
  });

  it("trims a URL to its path but keeps short ones intact", () => {
    expect(shortenUrl("https://example.com/blog/post")).toBe("/blog/post");
    expect(shortenUrl("https://example.com/")).toBe("/");
    expect(shortenUrl("not-a-url")).toBe("not-a-url");
  });

  it("truncates an over-long path with an ellipsis", () => {
    const long = `https://example.com/${"x".repeat(100)}`;
    const result = shortenUrl(long, 20);
    expect(result).toHaveLength(20);
    expect(result.endsWith("…")).toBe(true);
  });
});
