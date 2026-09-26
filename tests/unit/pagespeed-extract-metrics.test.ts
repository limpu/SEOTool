import { describe, it, expect } from "vitest";
import { extractPageSpeedMetrics, trimLighthouseResult, type LighthouseResultLike } from "@/lib/pagespeed/extract-metrics";

// This is a hand-built fixture matching the SHAPE of a real Lighthouse
// Result (LHR) — the fields extract-metrics.ts reads from an actual
// `lighthouse()` call's output. It is NOT a live Lighthouse run; live
// verification of the real integration is documented separately in
// read.md (Phase 20 write-up).
function sampleLhr(overrides: Partial<LighthouseResultLike> = {}): LighthouseResultLike {
  return {
    lighthouseVersion: "13.4.1",
    categories: {
      performance: { score: 0.42 },
      accessibility: { score: 0.96 },
      "best-practices": { score: 0.89 },
      seo: { score: 1 },
    },
    audits: {
      "largest-contentful-paint": { numericValue: 3200 },
      "cumulative-layout-shift": { numericValue: 0.25 },
      "first-contentful-paint": { numericValue: 1200 },
      "total-blocking-time": { numericValue: 450 },
      "speed-index": { numericValue: 4100 },
      "server-response-time": { numericValue: 320 },
    },
    ...overrides,
  };
}

describe("extractPageSpeedMetrics", () => {
  it("converts category scores from 0-1 to 0-100", () => {
    const m = extractPageSpeedMetrics(sampleLhr());
    expect(m.performanceScore).toBe(42);
    expect(m.accessibilityScore).toBe(96);
    expect(m.bestPracticesScore).toBe(89);
    expect(m.seoScore).toBe(100);
  });

  it("extracts the headline Core Web Vitals + supporting metrics", () => {
    const m = extractPageSpeedMetrics(sampleLhr());
    expect(m.lcp).toBe(3200);
    expect(m.cls).toBe(0.25);
    expect(m.fcp).toBe(1200);
    expect(m.tbt).toBe(450);
    expect(m.speedIndex).toBe(4100);
    expect(m.ttfb).toBe(320);
  });

  it("reports null (not 0) for a metric that isn't present in the audits", () => {
    const m = extractPageSpeedMetrics(sampleLhr({ audits: {} }));
    expect(m.lcp).toBeNull();
    expect(m.cls).toBeNull();
    expect(m.inp).toBeNull();
  });

  it("reports null for a category score of null (Lighthouse reports null when a category errors out)", () => {
    const m = extractPageSpeedMetrics(
      sampleLhr({ categories: { performance: { score: null } } })
    );
    expect(m.performanceScore).toBeNull();
  });

  it("falls back to the experimental INP audit key when the stable one is absent", () => {
    const m = extractPageSpeedMetrics(
      sampleLhr({
        audits: { "experimental-interaction-to-next-paint": { numericValue: 180 } },
      })
    );
    expect(m.inp).toBe(180);
  });

  it("carries through the lighthouse version", () => {
    const m = extractPageSpeedMetrics(sampleLhr());
    expect(m.lighthouseVersion).toBe("13.4.1");
  });
});

describe("trimLighthouseResult", () => {
  it("keeps only the allow-listed audits, dropping everything else", () => {
    const lhr = sampleLhr({
      audits: {
        "largest-contentful-paint": { numericValue: 3200 },
        "network-requests": { numericValue: 999 }, // not in the keep-list
      },
    }) as LighthouseResultLike & Record<string, unknown>;
    const trimmed = trimLighthouseResult(lhr);
    expect(trimmed.audits).toHaveProperty("largest-contentful-paint");
    expect(trimmed.audits).not.toHaveProperty("network-requests");
  });

  it("preserves the category scores in full", () => {
    const lhr = sampleLhr() as LighthouseResultLike & Record<string, unknown>;
    const trimmed = trimLighthouseResult(lhr);
    expect(trimmed.categories).toEqual(lhr.categories);
  });
});
