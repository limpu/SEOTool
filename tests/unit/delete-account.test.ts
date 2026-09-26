import { describe, it, expect } from "vitest";
import { deleteAccountSchema } from "@/lib/validation/auth";
import { isLastSuperAdmin } from "@/lib/rbac/super-admin-guard";

// Stage 5 — self-service account deletion. These tests exercise the REAL
// production functions (not re-implementations):
//   - `deleteAccountSchema`, the zod schema `DELETE /api/account` validates
//     its body against.
//   - `isLastSuperAdmin`, the pure decision function `wouldRemoveLastSuperAdmin`
//     (imported by the delete-account route) reduces to after querying the
//     real `countActiveSuperAdmins` count — the exact same underlying guard
//     `status/route.ts` and `role/route.ts` already use for "last
//     SUPER_ADMIN" checks on suspend/role-reassign, now shared with delete.
// A full end-to-end DB test (real password check, real SUPER_ADMIN block,
// real cascade deletes) is performed live and documented in read.md's
// Stage 5 write-up, not re-simulated here.

describe("deleteAccountSchema", () => {
  it("accepts a non-empty password", () => {
    const result = deleteAccountSchema.safeParse({ password: "correct horse battery staple" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = deleteAccountSchema.safeParse({ password: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing password field", () => {
    const result = deleteAccountSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a non-string password", () => {
    const result = deleteAccountSchema.safeParse({ password: 12345 });
    expect(result.success).toBe(false);
  });
});

describe("isLastSuperAdmin (last-SUPER_ADMIN guard, shared with suspend/role-reassign)", () => {
  it("is false for a non-SUPER_ADMIN user regardless of count", () => {
    expect(isLastSuperAdmin(false, 1)).toBe(false);
    expect(isLastSuperAdmin(false, 0)).toBe(false);
  });

  it("blocks deletion when the user is the ONLY active SUPER_ADMIN", () => {
    expect(isLastSuperAdmin(true, 1)).toBe(true);
  });

  it("allows deletion when other active SUPER_ADMINs remain", () => {
    expect(isLastSuperAdmin(true, 2)).toBe(false);
    expect(isLastSuperAdmin(true, 5)).toBe(false);
  });

  it("blocks (fails closed) on a count of 0, an inconsistent-but-unsafe state", () => {
    expect(isLastSuperAdmin(true, 0)).toBe(true);
  });
});
