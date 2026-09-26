import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import { getPackageWithFeatures, setPackageFeatures } from "@/lib/rbac/package-admin";
import { packageFeaturesFormSchema } from "@/lib/validation/admin-package";

const idSchema = z.string().uuid();

/**
 * Package Feature Management (read-v2.md §11): toggles which catalog
 * features are ON/OFF for a package. Full-replace, same pattern as Phase
 * 15's `PATCH /api/admin/roles/[id]` permission matrix. `packages`/`edit`
 * required — feature entitlement is part of editing the package, not a
 * separate permission.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "edit"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = packageFeaturesFormSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  const result = await setPackageFeatures(id, parsed.data.features);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const updated = await getPackageWithFeatures(id);
  return NextResponse.json(updated);
}
