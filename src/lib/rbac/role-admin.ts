import { db } from "@/lib/db";
import { features, permissions, roles, rolePermissions, userRoles } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { FEATURE_CATALOG, type PermissionAction } from "./feature-catalog";
import { SUPER_ADMIN_ROLE_KEY } from "./seed";

/**
 * Phase 15 — Dynamic Roles & Privileges. Role create/edit/delete plus the
 * feature x action permission matrix (read-v2.md §10/§11), built on top of
 * the `roles`/`permissions`/`role_permissions` tables Phase 14 already
 * created. No schema change was needed — Phase 14 designed those tables to
 * be many-to-many and CRUD-ready from the start.
 */

export type RoleSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
};

export type FeatureGrant = { featureKey: string; actions: PermissionAction[] };

export type RoleWithPermissions = {
  role: { id: string; key: string; name: string; description: string | null; isSystem: boolean };
  permissionMatrix: FeatureGrant[];
};

/** Role list for the /admin/roles screen, including how many users hold each role. */
export async function listRolesWithCounts(): Promise<RoleSummary[]> {
  const roleRows = await db.select().from(roles).orderBy(roles.name);
  const countRows = await db
    .select({ roleId: userRoles.roleId, count: sql<number>`count(*)::int` })
    .from(userRoles)
    .groupBy(userRoles.roleId);
  const countMap = new Map(countRows.map((r) => [r.roleId, r.count]));
  return roleRows.map((r) => ({ ...r, userCount: countMap.get(r.id) ?? 0 }));
}

/** A single role plus its full permission matrix, one row per catalog feature (even ungranted ones). */
export async function getRoleWithPermissions(roleId: string): Promise<RoleWithPermissions | null> {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) return null;

  const grantRows = await db
    .select({ featureKey: features.key, action: permissions.action })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .innerJoin(features, eq(permissions.featureId, features.id))
    .where(eq(rolePermissions.roleId, roleId));

  const byFeature = new Map<string, PermissionAction[]>();
  for (const row of grantRows) {
    const list = byFeature.get(row.featureKey) ?? [];
    list.push(row.action);
    byFeature.set(row.featureKey, list);
  }

  const permissionMatrix: FeatureGrant[] = FEATURE_CATALOG.map((f) => ({
    featureKey: f.key,
    actions: byFeature.get(f.key) ?? [],
  }));

  return { role, permissionMatrix };
}

/** Derives a stable, uppercase, underscore role key from an admin-entered display name. */
export function deriveRoleKey(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

/**
 * Replaces a role's entire granted permission set with exactly the given
 * matrix. Looks up permission ids by (featureKey, action) so callers only
 * ever deal in catalog keys, never raw permission uuids.
 */
async function applyPermissionMatrix(roleId: string, grants: FeatureGrant[]): Promise<void> {
  const permRows = await db
    .select({ id: permissions.id, featureKey: features.key, action: permissions.action })
    .from(permissions)
    .innerJoin(features, eq(permissions.featureId, features.id));

  const idFor = new Map<string, string>();
  for (const p of permRows) idFor.set(`${p.featureKey}:${p.action}`, p.id);

  const wantedIds = new Set<string>();
  for (const grant of grants) {
    for (const action of grant.actions) {
      const id = idFor.get(`${grant.featureKey}:${action}`);
      if (id) wantedIds.add(id);
    }
  }

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  for (const permissionId of wantedIds) {
    await db
      .insert(rolePermissions)
      .values({ roleId, permissionId })
      .onConflictDoNothing({ target: [rolePermissions.roleId, rolePermissions.permissionId] });
  }
}

export async function createRole(input: {
  name: string;
  description: string | null;
  permissions: FeatureGrant[];
}): Promise<{ id: string; key: string; name: string }> {
  const key = deriveRoleKey(input.name);
  const [role] = await db
    .insert(roles)
    .values({ key, name: input.name, description: input.description, isSystem: false })
    .returning({ id: roles.id, key: roles.key, name: roles.name });
  await applyPermissionMatrix(role.id, input.permissions);
  return role;
}

export type UpdateRoleResult = { ok: true } | { ok: false; error: string; status: number };

/**
 * Updates a role's name/description/permissions. SUPER_ADMIN is refused
 * outright (read-v2.md §9: "No normal dashboard action may remove these
 * privileges from SUPER_ADMIN" — the simplest way to guarantee that is to
 * never let this editor touch it at all, not just its permission set).
 */
export async function updateRole(
  roleId: string,
  input: { name: string; description: string | null; permissions: FeatureGrant[] }
): Promise<UpdateRoleResult> {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) return { ok: false, error: "Role not found.", status: 404 };
  if (role.key === SUPER_ADMIN_ROLE_KEY) {
    return { ok: false, error: "SUPER_ADMIN cannot be edited.", status: 403 };
  }

  await db
    .update(roles)
    .set({ name: input.name, description: input.description, updatedAt: new Date() })
    .where(eq(roles.id, roleId));
  await applyPermissionMatrix(roleId, input.permissions);
  return { ok: true };
}

export type DeleteRoleResult = { ok: true } | { ok: false; error: string; status: number };

/**
 * Deletes a custom role. Refuses any system role (SUPER_ADMIN and USER —
 * read-v2.md §9's "non-deletable" rule for SUPER_ADMIN; USER is also
 * protected because it's the default role new registrations depend on, see
 * `POST /api/auth/register`) and refuses a role that's still assigned to
 * one or more users, so deleting a role can never silently strip a user's
 * only role out from under them.
 */
export async function deleteRole(roleId: string): Promise<DeleteRoleResult> {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) return { ok: false, error: "Role not found.", status: 404 };
  if (role.isSystem) {
    const msg =
      role.key === SUPER_ADMIN_ROLE_KEY ? "SUPER_ADMIN cannot be deleted." : "System roles cannot be deleted.";
    return { ok: false, error: msg, status: 403 };
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userRoles)
    .where(eq(userRoles.roleId, roleId));
  if (count > 0) {
    return {
      ok: false,
      error: `Cannot delete: this role is currently assigned to ${count} user(s).`,
      status: 409,
    };
  }

  await db.delete(roles).where(eq(roles.id, roleId));
  return { ok: true };
}
