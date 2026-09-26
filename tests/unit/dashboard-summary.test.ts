import { describe, it, expect } from "vitest";
import { pctChange } from "@/lib/dashboard/summary";

describe("pctChange", () => {
  it("returns null when either side is missing — never a fabricated 0%", () => {
    expect(pctChange(null, 80, false)).toBeNull();
    expect(pctChange(80, null, false)).toBeNull();
    expect(pctChange(null, null, false)).toBeNull();
  });

  it("returns null when before is 0 (division by zero guard)", () => {
    expect(pctChange(0, 10, false)).toBeNull();
  });

  it("computes a positive % change for a score-like metric improving (not inverted)", () => {
    // Site Health / AI Visibility: higher after-value = improvement = positive %.
    expect(pctChange(60, 90, false)).toBe(50);
  });

  it("computes a negative % change for a score-like metric regressing (not inverted)", () => {
    expect(pctChange(90, 60, false)).toBeCloseTo(-33.3, 1);
  });

  it("INVERTS sign for Position: a lower after-value (ranking improvement) shows as a POSITIVE change", () => {
    // Position went from 20 -> 10: a real ranking improvement. Raw (after-before)/before
    // would be negative (-50%), but Position is an inverted-scale metric so the
    // displayed change must be positive/green.
    expect(pctChange(20, 10, true)).toBe(50);
  });

  it("INVERTS sign for Position: a higher after-value (ranking regression) shows as a NEGATIVE change", () => {
    // Position went from 10 -> 20: a real ranking regression, must render negative/red.
    expect(pctChange(10, 20, true)).toBe(-100);
  });

  it("Position at exact parity yields 0, not null and not a fabricated sign", () => {
    expect(pctChange(15, 15, true)).toBeCloseTo(0, 5);
  });
});
