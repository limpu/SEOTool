import { describe, expect, it } from "vitest";
import { FEATURE_CATALOG, FEATURE_KEYS, PERMISSION_ACTIONS } from "@/lib/rbac/feature-catalog";

describe("FEATURE_CATALOG", () => {
  it("has unique feature keys", () => {
    const unique = new Set(FEATURE_KEYS);
    expect(unique.size).toBe(FEATURE_KEYS.length);
  });

  it("includes the users and roles features required for admin RBAC", () => {
    expect(FEATURE_KEYS).toContain("users");
    expect(FEATURE_KEYS).toContain("roles");
  });

  it("gives every feature a non-empty name and description", () => {
    for (const f of FEATURE_CATALOG) {
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it("has unique, non-negative sort orders", () => {
    const orders = FEATURE_CATALOG.map((f) => f.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
    for (const o of orders) expect(o).toBeGreaterThanOrEqual(0);
  });
});

describe("PERMISSION_ACTIONS", () => {
  it("matches read-v2.md section 11's fixed initial action set", () => {
    expect(PERMISSION_ACTIONS).toEqual(["view", "create", "edit", "delete", "export"]);
  });
});
