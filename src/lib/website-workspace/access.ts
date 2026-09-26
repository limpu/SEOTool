import { isSuperAdmin, userHasPermission } from "@/lib/rbac/queries";
import { checkAccess } from "@/lib/rbac/access";
import type { WorkspaceNavItem } from "./nav";

export type WorkspaceItemAccess = {
  /** Role/permission gate (Phase 14/15). If false, the item must not appear as a clickable nav item at all, and the route must deny directly. */
  authorized: boolean;
  /** Package/subscription gate (Phase 16/17). If authorized but not entitled, show an "upgrade required" state rather than the report. */
  entitled: boolean;
  /** authorized && entitled && implemented. */
  allowed: boolean;
};

/**
 * Resolves sidebar/route access for one workspace nav item using the EXACT
 * existing RBAC (Phase 14/15) + entitlement (Phase 16/17 `checkAccess()`)
 * helpers — no parallel/hard-coded permission list. SUPER_ADMIN bypasses the
 * package/entitlement gate (same invariant `ensureRbacSeed()` documents:
 * "No normal dashboard action may remove these privileges from
 * SUPER_ADMIN") since a platform Super Admin account is not expected to
 * carry a subscription package.
 */
export async function getWorkspaceItemAccess(
  userId: string,
  item: WorkspaceNavItem
): Promise<WorkspaceItemAccess> {
  if (!item.implemented) {
    return { authorized: false, entitled: false, allowed: false };
  }

  if (await isSuperAdmin(userId)) {
    return { authorized: true, entitled: true, allowed: true };
  }

  const authorized = await userHasPermission(userId, item.featureKey, item.action);
  if (!authorized) {
    return { authorized: false, entitled: false, allowed: false };
  }

  const result = await checkAccess(userId, item.featureKey, item.action);
  return { authorized: true, entitled: result.allowed, allowed: result.allowed };
}
