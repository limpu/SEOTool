import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import { listAllRoles } from "@/lib/rbac/queries";
import { createRole } from "@/lib/rbac/role-admin";
import { roleFormSchema } from "@/lib/validation/admin-role";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { getPgErrorCode } from "@/lib/db/pg-error";

/** Lightweight role list — used by role-assignment dropdowns/checklists (unchanged shape from Phase 14). */
export async function GET() {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "users", "view"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await ensureRbacSeed();
  const roleList = await listAllRoles();
  return NextResponse.json({ roles: roleList });
}

/** Creates a new dynamic role with its permission matrix (read-v2.md §10). */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "roles", "create"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await ensureRbacSeed();

  const body = await req.json().catch(() => null);
  const parsed = roleFormSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  try {
    const role = await createRole(parsed.data);
    return NextResponse.json({ role }, { status: 201 });
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json(
        { error: "A role with this name (or the key it maps to) already exists." },
        { status: 409 }
      );
    }
    throw err;
  }
}
