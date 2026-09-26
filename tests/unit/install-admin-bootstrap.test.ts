import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateAdminCreationAllowed, installAdminSchema } from "@/lib/install/actions/admin";

/**
 * Web Installer — Stage 2. Creating the first SUPER_ADMIN, and refusing to
 * create a second.
 *
 * The refusal is the second, independent safety net in Stage 1's security
 * model: even if the installation lock somehow read `not_complete` on a live
 * system, the installer still could not mint an administrator alongside
 * existing ones, so it can never become an authentication bypass for a
 * running platform. Its most important property is that an UNKNOWN count is
 * not a zero count.
 */

describe("install/admin — the refusal policy", () => {
  it("allows creation only when the database says there are exactly zero SUPER_ADMINs", () => {
    const d = evaluateAdminCreationAllowed(0);
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("ok");
  });

  it("REFUSES when an administrator already exists — never creates a second, never replaces one", () => {
    const d = evaluateAdminCreationAllowed(1);
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("admin_exists");
    expect(d.httpStatus).toBe(409);
    expect(d.message).toMatch(/FIRST administrator only/);
    expect(d.howToFix.join(" ")).toMatch(/Admin → Users|password-reset/);
  });

  it("refuses just as firmly with many existing administrators", () => {
    expect(evaluateAdminCreationAllowed(7).allowed).toBe(false);
  });

  it("AN UNKNOWN COUNT IS NEVER TREATED AS ZERO — it fails closed with 503", () => {
    const d = evaluateAdminCreationAllowed(null);
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("posture_unknown");
    expect(d.httpStatus).toBe(503);
    // The reason matters: this is the branch that would otherwise turn a
    // brief database outage into a free administrator on a live platform.
    expect(d.message).toMatch(/never treated as zero/i);
  });
});

