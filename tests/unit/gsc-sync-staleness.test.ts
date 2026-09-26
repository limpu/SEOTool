import { describe, it, expect } from "vitest";
import { isSyncStale } from "@/lib/gsc/queries";

describe("isSyncStale", () => {
  it("true when there has never been a sync", () => {
    expect(isSyncStale(null)).toBe(true);
  });

  it("false immediately after a completed sync", () => {
    const now = new Date("2026-08-22T12:00:00Z");
    const justSynced = new Date("2026-08-22T11:59:00Z");
    expect(isSyncStale(justSynced, 1000 * 60 * 60 * 6, now)).toBe(false);
  });

  it("true once the staleness window has elapsed", () => {
    const now = new Date("2026-08-22T12:00:00Z");
    const longAgo = new Date("2026-08-22T02:00:00Z"); // 10 hours ago
    expect(isSyncStale(longAgo, 1000 * 60 * 60 * 6, now)).toBe(true);
  });

  it("false right at the boundary is not asserted (uses strictly-greater-than), just past it is stale", () => {
    const now = new Date("2026-08-22T12:00:00Z");
    const exactlyStaleAfter = new Date("2026-08-22T06:00:00Z"); // exactly 6h ago
    const justPast = new Date("2026-08-22T05:59:59Z"); // 6h + 1s ago
    expect(isSyncStale(exactlyStaleAfter, 1000 * 60 * 60 * 6, now)).toBe(false);
    expect(isSyncStale(justPast, 1000 * 60 * 60 * 6, now)).toBe(true);
  });
});
