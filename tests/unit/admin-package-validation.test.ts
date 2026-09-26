import { describe, expect, it } from "vitest";
import {
  packageFormSchema,
  packageFeaturesFormSchema,
  assignPackageSchema,
} from "@/lib/validation/admin-package";
import { FEATURE_KEYS } from "@/lib/rbac/feature-catalog";

describe("packageFormSchema", () => {
  it("accepts a valid package", () => {
    const result = packageFormSchema.safeParse({
      name: "PRO",
      description: "For growing teams.",
      price: 49.99,
      currency: "usd",
      billingPeriod: "monthly",
      status: "active",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // currency is normalized to uppercase
      expect(result.data.currency).toBe("USD");
    }
  });

  it("rejects an empty name", () => {
    const result = packageFormSchema.safeParse({
      name: "",
      price: 0,
      currency: "USD",
      billingPeriod: "monthly",
      status: "active",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative price", () => {
    const result = packageFormSchema.safeParse({
      name: "FREE",
      price: -1,
      currency: "USD",
      billingPeriod: "monthly",
      status: "active",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a currency that isn't a 3-letter code", () => {
    const result = packageFormSchema.safeParse({
      name: "PRO",
      price: 10,
      currency: "US",
      billingPeriod: "monthly",
      status: "active",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a billing period outside the fixed set", () => {
    const result = packageFormSchema.safeParse({
      name: "PRO",
      price: 10,
      currency: "USD",
      billingPeriod: "weekly",
      status: "active",
    });
    expect(result.success).toBe(false);
  });

  it("normalizes an empty description to null", () => {
    const result = packageFormSchema.safeParse({
      name: "STARTER",
      description: "   ",
      price: 9,
      currency: "USD",
      billingPeriod: "monthly",
      status: "active",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeNull();
    }
  });

  it("accepts a one-time billing period and inactive status", () => {
    const result = packageFormSchema.safeParse({
      name: "LIFETIME",
      price: 499,
      currency: "USD",
      billingPeriod: "one_time",
      status: "inactive",
    });
    expect(result.success).toBe(true);
  });
});

describe("packageFeaturesFormSchema", () => {
  it("accepts a full ON/OFF grid over every catalog feature", () => {
    const result = packageFeaturesFormSchema.safeParse({
      features: FEATURE_KEYS.map((featureKey, i) => ({ featureKey, enabled: i % 2 === 0 })),
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty features array (nothing toggled on)", () => {
    expect(packageFeaturesFormSchema.safeParse({ features: [] }).success).toBe(true);
  });

  it("rejects a feature key not in the catalog", () => {
    const result = packageFeaturesFormSchema.safeParse({
      features: [{ featureKey: "not_a_real_feature", enabled: true }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-boolean enabled value", () => {
    const result = packageFeaturesFormSchema.safeParse({
      features: [{ featureKey: FEATURE_KEYS[0], enabled: "yes" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("assignPackageSchema", () => {
  it("accepts a valid uuid packageId", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const result = assignPackageSchema.safeParse({ packageId: uuid });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.packageId).toBe(uuid);
    }
  });

  it("normalizes null/undefined/empty-string packageId to null (clears assignment)", () => {
    expect(assignPackageSchema.safeParse({ packageId: null }).success).toBe(true);
    expect(assignPackageSchema.safeParse({}).success).toBe(true);
    const result = assignPackageSchema.safeParse({ packageId: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.packageId).toBeNull();
    }
  });

  it("rejects a non-uuid packageId", () => {
    const result = assignPackageSchema.safeParse({ packageId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
