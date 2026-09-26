import { redirect } from "next/navigation";
import { requireCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { ensureRbacSeed } from "./seed";
import { isSuperAdmin, userHasPermission } from "./queries";
import type { PermissionAction } from "./feature-catalog";

export type AdminUser = CurrentUser & { isSuperAdmin: true };

/**
 * Server-Component guard for admin pages: requires a logged-in user (same
 * DB-backed, revocation-aware check as `requireCurrentUser`) AND that the
 * user holds SUPER_ADMIN or the given feature permission. Redirects to
 * `/dashboard` (not a 404/blank page) when authenticated but unauthorized,
 * so a regular user gets a normal navigation rather than a dead end.
 */
export async function requireAdminAccess(
  featureKey: string,
  action: PermissionAction = "view"
): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  await ensureRbacSeed();

  const allowed =
    (await isSuperAdmin(user.id)) || (await userHasPermission(user.id, featureKey, action));

  if (!allowed) {
    redirect("/dashboard");
  }

  return user;
}

/**
 * Route Handler variant: returns `null` (caller responds 401/403) instead of
 * redirecting, since API routes must return JSON, not a redirect response.
 */
export async function getAdminUserOrNull(
  currentUserId: string | null,
  featureKey: string,
  action: PermissionAction = "view"
): Promise<boolean> {
  if (!currentUserId) return false;
  await ensureRbacSeed();
  if (await isSuperAdmin(currentUserId)) return true;
  return userHasPermission(currentUserId, featureKey, action);
}
