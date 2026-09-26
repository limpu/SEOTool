import { describe, expect, it } from "vitest";

import {
  POSITION_LOWER_IS_BETTER,
  describePositionMovement,
  overallCtr,
  positionBucket,
  positionDistribution,
  summarisePositionTrend,
  weightedAveragePosition,
} from "@/components/report/position";
import { describeDelta } from "@/components/charts/format";

/**
 * Stage 3B — POSITION INVERSION.
 *
 * Search position is an inverted scale: 15 → 8 is an IMPROVEMENT, 8 → 15 is a
 * DECLINE. Getting it backwards inverts the meaning of the whole Keywords and
 * Search Console report, so it is asserted here explicitly, in both
 * directions, at every layer it passes through — the primitive delta helper,
 * the position wrapper, and the trend summary a page actually renders.
 */

describe("position inversion — the load-bearing rule", () => {
  it("treats 15 → 8 as an improvement", () => {
    const movement = describePositionMovement(15, 8);
    expect(movement).not.toBeNull();
    expect(movement!.improvement).toBe(true);
    expect(movement!.direction).toBe("improved");
    expect(movement!.movedUp).toBe(true);
    expect(movement!.places).toBe(7);
    // The RAW delta is negative — the number fell, and that is the good case.
    expect(movement!.delta).toBe(-7);
    expect(movement!.label).toBe("Up 7 places");
    expect(movement!.description).toContain("Improved from position 15 to 8");
    expect(movement!.description).toContain("lower is better");
  });

  it("treats 8 → 15 as a decline", () => {
    const movement = describePositionMovement(8, 15);
    expect(movement).not.toBeNull();
    expect(movement!.improvement).toBe(false);
    expect(movement!.direction).toBe("declined");
    expect(movement!.movedUp).toBe(false);
    expect(movement!.places).toBe(7);
    expect(movement!.delta).toBe(7);
    expect(movement!.label).toBe("Down 7 places");
    expect(movement!.description).toContain("Declined from position 8 to 15");
  });

  it("is exactly the mirror image of itself", () => {
    const up = describePositionMovement(15, 8)!;
    const down = describePositionMovement(8, 15)!;
    expect(up.improvement).toBe(!down.improvement);
    expect(up.delta).toBe(-down.delta);
    expect(up.places).toBe(down.places);
  });

  it("never reports a position gain as a loss for a fractional average position", () => {
    // Search Console average positions are fractional; 12.4 → 9.6 is still an improvement.
    const movement = describePositionMovement(12.4, 9.6)!;
    expect(movement.improvement).toBe(true);
    expect(movement.places).toBeCloseTo(2.8, 5);
    expect(movement.label).toBe("Up 2.8 places");
  });

  it("agrees with describeDelta's lowerIsBetter flag rather than re-deriving the sign", () => {
    // The shared primitive is the single source of truth; this pins the wiring.
    expect(POSITION_LOWER_IS_BETTER).toBe(true);
    const primitive = describeDelta(8 - 15, { lowerIsBetter: POSITION_LOWER_IS_BETTER, decimals: 1 })!;
    expect(primitive.improvement).toBe(true);
    expect(primitive.direction).toBe("down");
    expect(describePositionMovement(15, 8)!.improvement).toBe(primitive.improvement);

    // And without the flag the SAME delta reads as a worsening — which is
    // precisely the bug this whole module exists to prevent.
    expect(describeDelta(8 - 15, { lowerIsBetter: false })!.improvement).toBe(false);
  });

  it("reports an unchanged position as a real, measured 'No change'", () => {
    const movement = describePositionMovement(8, 8)!;
    expect(movement.direction).toBe("unchanged");
    expect(movement.improvement).toBe(false);
    expect(movement.places).toBe(0);
    expect(movement.label).toBe("No change");
  });

  it("returns no movement at all when either side is missing", () => {
    expect(describePositionMovement(null, 8)).toBeNull();
    expect(describePositionMovement(8, null)).toBeNull();
    expect(describePositionMovement(null, null)).toBeNull();
    expect(describePositionMovement(undefined, 8)).toBeNull();
    expect(describePositionMovement(Number.NaN, 8)).toBeNull();
  });

  it("does not treat a missing position as position 0", () => {
    // Position 0 does not exist on this scale, and a "not found" observation
    // must never be coerced into one — that would read as ranking first.
    const fabricated = describePositionMovement(15, 0);
    const honest = describePositionMovement(15, null);
    expect(fabricated).not.toBeNull();
    expect(honest).toBeNull();
  });

  it("uses one place / places correctly", () => {
    expect(describePositionMovement(2, 1)!.label).toBe("Up 1 place");
    expect(describePositionMovement(1, 3)!.label).toBe("Down 2 places");
  });
});

describe("positionBucket", () => {
  it("buckets real positions by the industry boundaries", () => {
    expect(positionBucket(1)).toBe("top3");
    expect(positionBucket(3)).toBe("top3");
    expect(positionBucket(3.4)).toBe("top10");
    expect(positionBucket(10)).toBe("top10");
    expect(positionBucket(10.1)).toBe("top20");
    expect(positionBucket(20)).toBe("top20");
    expect(positionBucket(21)).toBe("top50");
    expect(positionBucket(50)).toBe("top50");
    expect(positionBucket(50.1)).toBe("beyond50");
    expect(positionBucket(400)).toBe("beyond50");
  });

  it("sends a missing position to 'unranked', never to 'beyond50'", () => {
    expect(positionBucket(null)).toBe("unranked");
    expect(positionBucket(undefined)).toBe("unranked");
    expect(positionBucket(Number.NaN)).toBe("unranked");
    expect(positionBucket(null)).not.toBe("beyond50");
  });
});

