import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { getPgErrorCode } from "@/lib/db/pg-error";
import { ensureRbacSeed, SUPER_ADMIN_ROLE_KEY } from "@/lib/rbac/seed";
import { isSuperAdmin } from "@/lib/rbac/queries";
import { emailSchema, passwordSchema } from "@/lib/validation/auth";
import { collectAdminPosture } from "../checks";
import { sanitizeError } from "../redact";

/**
 * Web Installer — Stage 2. Creating the FIRST SUPER_ADMIN, and only ever the
 * first one.
 *
 * ─── THE RULE THIS MODULE ENFORCES ──────────────────────────────────────
 * The installer may create the first administrator. It may never create a
 * second, never replace one, and never modify one. That is the second,
 * independent safety net described in Stage 1's `state.ts`: even in a state
 * where the installation lock somehow read `not_complete` on a live system,
 * this refusal means the installer still cannot mint an administrator
 * alongside existing ones — so it can never become an authentication bypass
 * for a running platform.
 *
 * The refusal is checked against the DATABASE (a live count of accounts
 * holding SUPER_ADMIN), not against installer step state, because step state
 * is a record of what the wizard did and the question here is what is
 * actually true. A `null` count means the database could not be read, and a
 * null is NEVER treated as zero — "we could not count the administrators" is
 * not "there are no administrators", and collapsing the two is precisely how
 * an outage would become a free admin account.
 *
 * ─── NOTHING IS REIMPLEMENTED ───────────────────────────────────────────
 * Password hashing is `src/lib/auth/password.ts` (bcrypt, 12 rounds).
 * Validation is `src/lib/validation/auth.ts` (`emailSchema`, `passwordSchema`)
 * — the same rules the real registration form enforces, so the account the
 * installer creates could equally have been created by the app itself. Role
 * assignment goes through the existing `roles` / `user_roles` tables after
 * `ensureRbacSeed()`, exactly as `POST /api/admin/users` does. Verification
 * that the role landed uses `isSuperAdmin()` from `src/lib/rbac/queries.ts`.
 *
 * ─── THE ACCOUNT IS PRE-VERIFIED ────────────────────────────────────────
 * `emailVerified: true`. The manual SQL bootstrap this replaces already did
 * this, and it is necessary rather than convenient: the OTP that would
 * otherwise be required is delivered by SMTP, and SMTP is optional and
 * frequently not yet configured at the moment the first admin is created. An
 * administrator who cannot log in because the mail server they were about to
 * configure is not configured yet is a deadlock, not a security control.
 */

