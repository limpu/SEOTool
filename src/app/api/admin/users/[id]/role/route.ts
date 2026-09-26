import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import { getUserById, setUserRoles } from "@/lib/admin/user-queries";
import { assignRolesSchema } from "@/lib/validation/admin-user";
import { db } from "@/lib/db";
import { roles } from "@/lib/db/schema";
import { SUPER_ADMIN_ROLE_KEY } from "@/lib/rbac/seed";
import { countActiveSuperAdmins } from "@/lib/rbac/super-admin-guard";

const idSchema = z.string().uuid();

// countActiveSuperAdmins moved to src/lib/rbac/super-admin-guard.ts (Stage 5),
// shared with status/route.ts and the new self-service account-deletion
// route. Behavior unchanged.

/**
 * Phase 15: multi-role assignment (`{roleIds: string[]}`), replacing Phase
 * 14's single-roleId body. Still enforces the same "last SUPER_ADMIN" guard
 * — dropping SUPER_ADMIN out of a user's new role set is treated exactly
 * like Phase 14's "reassign away from SUPER_ADMIN" case.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "users", "edit"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const existing = await getUserById(id);
  if (!existing) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = assignRolesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please select at least one valid role, or none." }, { status: 400 });
  }

  const roleIds = Array.from(new Set(parsed.data.roleIds));
  let targetRoles: { id: string; key: string }[] = [];
  if (roleIds.length > 0) {
    targetRoles = await db.select({ id: roles.id, key: roles.key }).from(roles).where(inArray(roles.id, roleIds));
    if (targetRoles.length !== roleIds.length) {
      return NextResponse.json({ error: "One or more selected roles were not found." }, { status: 404 });
    }
  }

  const isCurrentlySuperAdmin = existing.roles.some((r) => r.key === SUPER_ADMIN_ROLE_KEY);
  const wouldRemainSuperAdmin = targetRoles.some((r) => r.key === SUPER_ADMIN_ROLE_KEY);
  if (isCurrentlySuperAdmin && !wouldRemainSuperAdmin) {
    const activeSuperAdmins = await countActiveSuperAdmins();
    if (activeSuperAdmins <= 1) {
      return NextResponse.json(
        { error: "Cannot remove Super Admin from the last remaining Super Admin." },
        { status: 409 }
      );
    }
  }

  await setUserRoles(id, roleIds);
  const updated = await getUserById(id);
  return NextResponse.json({ user: updated });
}
