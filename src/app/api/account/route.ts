import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, roles, userRoles } from "@/lib/db/schema";
import {
  getSession,
  verifyPassword,
  revokeAllUserSessions,
  clearSessionCookie,
  checkRateLimit,
} from "@/lib/auth";
import { deleteAccountSchema } from "@/lib/validation/auth";
import { SUPER_ADMIN_ROLE_KEY } from "@/lib/rbac/seed";
import { wouldRemoveLastSuperAdmin } from "@/lib/rbac/super-admin-guard";

/**
 * Stage 5 — self-service account deletion. `DELETE /api/account`, matching
 * the `/api/account/profile`, `/api/account/email-change/*` prefix Stage 3
 * established, but at the bare `/api/account` path itself since this acts
 * on the account as a whole, not one sub-resource of it.
 *
 * This is a genuine, real hard-delete — deliberately different from the
 * admin panel's "never hard-delete other users, suspend instead" rule
 * (`status/route.ts`). That rule exists to protect OTHER users' data from
 * an admin's mistake or malice; this route only ever deletes the row of the
 * user who is themselves, currently, authenticated, re-entering their own
 * password. That is the legitimate, distinct case the original spec called
 * out.
 *
 * Guard order (all three must pass before anything is written/deleted —
 * this route performs exactly one write: the sessions revoke immediately
 * followed by the DELETE, both only after every check below succeeds):
 *   1. Authenticated (401 otherwise).
 *   2. Rate-limited (429 otherwise) — reuses `checkRateLimit`.
 *   3. Body validates (`deleteAccountSchema` — a single `password` field,
 *      400 otherwise).
 *   4. Current password re-verified via `verifyPassword` — the EXACT same
 *      function `change-password/route.ts` calls (`bcrypt.compare` against
 *      `users.passwordHash`), not a re-implementation (400 on mismatch).
 *   5. Not the platform's last SUPER_ADMIN — reuses
 *      `wouldRemoveLastSuperAdmin` from `@/lib/rbac/super-admin-guard`, the
 *      exact same underlying `countActiveSuperAdmins` query
 *      `status/route.ts` and `role/route.ts` already use for their own
 *      "last SUPER_ADMIN" guards (409 otherwise).
 *
 * Only once all four pass does the route revoke every session for this
 * user (so a stale cookie can never reference a row that's about to stop
 * existing) and then issue the real `DELETE FROM users WHERE id = ...`.
 * Every other table (`websites`, `crawl_runs`, `pages`, `gsc_connections`,
 * `google_analytics_connections`, `sessions`, `user_roles`, etc.) cascades
 * automatically — confirmed live against `information_schema` before this
 * route was written (every FK from those tables back to `users`/`websites`
 * is `ON DELETE CASCADE` at the actual Postgres level, not just in the
 * Drizzle schema source), and confirmed again below via the live
 * before/after row-count test in read.md's Stage 5 write-up. No cascade
 * cleanup logic is reimplemented here — the single `DELETE` is the whole
 * operation.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const rl = await checkRateLimit(session.userId, "delete_account");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
      return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    const roleRows = await db
      .select({ key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));
    const isSuperAdmin = roleRows.some((r) => r.key === SUPER_ADMIN_ROLE_KEY);

    if (await wouldRemoveLastSuperAdmin(isSuperAdmin)) {
      return NextResponse.json(
        { error: "Cannot delete the last remaining Super Admin account." },
        { status: 409 }
      );
    }

    // All guards passed — nothing has been written or deleted until this
    // point. Revoke sessions first, then delete the row; either way no
    // stale cookie can authenticate against a user that no longer exists.
    await revokeAllUserSessions(user.id);
    await db.delete(users).where(eq(users.id, user.id));
    await clearSessionCookie();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("delete-account error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
