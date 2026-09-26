import { describe, expect, it } from "vitest";
import {
  createAdminUserSchema,
  updateAdminUserSchema,
  setUserStatusSchema,
  assignRolesSchema,
  assignSubscriptionSchema,
} from "@/lib/validation/admin-user";

describe("createAdminUserSchema", () => {
  it("accepts a valid payload", () => {
    const result = createAdminUserSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "correcthorsebatterystaple",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a short password", () => {
    const result = createAdminUserSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = createAdminUserSchema.safeParse({
      name: "Ada",
      email: "not-an-email",
      password: "correcthorsebatterystaple",
    });
    expect(result.success).toBe(false);
  });

  it("lowercases and trims email", () => {
    const result = createAdminUserSchema.safeParse({
      name: "Ada",
      email: "  ADA@Example.com  ",
      password: "correcthorsebatterystaple",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ada@example.com");
    }
  });

  it("rejects an invalid roleId", () => {
    const result = createAdminUserSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      password: "correcthorsebatterystaple",
      roleId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid v4 UUID roleId", () => {
    const result = createAdminUserSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      password: "correcthorsebatterystaple",
      roleId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateAdminUserSchema", () => {
  it("requires both name and email", () => {
    expect(updateAdminUserSchema.safeParse({ name: "Ada" }).success).toBe(false);
    expect(
      updateAdminUserSchema.safeParse({ name: "Ada", email: "ada@example.com" }).success
    ).toBe(true);
  });
});

describe("setUserStatusSchema", () => {
  it("only accepts active or suspended (not deleted, not arbitrary strings)", () => {
    expect(setUserStatusSchema.safeParse({ status: "active" }).success).toBe(true);
    expect(setUserStatusSchema.safeParse({ status: "suspended" }).success).toBe(true);
    expect(setUserStatusSchema.safeParse({ status: "deleted" }).success).toBe(false);
    expect(setUserStatusSchema.safeParse({ status: "bogus" }).success).toBe(false);
  });
});

describe("assignRolesSchema", () => {
  it("requires every entry to be a UUID", () => {
    expect(assignRolesSchema.safeParse({ roleIds: ["not-a-uuid"] }).success).toBe(false);
    expect(
      assignRolesSchema.safeParse({ roleIds: ["3fa85f64-5717-4562-b3fc-2c963f66afa6"] }).success
    ).toBe(true);
  });

  it("accepts multiple role ids (multi-role assignment, Phase 15)", () => {
    const result = assignRolesSchema.safeParse({
      roleIds: [
        "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "4fa85f64-5717-4562-b3fc-2c963f66afa7",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty array (no roles)", () => {
    expect(assignRolesSchema.safeParse({ roleIds: [] }).success).toBe(true);
  });
});

describe("assignSubscriptionSchema", () => {
  it("normalizes an empty string to null", () => {
    const result = assignSubscriptionSchema.safeParse({ subscriptionPackage: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subscriptionPackage).toBeNull();
    }
  });

  it("accepts a package name", () => {
    const result = assignSubscriptionSchema.safeParse({ subscriptionPackage: "PRO" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subscriptionPackage).toBe("PRO");
    }
  });

  it("accepts an omitted field", () => {
    expect(assignSubscriptionSchema.safeParse({}).success).toBe(true);
  });
});
