import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import { removePackageLimit } from "@/lib/rbac/limit-admin";

const idSchema = z.string().uuid();

/** Removes a package's assigned limit for one resource ("Remove" in the admin UI). `packages`/`edit` required. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; limitDefinitionId: string }> }
) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "edit"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id, limitDefinitionId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(limitDefinitionId).success) {
    return NextResponse.json({ error: "Package limit not found." }, { status: 404 });
  }

  const result = await removePackageLimit(id, limitDefinitionId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
