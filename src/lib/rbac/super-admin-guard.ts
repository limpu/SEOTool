import { db } from "@/lib/db";
import { userRoles, roles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SUPER_ADMIN_ROLE_KEY } from "./seed";

/**
 * Stage 5 extraction. This function previously existed as two byte-identical
 * private copies — one in `src/app/api/admin/users/[id]/status/route.ts`
 * (blocks deactivating the last SUPER_ADMIN) and one in
 * `src/app/api/admin/users/[id]/role/route.ts` (blocks reassigning the last
 * SUPER_ADMIN away from the role). Self-service account deletion (Stage 5)
 * needs the exact same guard for a third case — a SUPER_ADMIN deleting their
 * own account — so rather than adding a THIRD copy, this pulls the query out
 * to one shared module and both existing routes now import it instead of
 * defining their own local copy. No behavior change to either route: same
 * SQL, same `Set(userId)` de-dup, same result.
 */
export async function countActiveSuperAdmins(): Promise<number> {
  const rows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(roles.key, SUPER_ADMIN_ROLE_KEY));
  return new Set(rows.map((r) => r.userId)).size;
}

/**
 * Pure comparison, extracted from the async DB call so it can be unit
 * tested directly (same "extract the decision logic" pattern Stage 3/4
 * used for the OTP state machine and `selectSessionsToRevoke`). Given
 * whether the target user currently holds SUPER_ADMIN and how many active
 * SUPER_ADMINs the platform currently has, decides whether the pending
 * operation (suspend / role-reassign / self-delete) would remove the last
 * one.
 */
export function isLastSuperAdmin(
  isTargetCurrentlySuperAdmin: boolean,
  activeSuperAdminCount: number
): boolean {
  return isTargetCurrentlySuperAdmin && activeSuperAdminCount <= 1;
}

/**
 * True when `isTargetCurrentlySuperAdmin` is true AND removing that role /
 * deleting that account would leave the platform with zero active
 * SUPER_ADMINs. Callers pass in whichever "is this user a SUPER_ADMIN who
 * is about to stop being one" condition applies to their own operation
 * (suspend / role-reassign / self-delete) — this function owns the "would
 * that be the LAST one" count-and-compare part, which must stay identical
 * everywhere it's checked.
 */
export async function wouldRemoveLastSuperAdmin(isTargetCurrentlySuperAdmin: boolean): Promise<boolean> {
  if (!isTargetCurrentlySuperAdmin) return false;
  const activeSuperAdmins = await countActiveSuperAdmins();
  return isLastSuperAdmin(isTargetCurrentlySuperAdmin, activeSuperAdmins);
}
