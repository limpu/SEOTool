import { db } from "@/lib/db";
import { features, permissions, roles, rolePermissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { FEATURE_CATALOG, PERMISSION_ACTIONS } from "./feature-catalog";

export const SUPER_ADMIN_ROLE_KEY = "SUPER_ADMIN";
export const USER_ROLE_KEY = "USER";

/**
 * Idempotent RBAC seed: upserts the feature catalog, a permission row for
 * every (feature, action) pair, and the two mandatory system roles.
 *
 * SUPER_ADMIN (read-v2.md §9) is granted every permission that exists at
 * seed time AND any permission added later (a new feature added to the
 * catalog and re-seeded is automatically granted to SUPER_ADMIN here) —
 * this is what "No normal dashboard action may remove these privileges
 * from SUPER_ADMIN" is built on: the invariant is enforced by this seed
 * routine re-asserting full grant, not by relying on nobody ever touching
 * the role_permissions rows by hand.
 *
 * USER is a system role with zero permissions — the default role assigned
 * to every self-registered account. It exists so every user has *a* role
 * to belong to, not because it grants anything.
 *
 * Called at the start of every admin RBAC/user-management request (cheap —
 * a few dozen small upserts), same pattern as `ensureSeoRules()`.
 */
export async function ensureRbacSeed(): Promise<void> {
  const featureIdByKey = new Map<string, string>();

  for (const f of FEATURE_CATALOG) {
    const [row] = await db
      .insert(features)
      .values({ key: f.key, name: f.name, description: f.description, sortOrder: f.sortOrder })
      .onConflictDoUpdate({
        target: features.key,
        set: { name: f.name, description: f.description, sortOrder: f.sortOrder },
      })
      .returning({ id: features.id, key: features.key });
    featureIdByKey.set(row.key, row.id);
  }

  const permissionIds: string[] = [];
  for (const featureId of featureIdByKey.values()) {
    for (const action of PERMISSION_ACTIONS) {
      const [row] = await db
        .insert(permissions)
        .values({ featureId, action })
        .onConflictDoNothing({ target: [permissions.featureId, permissions.action] })
        .returning({ id: permissions.id });

      if (row) {
        permissionIds.push(row.id);
      } else {
        const [existing] = await db
          .select({ id: permissions.id })
          .from(permissions)
          .where(eq(permissions.featureId, featureId));
        if (existing) permissionIds.push(existing.id);
      }
    }
  }

  const [superAdminRole] = await db
    .insert(roles)
    .values({
      key: SUPER_ADMIN_ROLE_KEY,
      name: "Super Admin",
      description: "Full access to every feature and action. Cannot be restricted.",
      isSystem: true,
    })
    .onConflictDoUpdate({
      target: roles.key,
      set: { name: "Super Admin", isSystem: true, updatedAt: new Date() },
    })
    .returning({ id: roles.id });

  await db
    .insert(roles)
    .values({
      key: USER_ROLE_KEY,
      name: "User",
      description: "Default role for self-registered accounts. No admin permissions.",
      isSystem: true,
    })
    .onConflictDoUpdate({
      target: roles.key,
      set: { name: "User", isSystem: true, updatedAt: new Date() },
    });

  // Re-fetch the full, current permission set (not just newly-inserted rows
  // from this call) so SUPER_ADMIN always ends up with literally everything.
  const allPermissions = await db.select({ id: permissions.id }).from(permissions);
  for (const p of allPermissions) {
    await db
      .insert(rolePermissions)
      .values({ roleId: superAdminRole.id, permissionId: p.id })
      .onConflictDoNothing({ target: [rolePermissions.roleId, rolePermissions.permissionId] });
  }
}
