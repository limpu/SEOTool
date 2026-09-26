import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import { getRoleWithPermissions, updateRole, deleteRole } from "@/lib/rbac/role-admin";
import { roleFormSchema } from "@/lib/validation/admin-role";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { getPgErrorCode } from "@/lib/db/pg-error";

const idSchema = z.string().uuid();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "roles", "view"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Role not found." }, { status: 404 });
  }

  await ensureRbacSeed();
  const result = await getRoleWithPermissions(id);
  if (!result) {
    return NextResponse.json({ error: "Role not found." }, { status: 404 });
  }
  return NextResponse.json(result);
}

/**
 * Updates a role's name/description/permission matrix. SUPER_ADMIN is
 * refused by `updateRole()` itself (403) — this route does not special-case
 * it beyond passing through that result, so there is exactly one place in
 * the codebase that decides SUPER_ADMIN is untouchable.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "roles", "edit"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Role not found." }, { status: 404 });
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
    const result = await updateRole(id, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json(
        { error: "A role with this name (or the key it maps to) already exists." },
        { status: 409 }
      );
    }
    throw err;
  }

  const updated = await getRoleWithPermissions(id);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "roles", "delete"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Role not found." }, { status: 404 });
  }

  await ensureRbacSeed();
  const result = await deleteRole(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
