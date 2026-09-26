import { describe, expect, it } from "vitest";
import { roleFormSchema } from "@/lib/validation/admin-role";
import { deriveRoleKey } from "@/lib/rbac/role-admin";
import { FEATURE_KEYS, PERMISSION_ACTIONS } from "@/lib/rbac/feature-catalog";

describe("roleFormSchema", () => {
  it("accepts a valid role with a partial permission matrix", () => {
    const result = roleFormSchema.safeParse({
      name: "SEO Manager",
      description: "Manages SEO modules only.",
      permissions: [{ featureKey: "site_audit", actions: ["view", "edit"] }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(roleFormSchema.safeParse({ name: "", permissions: [] }).success).toBe(false);
  });

  it("rejects a feature key not in the catalog", () => {
    const result = roleFormSchema.safeParse({
      name: "Bad Role",
      permissions: [{ featureKey: "not_a_real_feature", actions: ["view"] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an action outside the fixed action set", () => {
    const result = roleFormSchema.safeParse({
      name: "Bad Role",
      permissions: [{ featureKey: FEATURE_KEYS[0], actions: ["fly"] }],
    });
    expect(result.success).toBe(false);
  });

  it("normalizes an empty description to null", () => {
    const result = roleFormSchema.safeParse({ name: "Analyst", description: "  ", permissions: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeNull();
    }
  });

  it("accepts a full grant across every action", () => {
    const result = roleFormSchema.safeParse({
      name: "Full Grant",
      permissions: FEATURE_KEYS.map((featureKey) => ({ featureKey, actions: [...PERMISSION_ACTIONS] })),
    });
    expect(result.success).toBe(true);
  });
});

describe("deriveRoleKey", () => {
  it("uppercases and underscores a display name", () => {
    expect(deriveRoleKey("SEO Manager")).toBe("SEO_MANAGER");
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(deriveRoleKey("  Content   Editor! ")).toBe("CONTENT_EDITOR");
  });

  it("trims leading/trailing underscores produced by symbols", () => {
    expect(deriveRoleKey("--Analyst--")).toBe("ANALYST");
  });
});