export const installAdminSchema = z.object({
  name: z.string().min(1, "Please enter a name for the administrator.").max(255, "Name is too long.").trim(),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Please confirm the password."),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export type InstallAdminInput = z.infer<typeof installAdminSchema>;

export type AdminBootstrapResult =
  | {
      ok: true;
      userId: string;
      email: string;
      name: string;
      /** Proven by re-reading the role assignment, not assumed from the write. */
      superAdminVerified: true;
      message: string;
    }
  | {
      ok: false;
      httpStatus: number;
      code:
        | "admin_exists"
        | "posture_unknown"
        | "email_taken"
        | "role_missing"
        | "role_not_applied"
        | "error";
      message: string;
      howToFix: string[];
    };

/**
 * Pure policy: may the installer create an administrator right now?
 *
 * Extracted from the I/O so the refusal itself is directly unit-testable —
 * the same "extract the decision" shape `isInstallerActionPermitted` uses.
 */
export function evaluateAdminCreationAllowed(
  superAdminCount: number | null
): { allowed: boolean; code: "ok" | "admin_exists" | "posture_unknown"; httpStatus: number; message: string; howToFix: string[] } {
  if (superAdminCount === null) {
    return {
      allowed: false,
      code: "posture_unknown",
      httpStatus: 503,
      message:
        "The number of existing administrators could not be read from the database, so the installer will not create one. An unconfirmed count is never treated as zero.",
      howToFix: [
        "Fix the database connection, then re-run this step.",
        "This refusal is deliberate: if a brief outage were treated as 'no administrators exist', the installer would create an extra administrator on a live platform.",
      ],
    };
  }
  if (superAdminCount > 0) {
    return {
      allowed: false,
      code: "admin_exists",
      httpStatus: 409,
      message: `${superAdminCount} administrator account(s) already exist. The installer creates the FIRST administrator only — it will never create a second one, and it will never replace or modify an existing one.`,
      howToFix: [
        "Sign in with the existing administrator account.",
        "Additional administrators are created from Admin → Users inside the application, where the action is authenticated and audited.",
        "If the existing administrator's password has been lost, use the application's password-reset flow rather than the installer.",
      ],
    };
  }
  return {
    allowed: true,
    code: "ok",
    httpStatus: 200,
    message: "No administrator exists yet — the installer may create the first one.",
    howToFix: [],
  };
}

/**
 * Create the first SUPER_ADMIN.
 *
 * The plaintext password is used for exactly one thing — hashing — and is
 * never returned, never logged, never stored, and never placed in any error
 * message. `sanitizeError` additionally covers the case of a driver echoing
 * a parameter back inside a message.
 */
export async function createFirstAdmin(
  input: InstallAdminInput
): Promise<AdminBootstrapResult> {
  const posture = await collectAdminPosture();
  const decision = evaluateAdminCreationAllowed(posture.superAdminCount);
  if (!decision.allowed) {
    return {
      ok: false,
      httpStatus: decision.httpStatus,
      code: decision.code === "admin_exists" ? "admin_exists" : "posture_unknown",
      message: decision.message,
      howToFix: decision.howToFix,
    };
  }

  // Seed roles/permissions first — the SUPER_ADMIN role row must exist before
  // it can be assigned, and this seed is idempotent by design.
  try {
    await ensureRbacSeed();
  } catch (err) {
    return {
      ok: false,
      httpStatus: 500,
      code: "error",
      message: `The roles and permissions catalog could not be prepared: ${sanitizeError(err)}`,
      howToFix: [
        "Confirm every migration has been applied — the roles, permissions and features tables must exist.",
        "Re-run the database schema step, then try again.",
      ],
    };
  }

  const [superAdminRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, SUPER_ADMIN_ROLE_KEY))
    .limit(1);

  if (!superAdminRole) {
    return {
      ok: false,
      httpStatus: 500,
      code: "role_missing",
      message:
        "The SUPER_ADMIN role does not exist in the database, so no account can be given it. No user was created.",
      howToFix: [
        "Apply every pending migration, then re-run this step — the role catalog is seeded automatically once its tables exist.",
      ],
    };
  }

  const passwordHash = await hashPassword(input.password);

  let created: { id: string } | undefined;
  try {
    [created] = await db
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        // Pre-verified — see the module header. The same thing the manual SQL
        // bootstrap did, and the same thing `POST /api/admin/users` does for
        // an admin-created account.
        emailVerified: true,
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return {
        ok: false,
        httpStatus: 409,
        code: "email_taken",
        message:
          "An account with this email address already exists. No account was created and nothing was changed.",
        howToFix: [
          "Use a different email address for the administrator account.",
          "If this address belongs to an existing account that should be the administrator, sign in as it — the installer never modifies an account it did not create.",
        ],
      };
    }
    return {
      ok: false,
      httpStatus: 500,
      code: "error",
      message: `The administrator account could not be created: ${sanitizeError(err)}`,
      howToFix: [
        "Confirm the database is reachable and every migration has been applied.",
        "Re-run this step. No partial account is left behind by a failed insert.",
      ],
    };
  }

  if (!created) {
    return {
      ok: false,
      httpStatus: 500,
      code: "error",
      message: "The administrator account could not be created — the database returned no row.",
      howToFix: ["Re-run this step. If it keeps failing, check the application's server log."],
    };
  }

  try {
    await db.insert(userRoles).values({ userId: created.id, roleId: superAdminRole.id });
  } catch (err) {
    return {
      ok: false,
      httpStatus: 500,
      code: "role_not_applied",
      message: `The account was created but the SUPER_ADMIN role could not be assigned: ${sanitizeError(err)}`,
      howToFix: [
        "The account exists but has no administrative privileges, so it cannot manage the platform yet.",
        "Assign the SUPER_ADMIN role to it directly in the database, or delete the account and re-run this step.",
        "The installer will not silently retry — an account that half-exists must be resolved deliberately.",
      ],
    };
  }

  // VERIFY, rather than assume. The write above returning without throwing is
  // not proof the role is readable through the same path the application uses
  // to authorise requests. `isSuperAdmin` is that exact path.
  const verified = await isSuperAdmin(created.id).catch(() => false);
  if (!verified) {
    return {
      ok: false,
      httpStatus: 500,
      code: "role_not_applied",
      message:
        "The account and the role assignment were written, but re-reading the account did not show it holding SUPER_ADMIN. The installer will not report success it could not confirm.",
      howToFix: [
        "Check that the roles, user_roles and permissions tables are intact and that every migration has been applied.",
        "Verify the assignment directly: `SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = '<id>';`",
      ],
    };
  }

  return {
    ok: true,
    userId: created.id,
    email: input.email,
    name: input.name,
    superAdminVerified: true,
    message:
      "The administrator account was created, the SUPER_ADMIN role was assigned, and the assignment was verified by re-reading it. The account is email-verified and can sign in immediately.",
  };
}
