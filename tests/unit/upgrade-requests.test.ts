import { describe, it, expect } from "vitest";
import { upgradeRequestBodySchema } from "@/app/api/account/upgrade-requests/route";
import { DuplicatePendingRequestError, InvalidRequestedPackageError } from "@/lib/rbac/upgrade-requests";

describe("upgradeRequestBodySchema", () => {
  it("accepts a valid UUID requestedPackageId", () => {
    const result = upgradeRequestBodySchema.safeParse({ requestedPackageId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing requestedPackageId", () => {
    const result = upgradeRequestBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID requestedPackageId (never trusts an arbitrary client string as a real package id)", () => {
    const result = upgradeRequestBodySchema.safeParse({ requestedPackageId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty-string requestedPackageId", () => {
    const result = upgradeRequestBodySchema.safeParse({ requestedPackageId: "" });
    expect(result.success).toBe(false);
  });
});

describe("upgrade-request error classes", () => {
  it("DuplicatePendingRequestError carries an honest, actionable message", () => {
    const err = new DuplicatePendingRequestError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/pending upgrade request/i);
    expect(err.name).toBe("DuplicatePendingRequestError");
  });

  it("InvalidRequestedPackageError carries an honest, actionable message", () => {
    const err = new InvalidRequestedPackageError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/active package/i);
    expect(err.name).toBe("InvalidRequestedPackageError");
  });
});
