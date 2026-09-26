import { describe, expect, it } from "vitest";
import { getCurrentPeriodWindow } from "@/lib/rbac/quota";

describe("getCurrentPeriodWindow — day", () => {
  it("returns midnight-to-midnight for the given day", () => {
    const now = new Date(2026, 7, 22, 14, 30, 0); // Aug 22 2026, 14:30
    const { start, end } = getCurrentPeriodWindow("day", now);
    expect(start).toEqual(new Date(2026, 7, 22, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 23, 0, 0, 0));
  });

  it("rolls over correctly at a month boundary", () => {
    const now = new Date(2026, 7, 31, 23, 59, 0); // Aug 31
    const { start, end } = getCurrentPeriodWindow("day", now);
    expect(start).toEqual(new Date(2026, 7, 31, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 8, 1, 0, 0, 0)); // Sep 1
  });
});

describe("getCurrentPeriodWindow — week (ISO, Monday start)", () => {
  it("anchors to Monday when 'now' is a Wednesday", () => {
    // 2026-08-19 is a Wednesday.
    const now = new Date(2026, 7, 19, 10, 0, 0);
    const { start, end } = getCurrentPeriodWindow("week", now);
    expect(start).toEqual(new Date(2026, 7, 17, 0, 0, 0)); // Monday Aug 17
    expect(end).toEqual(new Date(2026, 7, 24, 0, 0, 0)); // next Monday
  });

  it("anchors to the same day when 'now' is already a Monday", () => {
    const now = new Date(2026, 7, 17, 0, 0, 1);
    const { start } = getCurrentPeriodWindow("week", now);
    expect(start).toEqual(new Date(2026, 7, 17, 0, 0, 0));
  });

  it("treats Sunday as the last day of its week, not the start of the next", () => {
    // 2026-08-23 is a Sunday, belongs to the week starting Aug 17.
    const now = new Date(2026, 7, 23, 23, 0, 0);
    const { start, end } = getCurrentPeriodWindow("week", now);
    expect(start).toEqual(new Date(2026, 7, 17, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 24, 0, 0, 0));
  });

  it("rolls over correctly across a month boundary", () => {
    // 2026-08-31 is a Monday.
    const now = new Date(2026, 7, 31, 12, 0, 0);
    const { start, end } = getCurrentPeriodWindow("week", now);
    expect(start).toEqual(new Date(2026, 7, 31, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 8, 7, 0, 0, 0));
  });
});

describe("getCurrentPeriodWindow — month", () => {
  it("returns the 1st of the current month through the 1st of next month", () => {
    const now = new Date(2026, 7, 22, 12, 0, 0); // Aug 22
    const { start, end } = getCurrentPeriodWindow("month", now);
    expect(start).toEqual(new Date(2026, 7, 1, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 8, 1, 0, 0, 0));
  });

  it("rolls over the year at December", () => {
    const now = new Date(2026, 11, 15, 12, 0, 0); // Dec 15 2026
    const { start, end } = getCurrentPeriodWindow("month", now);
    expect(start).toEqual(new Date(2026, 11, 1, 0, 0, 0));
    expect(end).toEqual(new Date(2027, 0, 1, 0, 0, 0)); // Jan 1 2027
  });

  it("handles February in a leap year correctly (2028)", () => {
    const now = new Date(2028, 1, 29, 12, 0, 0); // Feb 29 2028 (leap day)
    const { start, end } = getCurrentPeriodWindow("month", now);
    expect(start).toEqual(new Date(2028, 1, 1, 0, 0, 0));
    expect(end).toEqual(new Date(2028, 2, 1, 0, 0, 0)); // Mar 1 2028
  });

  it("handles February in a non-leap year correctly (2026)", () => {
    const now = new Date(2026, 1, 15, 12, 0, 0);
    const { start, end } = getCurrentPeriodWindow("month", now);
    expect(start).toEqual(new Date(2026, 1, 1, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 2, 1, 0, 0, 0));
  });
});

describe("getCurrentPeriodWindow — lifetime", () => {
  it("always returns the same fixed all-time window regardless of 'now'", () => {
    const w1 = getCurrentPeriodWindow("lifetime", new Date(2020, 0, 1));
    const w2 = getCurrentPeriodWindow("lifetime", new Date(2030, 6, 15));
    expect(w1.start).toEqual(w2.start);
    expect(w1.end).toEqual(w2.end);
    expect(w1.start.getUTCFullYear()).toBe(1970);
  });
});
