import { db } from "@/lib/db";
import { features, permissions, rolePermissions, roles, userRoles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { PermissionAction } from "./feature-catalog";
import { SUPER_ADMIN_ROLE_KEY } from "./seed";

export type UserRoleSummary = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
};

/** All roles currently assigned to a user (a user may hold more than one). */
export async function getRolesForUser(userId: string): Promise<UserRoleSummary[]> {
  const rows = await db
    .select({
      id: roles.id,
      key: roles.key,
      name: roles.name,
      isSystem: roles.isSystem,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  return rows;
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const userRoleList = await getRolesForUser(userId);
  return userRoleList.some((r) => r.key === SUPER_ADMIN_ROLE_KEY);
}

/**
 * Checks whether a user holds a permission (featureKey, action) through any
 * role assigned to them. SUPER_ADMIN short-circuits to true without a join
 * (belt-and-suspenders for the "SUPER_ADMIN always has everything"
 * invariant — even if a role_permissions row were ever missing, SUPER_ADMIN
 * by role key alone is always sufficient).
 */
export async function userHasPermission(
  userId: string,
  featureKey: string,
  action: PermissionAction
): Promise<boolean> {
  const userRoleList = await getRolesForUser(userId);
  if (userRoleList.length === 0) return false;
  if (userRoleList.some((r) => r.key === SUPER_ADMIN_ROLE_KEY)) return true;

  const roleIds = userRoleList.map((r) => r.id);
  for (const roleId of roleIds) {
    const [row] = await db
      .select({ id: rolePermissions.id })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .innerJoin(features, eq(permissions.featureId, features.id))
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          eq(features.key, featureKey),
          eq(permissions.action, action)
        )
      )
      .limit(1);
    if (row) return true;
  }
  return false;
}

/** All roles in the system, for the role-assignment dropdown. */
export async function listAllRoles(): Promise<UserRoleSummary[]> {
  return db
    .select({ id: roles.id, key: roles.key, name: roles.name, isSystem: roles.isSystem })
    .from(roles)
    .orderBy(roles.name);
}