describe("install/admin — validation reuses the application's own rules", () => {
  const base = { name: "Ops", email: "ADMIN@Example.com ", password: "Str0ngPass", confirmPassword: "Str0ngPass" };

  it("accepts a valid account and normalises the email exactly as registration does", () => {
    const r = installAdminSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("admin@example.com");
  });

  it("rejects a weak password with the shared passwordSchema's own messages", () => {
    for (const password of ["short", "alllowercase1", "ALLUPPERCASE1", "NoDigitsHere"]) {
      const r = installAdminSchema.safeParse({ ...base, password, confirmPassword: password });
      expect(r.success).toBe(false);
    }
  });

  it("rejects a mismatched confirmation", () => {
    const r = installAdminSchema.safeParse({ ...base, confirmPassword: "Different1" });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(installAdminSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
  });
});

/**
 * `createFirstAdmin` against a fully mocked data layer. The assertions here
 * are about the ORDER of the guarantees — refuse before writing, verify after
 * writing, and never let the plaintext password into any payload.
 */
describe("install/admin — createFirstAdmin", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/install/checks");
    vi.doUnmock("@/lib/rbac/seed");
    vi.doUnmock("@/lib/rbac/queries");
    vi.restoreAllMocks();
  });

  async function load(opts: {
    superAdminCount: number | null;
    roleExists?: boolean;
    insertThrows?: unknown;
    verified?: boolean;
  }) {
    const inserted: Record<string, unknown>[] = [];
    vi.doMock("@/lib/install/checks", () => ({
      collectAdminPosture: vi.fn().mockResolvedValue({
        userCount: opts.superAdminCount,
        superAdminCount: opts.superAdminCount,
      }),
    }));
    vi.doMock("@/lib/rbac/seed", () => ({
      ensureRbacSeed: vi.fn().mockResolvedValue(undefined),
      SUPER_ADMIN_ROLE_KEY: "SUPER_ADMIN",
      USER_ROLE_KEY: "USER",
    }));
    vi.doMock("@/lib/rbac/queries", () => ({
      isSuperAdmin: vi.fn().mockResolvedValue(opts.verified ?? true),
    }));
    vi.doMock("@/lib/db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => ((opts.roleExists ?? true) ? [{ id: "role-1" }] : []),
            }),
          }),
        }),
        insert: () => ({
          values: (v: Record<string, unknown>) => {
            inserted.push(v);
            if (opts.insertThrows && "passwordHash" in v) throw opts.insertThrows;
            return {
              returning: async () => [{ id: "user-1" }],
              then: (r: (x: unknown) => unknown) => Promise.resolve(undefined).then(r),
            };
          },
        }),
      },
    }));
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await import("@/lib/install/actions/admin");
    return { mod, inserted };
  }

  const input = {
    name: "Ops",
    email: "admin@example.com",
    password: "Str0ngPass",
    confirmPassword: "Str0ngPass",
  };

  it("creates the account, marks it email-verified, and VERIFIES the role landed", async () => {
    const { mod, inserted } = await load({ superAdminCount: 0 });
    const res = await mod.createFirstAdmin(input);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.userId).toBe("user-1");
    expect(res.superAdminVerified).toBe(true);

    const userRow = inserted.find((r) => "passwordHash" in r)!;
    // Pre-verified so the account can sign in without an SMTP-delivered code —
    // SMTP is optional and is frequently not configured at this moment.
    expect(userRow.emailVerified).toBe(true);
    expect(userRow.emailVerifiedAt).toBeInstanceOf(Date);
    // The stored value is a bcrypt hash, never the plaintext.
    expect(String(userRow.passwordHash)).toMatch(/^\$2[aby]\$/);
    expect(String(userRow.passwordHash)).not.toContain("Str0ngPass");
    // The role was assigned through the existing user_roles table.
    expect(inserted.some((r) => r.roleId === "role-1" && r.userId === "user-1")).toBe(true);
  });

  it("REFUSES BEFORE WRITING ANYTHING when an administrator already exists", async () => {
    const { mod, inserted } = await load({ superAdminCount: 1 });
    const res = await mod.createFirstAdmin(input);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.code).toBe("admin_exists");
    expect(res.httpStatus).toBe(409);
    // Nothing was inserted — the refusal happens first.
    expect(inserted).toEqual([]);
  });

  it("refuses with 503 when the administrator count is unknown, and writes nothing", async () => {
    const { mod, inserted } = await load({ superAdminCount: null });
    const res = await mod.createFirstAdmin(input);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.code).toBe("posture_unknown");
    expect(res.httpStatus).toBe(503);
    expect(inserted).toEqual([]);
  });

  it("reports a duplicate email as a clean 409 rather than a database error", async () => {
    const { mod } = await load({ superAdminCount: 0, insertThrows: { code: "23505" } });
    const res = await mod.createFirstAdmin(input);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.code).toBe("email_taken");
    expect(res.httpStatus).toBe(409);
    expect(res.message).toMatch(/nothing was changed/i);
  });

  it("DOES NOT REPORT SUCCESS IT COULD NOT CONFIRM — an unverifiable role assignment fails", async () => {
    const { mod } = await load({ superAdminCount: 0, verified: false });
    const res = await mod.createFirstAdmin(input);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.code).toBe("role_not_applied");
    expect(res.message).toMatch(/will not report success it could not confirm/i);
  });

  it("refuses when the SUPER_ADMIN role row does not exist, instead of creating a powerless account", async () => {
    const { mod } = await load({ superAdminCount: 0, roleExists: false });
    const res = await mod.createFirstAdmin(input);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.code).toBe("role_missing");
    expect(res.message).toMatch(/No user was created/i);
  });

  it("NEVER puts the plaintext password into any payload, success or failure", async () => {
    for (const opts of [
      { superAdminCount: 0 },
      { superAdminCount: 1 },
      { superAdminCount: 0, insertThrows: { code: "23505" } },
      { superAdminCount: 0, verified: false },
      { superAdminCount: 0, insertThrows: new Error("connection to server at hunter2 failed") },
    ]) {
      const { mod } = await load(opts);
      const res = await mod.createFirstAdmin(input);
      const payload = JSON.stringify(res);
      expect(payload).not.toContain("Str0ngPass");
      expect(payload).not.toMatch(/\$2[aby]\$/); // not the hash either
      expect(payload).not.toMatch(/\bat .*\.ts:\d+/); // no stack frames
    }
  });
});
