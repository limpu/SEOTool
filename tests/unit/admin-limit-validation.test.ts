import { describe, expect, it } from "vitest";
import { limitDefinitionFormSchema, packageLimitFormSchema } from "@/lib/validation/admin-limit";

describe("limitDefinitionFormSchema", () => {
  it("accepts a valid limit definition", () => {
    const result = limitDefinitionFormSchema.safeParse({
      key: "max_websites",
      name: "Maximum Websites",
      description: "Total websites a user may add.",
      unit: "count",
      periodType: "lifetime",
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty key", () => {
    expect(
      limitDefinitionFormSchema.safeParse({ key: "", name: "X", unit: "count", periodType: "month", active: true })
        .success
    ).toBe(false);
  });

  it("rejects a key with spaces or uppercase letters", () => {
    expect(
      limitDefinitionFormSchema.safeParse({
        key: "Max Websites",
        name: "X",
        unit: "count",
        periodType: "month",
        active: true,
      }).success
    ).toBe(false);
  });

  it("rejects a period type outside the fixed set", () => {
    expect(
      limitDefinitionFormSchema.safeParse({
        key: "max_websites",
        name: "X",
        unit: "count",
        periodType: "yearly",
        active: true,
      }).success
    ).toBe(false);
  });

  it("normalizes an empty description to null", () => {
    const result = limitDefinitionFormSchema.safeParse({
      key: "max_reports",
      name: "Maximum Reports",
      description: "   ",
      unit: "count",
      periodType: "month",
      active: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeNull();
  });

  it("defaults unit to 'count' and periodType to 'month' when omitted", () => {
    const result = limitDefinitionFormSchema.safeParse({ key: "max_x", name: "X", active: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unit).toBe("count");
      expect(result.data.periodType).toBe("month");
    }
  });
});

describe("packageLimitFormSchema", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";

  it("accepts a numeric limit value", () => {
    const result = packageLimitFormSchema.safeParse({ limitDefinitionId: uuid, limitValue: 50, periodType: "month" });
    expect(result.success).toBe(true);
  });

  it("accepts a null limit value (unlimited)", () => {
    const result = packageLimitFormSchema.safeParse({
      limitDefinitionId: uuid,
      limitValue: null,
      periodType: "lifetime",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limitValue).toBeNull();
  });

  it("rejects a negative limit value", () => {
    expect(
      packageLimitFormSchema.safeParse({ limitDefinitionId: uuid, limitValue: -1, periodType: "month" }).success
    ).toBe(false);
  });

  it("rejects a non-integer limit value", () => {
    expect(
      packageLimitFormSchema.safeParse({ limitDefinitionId: uuid, limitValue: 3.5, periodType: "month" }).success
    ).toBe(false);
  });

  it("rejects an invalid limitDefinitionId", () => {
    expect(
      packageLimitFormSchema.safeParse({ limitDefinitionId: "not-a-uuid", limitValue: 10, periodType: "month" })
        .success
    ).toBe(false);
  });

  it("rejects a period type outside the fixed set", () => {
    expect(
      packageLimitFormSchema.safeParse({ limitDefinitionId: uuid, limitValue: 10, periodType: "yearly" }).success
    ).toBe(false);
  });
});