describe("positionDistribution", () => {
  it("keeps measured zeros visible for every ranked bucket", () => {
    const rows = positionDistribution([12, 14, 15]);
    expect(rows.map((r) => r.key)).toEqual(["top3", "top10", "top20", "top50", "beyond50"]);
    expect(rows.find((r) => r.key === "top3")!.count).toBe(0);
    expect(rows.find((r) => r.key === "top20")!.count).toBe(3);
  });

  it("omits the 'unranked' bucket unless something is genuinely unranked", () => {
    expect(positionDistribution([1, 2]).some((r) => r.key === "unranked")).toBe(false);
    const withMissing = positionDistribution([1, null]);
    expect(withMissing.find((r) => r.key === "unranked")!.count).toBe(1);
  });

  it("counts an empty input as all-zero, not as no buckets", () => {
    const rows = positionDistribution([]);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.count === 0)).toBe(true);
  });

  it("matches the live Drs Derma query distribution", () => {
    // 122 / 163 / 82 / 70 / 63 across 500 synced query rows.
    const positions = [
      ...Array<number>(122).fill(2),
      ...Array<number>(163).fill(7),
      ...Array<number>(82).fill(15),
      ...Array<number>(70).fill(30),
      ...Array<number>(63).fill(80),
    ];
    expect(positionDistribution(positions).map((r) => r.count)).toEqual([122, 163, 82, 70, 63]);
  });
});

describe("weightedAveragePosition", () => {
  it("weights by impressions, not by row count", () => {
    // A single 100-impression query at position 2 must dominate a 1-impression
    // query at position 90 — a plain mean would report 46.
    const weighted = weightedAveragePosition([
      { position: 2, impressions: 100 },
      { position: 90, impressions: 1 },
    ])!;
    expect(weighted).toBeCloseTo((2 * 100 + 90) / 101, 6);
    expect(weighted).toBeLessThan(3);
  });

  it("returns null rather than 0 when nothing can be weighted", () => {
    expect(weightedAveragePosition([])).toBeNull();
    expect(weightedAveragePosition([{ position: 5, impressions: 0 }])).toBeNull();
  });

  it("skips non-finite rows without poisoning the average", () => {
    const weighted = weightedAveragePosition([
      { position: Number.NaN, impressions: 10 },
      { position: 4, impressions: 10 },
    ]);
    expect(weighted).toBe(4);
  });
});

describe("overallCtr", () => {
  it("returns a real measured zero when there were impressions but no clicks", () => {
    expect(overallCtr(0, 500)).toBe(0);
  });

  it("returns null — not 0 — when there were no impressions at all", () => {
    expect(overallCtr(0, 0)).toBeNull();
  });

  it("matches the live Drs Derma query totals", () => {
    // 107 clicks / 3,131 impressions == 3.42%.
    expect(((overallCtr(107, 3131) ?? 0) * 100).toFixed(2)).toBe("3.42");
  });
});

describe("summarisePositionTrend", () => {
  const base = { source: "manual" as const };

  it("compares the two most recent MEASURED observations, in date order", () => {
    const summary = summarisePositionTrend([
      { ...base, date: "2026-03-01", position: 20 },
      { ...base, date: "2026-01-01", position: 15 },
      { ...base, date: "2026-02-01", position: 8 },
    ]);
    expect(summary.previous!.date).toBe("2026-02-01");
    expect(summary.latest!.date).toBe("2026-03-01");
    // 8 → 20 is a decline of 12 places.
    expect(summary.movement!.improvement).toBe(false);
    expect(summary.movement!.places).toBe(12);
  });

  it("skips 'not found' observations when comparing, but still counts them", () => {
    const summary = summarisePositionTrend([
      { ...base, date: "2026-01-01", position: 15 },
      { ...base, date: "2026-02-01", position: null },
      { ...base, date: "2026-03-01", position: 8 },
    ]);
    expect(summary.totalCount).toBe(3);
    expect(summary.measuredCount).toBe(2);
    expect(summary.movement!.improvement).toBe(true);
    expect(summary.movement!.places).toBe(7);
  });

  it("reports no movement and no best/worst with a single measurement", () => {
    const summary = summarisePositionTrend([{ ...base, date: "2026-01-01", position: 9 }]);
    expect(summary.movement).toBeNull();
    expect(summary.previous).toBeNull();
    expect(summary.best).toBe(9);
    expect(summary.worst).toBe(9);
    expect(summary.measuredCount).toBe(1);
  });

  it("reports nothing at all when every observation is 'not found'", () => {
    // This is the live Free Bangla Tutorial case: one logged check, no position.
    const summary = summarisePositionTrend([{ ...base, date: "2026-08-23", position: null }]);
    expect(summary.latest).toBeNull();
    expect(summary.movement).toBeNull();
    expect(summary.best).toBeNull();
    expect(summary.worst).toBeNull();
    expect(summary.measuredCount).toBe(0);
    expect(summary.totalCount).toBe(1);
  });

  it("keeps best as the LOWEST number, because lower is better", () => {
    const summary = summarisePositionTrend([
      { ...base, date: "2026-01-01", position: 30 },
      { ...base, date: "2026-02-01", position: 4 },
      { ...base, date: "2026-03-01", position: 11 },
    ]);
    expect(summary.best).toBe(4);
    expect(summary.worst).toBe(30);
  });

  it("compares across sources without conflating them", () => {
    const summary = summarisePositionTrend([
      { date: "2026-01-01", position: 15, source: "manual" },
      { date: "2026-02-01", position: 9.6, source: "gsc" },
    ]);
    expect(summary.latest!.source).toBe("gsc");
    expect(summary.previous!.source).toBe("manual");
    expect(summary.movement!.improvement).toBe(true);
  });
});
