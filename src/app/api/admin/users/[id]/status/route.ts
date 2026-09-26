import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import { getUserById, setUserStatus } from "@/lib/admin/user-queries";
import { setUserStatusSchema } from "@/lib/validation/admin-user";
import { SUPER_ADMIN_ROLE_KEY } from "@/lib/rbac/seed";
import { countActiveSuperAdmins } from "@/lib/rbac/super-admin-guard";

const idSchema = z.string().uuid();

// countActiveSuperAdmins moved to src/lib/rbac/super-admin-guard.ts (Stage 5)
// so self-service account deletion can reuse the exact same "last
// SUPER_ADMIN" query instead of a third local copy. Behavior unchanged.

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
  const parsed = setUserStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const isTargetSuperAdmin = existing.roles.some((r) => r.key === SUPER_ADMIN_ROLE_KEY);
  if (isTargetSuperAdmin && parsed.data.status === "suspended") {
    const activeSuperAdmins = await countActiveSuperAdmins();
    if (activeSuperAdmins <= 1) {
      return NextResponse.json(
        { error: "Cannot deactivate the last remaining Super Admin." },
        { status: 409 }
      );
    }
  }

  const updated = await setUserStatus(id, parsed.data.status);
  return NextResponse.json({ user: updated });
}
