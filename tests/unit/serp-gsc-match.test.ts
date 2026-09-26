import { describe, expect, it } from "vitest";
import { findGscQueryMatch, buildTrend, type GscQueryRow } from "@/lib/serp/queries";
import { SERP_FEATURE_OPTIONS, isValidSerpFeature } from "@/lib/serp/constants";

// Fixtures shaped exactly like `gsc_metrics` rows with dimensionType="query"
// (Phase 26) — this is what a connected GSC sync would have actually
// persisted, per the Phase 27 scoping decision to cross-reference real GSC
// data rather than fabricate any position ourselves.
const fixtureQueries: GscQueryRow[] = [
  { dimensionValue: "best hiking boots", clicks: 42, impressions: 900, ctr: 0.0467, position: 4.2 },
  { dimensionValue: "Waterproof Hiking Boots", clicks: 10, impressions: 500, ctr: 0.02, position: 9.8 },
  { dimensionValue: "trail running shoes", clicks: 0, impressions: 120, ctr: 0, position: 18.3 },
];

describe("findGscQueryMatch", () => {
  it("matches a keyword case-insensitively and exactly", () => {
    const match = findGscQueryMatch(fixtureQueries, "Best Hiking Boots", "2026-07-25", "2026-08-21");
    expect(match).not.toBeNull();
    expect(match?.position).toBeCloseTo(4.2);
    expect(match?.clicks).toBe(42);
    expect(match?.source).toBe("gsc");
    expect(match?.dateRangeStart).toBe("2026-07-25");
    expect(match?.dateRangeEnd).toBe("2026-08-21");
  });

  it("matches regardless of the fixture row's own casing", () => {
    const match = findGscQueryMatch(fixtureQueries, "waterproof hiking boots", "2026-07-25", "2026-08-21");
    expect(match?.clicks).toBe(10);
  });

  it("correctly surfaces a genuine zero-click/zero-CTR row as real data, not a missing match", () => {
    const match = findGscQueryMatch(fixtureQueries, "trail running shoes", "2026-07-25", "2026-08-21");
    expect(match).not.toBeNull();
    expect(match?.clicks).toBe(0);
    expect(match?.ctr).toBe(0);
    expect(match?.position).toBeCloseTo(18.3);
  });

  it("returns null when no query matches (never fabricates a match)", () => {
    const match = findGscQueryMatch(fixtureQueries, "running shorts", "2026-07-25", "2026-08-21");
    expect(match).toBeNull();
  });

  it("returns null against an empty query set (no GSC data synced)", () => {
    const match = findGscQueryMatch([], "best hiking boots", "2026-07-25", "2026-08-21");
    expect(match).toBeNull();
  });

  it("trims surrounding whitespace before comparing", () => {
    const match = findGscQueryMatch(fixtureQueries, "  best hiking boots  ", "2026-07-25", "2026-08-21");
    expect(match).not.toBeNull();
  });
});

describe("buildTrend", () => {
  it("shapes manual rank checks into chronological trend points", () => {
    const trend = buildTrend(
      [
        { id: "1", trackedKeywordId: "k1", checkedByUserId: "u1", checkedDate: "2026-08-10", position: 12, serpFeatures: [], notes: null, createdAt: new Date() },
        { id: "2", trackedKeywordId: "k1", checkedByUserId: "u1", checkedDate: "2026-08-01", position: 18, serpFeatures: [], notes: null, createdAt: new Date() },
      ] as never,
      null
    );
    expect(trend.map((p) => p.date)).toEqual(["2026-08-01", "2026-08-10"]);
    expect(trend.every((p) => p.source === "manual")).toBe(true);
  });

  it("includes a labeled GSC point alongside manual points without conflating sources", () => {
    const trend = buildTrend(
      [
        { id: "1", trackedKeywordId: "k1", checkedByUserId: "u1", checkedDate: "2026-08-01", position: 18, serpFeatures: [], notes: null, createdAt: new Date() },
      ] as never,
      {
        source: "gsc",
        clicks: 5,
        impressions: 200,
        ctr: 0.025,
        position: 6.4,
        dateRangeStart: "2026-07-25",
        dateRangeEnd: "2026-08-21",
      }
    );
    expect(trend).toHaveLength(2);
    const gscPoint = trend.find((p) => p.source === "gsc");
    expect(gscPoint?.date).toBe("2026-08-21");
    expect(gscPoint?.position).toBeCloseTo(6.4);
    const manualPoint = trend.find((p) => p.source === "manual");
    expect(manualPoint?.position).toBe(18);
  });

  it("preserves a null position (not-found manual check) as a distinct point", () => {
    const trend = buildTrend(
      [
        { id: "1", trackedKeywordId: "k1", checkedByUserId: "u1", checkedDate: "2026-08-01", position: null, serpFeatures: [], notes: null, createdAt: new Date() },
      ] as never,
      null
    );
    expect(trend[0].position).toBeNull();
  });

  it("returns an empty trend when there is no manual history and no GSC match", () => {
    expect(buildTrend([], null)).toEqual([]);
  });
});

describe("SERP feature validation", () => {
  it("accepts every option in the checklist", () => {
    for (const f of SERP_FEATURE_OPTIONS) {
      expect(isValidSerpFeature(f)).toBe(true);
    }
  });

  it("rejects an unknown/free-text feature value", () => {
    expect(isValidSerpFeature("made_up_feature")).toBe(false);
    expect(isValidSerpFeature("")).toBe(false);
  });
});
