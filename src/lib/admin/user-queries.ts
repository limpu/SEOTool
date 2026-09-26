import { db } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

/**
 * The one and only column list admin user-management code is allowed to
 * select. Deliberately excludes `passwordHash` and anything token/secret-
 * shaped — read-v2.md §8: "Do not expose: password hashes, OTP hashes,
 * reset tokens, secrets." New columns added to `users` in the future must
 * be added here explicitly (opt-in), not inherited by a `select *`.
 */
const SAFE_USER_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  emailVerified: users.emailVerified,
  emailVerifiedAt: users.emailVerifiedAt,
  status: users.status,
  // `subscriptionPackage` (text) is Phase 14's deprecated stub, kept only so
  // historical data isn't silently dropped from admin responses.
  // `subscriptionPackageId` (Phase 16) is the real FK and the one every
  // write path now uses.
  subscriptionPackage: users.subscriptionPackage,
  subscriptionPackageId: users.subscriptionPackageId,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

export type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  status: "active" | "suspended" | "deleted";
  subscriptionPackage: string | null;
  subscriptionPackageId: string | null;
  createdAt: Date;
  updatedAt: Date;
  roles: { id: string; key: string; name: string }[];
};

export type ListUsersFilters = {
  search?: string;
  status?: "active" | "suspended" | "deleted";
  roleId?: string;
  page?: number;
  pageSize?: number;
};

export async function listUsers(
  filters: ListUsersFilters = {}
): Promise<{ users: AdminUserSummary[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

  const conditions = [];
  if (filters.search && filters.search.trim().length > 0) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term)));
  }
  if (filters.status) {
    conditions.push(eq(users.status, filters.status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  const rows = await db
    .select(SAFE_USER_COLUMNS)
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const userIds = rows.map((r) => r.id);
  const roleRows =
    userIds.length > 0
      ? await db
          .select({
            userId: userRoles.userId,
            roleId: roles.id,
            roleKey: roles.key,
            roleName: roles.name,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(inArray(userRoles.userId, userIds))
      : [];

  const rolesByUser = new Map<string, { id: string; key: string; name: string }[]>();
  for (const r of roleRows) {
    const list = rolesByUser.get(r.userId) ?? [];
    list.push({ id: r.roleId, key: r.roleKey, name: r.roleName });
    rolesByUser.set(r.userId, list);
  }

  let usersWithRoles = rows.map((r) => ({ ...r, roles: rolesByUser.get(r.id) ?? [] }));

  if (filters.roleId) {
    usersWithRoles = usersWithRoles.filter((u) => u.roles.some((role) => role.id === filters.roleId));
  }

  return { users: usersWithRoles, total: count };
}

export async function getUserById(userId: string): Promise<AdminUserSummary | null> {
  const [row] = await db.select(SAFE_USER_COLUMNS).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return null;

  const roleRows = await db
    .select({ id: roles.id, key: roles.key, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  return { ...row, roles: roleRows };
}

export async function setUserStatus(
  userId: string,
  status: "active" | "suspended"
): Promise<AdminUserSummary | null> {
  await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
  return getUserById(userId);
}

export async function updateUserProfile(
  userId: string,
  data: { name: string; email: string }
): Promise<AdminUserSummary | null> {
  await db
    .update(users)
    .set({ name: data.name, email: data.email, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return getUserById(userId);
}

/**
 * @deprecated Phase 14 stub-column writer. No UI calls this anymore as of
 * Phase 16 — kept only in case something still references the old text
 * field. New code should use `setUserSubscriptionPackage` below.
 */
export async function setUserSubscription(
  userId: string,
  subscriptionPackage: string | null
): Promise<AdminUserSummary | null> {
  await db
    .update(users)
    .set({ subscriptionPackage, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return getUserById(userId);
}

/**
 * Phase 16: assigns (or clears, with `null`) a user's real subscription
 * package via the FK. Does not validate the package is `active` — an admin
 * assigning an inactive package is unusual but not unsafe (it's a display/
 * entitlement pointer, not something that runs code yet), and blocking it
 * would need a policy decision this phase doesn't own.
 */
export async function setUserSubscriptionPackage(
  userId: string,
  packageId: string | null
): Promise<AdminUserSummary | null> {
  await db
    .update(users)
    .set({ subscriptionPackageId: packageId, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return getUserById(userId);
}

/**
 * Replaces a user's entire role assignment set. Phase 14 only ever wrote a
 * single row here; Phase 15 (Dynamic Roles & Privileges) extends this to
 * the full many-to-many `user_roles` shape the table was always designed
 * for — an admin can grant a user more than one role at once.
 */
export async function setUserRoles(userId: string, roleIds: string[]): Promise<void> {
  await db.delete(userRoles).where(eq(userRoles.userId, userId));
  const uniqueIds = Array.from(new Set(roleIds));
  if (uniqueIds.length > 0) {
    await db.insert(userRoles).values(uniqueIds.map((roleId) => ({ userId, roleId })));
  }
}

export { asc };
